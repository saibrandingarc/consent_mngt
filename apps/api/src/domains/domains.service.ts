import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Repositories } from '@cmp/database';
import type { CurrentUser } from '@cmp/types';
import type { CreateDomainInput } from '@cmp/validation';
import { DOMAIN_CONFIG } from '@cmp/config';
import { REPOS } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { assertSameOrganization } from '../common/guards/tenant.guard';
import { DomainVerificationService } from './domain-verification.service';
import {
  buildInstallationChecks,
  summarizeChecks,
  type SdkHeartbeatPayload,
  type ValidationCheck,
} from './installation-checks';
import { toDomainResponse, type DomainResponse } from './domain-response';
import type { AuditMeta } from '../organizations/organizations.service';

export type { ValidationCheck } from './installation-checks';

export interface ValidationHistoryItem {
  id: string;
  domainId: string;
  organizationId: string;
  overallStatus: 'PASS' | 'WARNING' | 'FAIL';
  checks: unknown;
  createdAt: Date;
}

@Injectable()
export class DomainsService {
  constructor(
    @Inject(REPOS) private readonly repos: Repositories,
    private readonly auditService: AuditService,
    private readonly verificationService: DomainVerificationService,
  ) {}

  async list(user: CurrentUser): Promise<DomainResponse[]> {
    this.requireOrg(user);
    const domains = await this.repos.domains.listByOrganization(user.organizationId!);
    return domains.map(toDomainResponse);
  }

  async get(user: CurrentUser, id: string): Promise<DomainResponse> {
    const domain = await this.getDomainForUser(user, id);
    return toDomainResponse(domain);
  }

  async create(user: CurrentUser, input: CreateDomainInput, meta: AuditMeta): Promise<DomainResponse> {
    this.requireOrg(user);
    try {
      const domain = await this.repos.domains.create({
        organizationId: user.organizationId!,
        hostname: input.hostname,
        domainType: input.domainType,
        isProduction: input.isProduction,
        groupName: input.groupName,
        scanLimit: input.scanLimit,
        environment: input.environment,
        region: input.region,
        autoBlocking: input.autoBlocking,
        debugMode: input.debugMode,
      });

      await this.auditService.log({
        userId: user.id,
        organizationId: user.organizationId,
        action: 'domain.created',
        module: 'domain',
        newValue: { id: domain.id, hostname: domain.hostname, domainKey: domain.domainKey },
        ...meta,
      });

      await this.repos.organizations.update(user.organizationId!, {
        onboardingStep: Math.max(5, (await this.repos.organizations.findById(user.organizationId!))?.onboardingStep ?? 0),
      });

      if (DOMAIN_CONFIG.autoVerifyOnCreate) {
        const verified = await this.repos.domains.markVerified(domain.id, 'MANUAL');
        await this.auditService.log({
          userId: user.id,
          organizationId: user.organizationId,
          action: 'domain.auto_verified',
          module: 'domain',
          newValue: { id: domain.id, hostname: domain.hostname, reason: 'trusted_org_registration' },
          ...meta,
        });
        return toDomainResponse(verified);
      }

      return toDomainResponse(domain);
    } catch (error) {
      if (error instanceof Error && error.message === 'DOMAIN_EXISTS') {
        throw new BadRequestException({ code: 'DOMAIN_EXISTS', message: 'Domain is already registered' });
      }
      throw error;
    }
  }

  async update(user: CurrentUser, id: string, input: Partial<CreateDomainInput>, meta: AuditMeta): Promise<DomainResponse> {
    const existing = await this.getDomainForUser(user, id);

    let nextScanAt: Date | null | undefined;
    if (input.scanFrequency && input.scanFrequency !== existing.scanFrequency) {
      nextScanAt = nextScanAtFromFrequency(input.scanFrequency);
    }

    const updated = await this.repos.domains.update(id, { ...input, nextScanAt });

    await this.auditService.log({
      userId: user.id,
      organizationId: user.organizationId,
      action: 'domain.updated',
      module: 'domain',
      previousValue: existing,
      newValue: updated,
      ...meta,
    });

    return toDomainResponse(updated);
  }

  async remove(user: CurrentUser, id: string, meta: AuditMeta): Promise<DomainResponse> {
    const existing = await this.getDomainForUser(user, id);
    const deleted = await this.repos.domains.softDelete(id);

    await this.auditService.log({
      userId: user.id,
      organizationId: user.organizationId,
      action: 'domain.deleted',
      module: 'domain',
      previousValue: existing,
      newValue: deleted,
      ...meta,
    });

    return toDomainResponse(deleted);
  }

  getVerificationInstructions(user: CurrentUser, id: string) {
    return this.getDomainForUser(user, id).then((domain) =>
      this.verificationService.buildInstructions(
        domain.hostname,
        domain.verificationToken,
        domain.domainKey,
      ),
    );
  }

  async verify(
    user: CurrentUser,
    id: string,
    method: 'DNS_TXT' | 'HTML_FILE' | 'META_TAG' | 'CMP_SCRIPT' | 'MANUAL',
    meta: AuditMeta,
  ): Promise<{ verified: boolean; message: string; domain: DomainResponse }> {
    const domain = await this.getDomainForUser(user, id);
    const result = await this.verificationService.verify(
      domain.hostname,
      domain.verificationToken,
      method,
      domain.sdkLastSeenAt,
    );

    if (result.verified) {
      const updated = await this.repos.domains.markVerified(id, method);
      await this.auditService.log({
        userId: user.id,
        organizationId: user.organizationId,
        action: 'domain.verified',
        module: 'domain',
        newValue: { id, method },
        ...meta,
      });
      return { verified: true, message: result.message, domain: toDomainResponse(updated) };
    }

    await this.repos.domains.markVerificationFailed(id);
    return { verified: false, message: result.message, domain: toDomainResponse(domain) };
  }

  async getInstallScript(user: CurrentUser, id: string) {
    const domain = await this.getDomainForUser(user, id);
    return {
      domainKey: domain.domainKey,
      configVersion: domain.configVersion,
      environment: domain.environment,
      region: domain.region,
      autoBlocking: domain.autoBlocking,
      debugMode: domain.debugMode,
      snippet: this.verificationService.buildInstallSnippet(domain.domainKey, {
        debug: domain.debugMode,
        environment: domain.environment,
      }),
      guides: {
        html: 'Paste the snippet before the closing </head> tag on every page.',
        wordpress: 'Install via a header/footer plugin or your theme\'s header.php before </head>.',
        gtm: 'Create a Custom HTML tag in Google Tag Manager, paste the snippet, and trigger on All Pages.',
        react: 'Add the script to public/index.html or use next/script in your root layout.',
        vue: 'Add the script to index.html or use vue-meta in App.vue.',
        shopify: 'Go to Online Store → Themes → Edit code → theme.liquid, paste before </head>.',
      },
    };
  }

  async validateInstallation(
    user: CurrentUser,
    id: string,
    meta: AuditMeta,
  ): Promise<{
    overallStatus: 'PASS' | 'WARNING' | 'FAIL';
    checks: ValidationCheck[];
    validationId: string;
    createdAt: Date;
  }> {
    const domain = await this.getDomainForUser(user, id);
    const published = await this.repos.policyVersions.findPublished(domain.id);
    const checks = buildInstallationChecks({
      domainKey: domain.domainKey,
      verificationStatus: domain.verificationStatus,
      autoBlocking: domain.autoBlocking,
      isProduction: domain.isProduction,
      environment: domain.environment,
      sdkLastSeenAt: domain.sdkLastSeenAt,
      sdkLastHeartbeat: (domain.sdkLastHeartbeat as SdkHeartbeatPayload | null) ?? null,
      hasPublishedPolicy: Boolean(published),
    });
    const overallStatus = summarizeChecks(checks);

    const record = await this.repos.domains.createValidation({
      domainId: domain.id,
      organizationId: user.organizationId!,
      overallStatus,
      checks,
    });

    await this.auditService.log({
      userId: user.id,
      organizationId: user.organizationId,
      action: 'domain.installation_validated',
      module: 'domain',
      newValue: { domainId: id, overallStatus },
      ...meta,
    });

    return { overallStatus, checks, validationId: record.id, createdAt: record.createdAt };
  }

  async validationHistory(user: CurrentUser, id: string): Promise<ValidationHistoryItem[]> {
    await this.getDomainForUser(user, id);
    const rows = await this.repos.domains.listValidations(id);
    return rows.map((row) => ({
      id: row.id,
      domainId: row.domainId,
      organizationId: row.organizationId,
      overallStatus: row.overallStatus as ValidationHistoryItem['overallStatus'],
      checks: row.checks,
      createdAt: row.createdAt,
    }));
  }

  private requireOrg(user: CurrentUser) {
    if (!user.organizationId) {
      throw new BadRequestException({ code: 'NO_ORG', message: 'No organization found' });
    }
  }

  private async getDomainForUser(user: CurrentUser, id: string) {
    this.requireOrg(user);
    const domain = await this.repos.domains.findById(id);
    if (!domain) {
      throw new NotFoundException({ code: 'DOMAIN_NOT_FOUND', message: 'Domain not found' });
    }
    assertSameOrganization(user, domain.organizationId);
    return domain;
  }
}

export function nextScanAtFromFrequency(frequency: string): Date | null {
  const now = Date.now();
  switch (frequency) {
    case 'DAILY':
      return new Date(now + 24 * 60 * 60 * 1000);
    case 'WEEKLY':
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    case 'MONTHLY':
      return new Date(now + 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}
