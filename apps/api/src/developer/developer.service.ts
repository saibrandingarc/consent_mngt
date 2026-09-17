import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Repositories } from '@cmp/database';
import { parseJsonValue } from '@cmp/database';
import type { CurrentUser } from '@cmp/types';
import type { CreateDomainScanInput } from '@cmp/validation';
import { REPOS } from '../database/database.module';
import { paginateArray } from '../common/utils/pagination';
import { toDomainResponse } from '../domains/domain-response';
import { ScansService } from '../scans/scans.service';
import { ConsentRecordsService } from '../consent-records/consent-records.service';
import { CookiesService } from '../cookies/cookies.service';
import { ConsentService } from '../consent/consent.service';
import { DomainsService } from '../domains/domains.service';
import type { ApiKeyContext } from './guards/api-key.guard';

@Injectable()
export class DeveloperService {
  constructor(
    @Inject(REPOS) private readonly repos: Repositories,
    private readonly scansService: ScansService,
    private readonly consentRecordsService: ConsentRecordsService,
    private readonly cookiesService: CookiesService,
    private readonly consentService: ConsentService,
    private readonly domainsService: DomainsService,
  ) {}

  async listDomains(ctx: ApiKeyContext, page: number, limit: number) {
    const domains = await this.filterDomainsForKey(ctx);
    const paginated = paginateArray(domains.map(toDomainResponse), page, limit);
    return paginated;
  }

  async getDomain(ctx: ApiKeyContext, domainId: string) {
    const domain = await this.getDomainForKey(ctx, domainId);
    return toDomainResponse(domain);
  }

  async listConsentRecords(
    ctx: ApiKeyContext,
    domainId: string,
    query: {
      limit: number;
      cursor?: string;
      visitorId?: string;
      from?: string;
      to?: string;
    },
  ) {
    const domain = await this.getDomainForKey(ctx, domainId);
    const user = this.asApiUser(ctx);
    const result = await this.consentRecordsService.list(user, {
      domainId: domain.id,
      limit: query.limit,
      cursor: query.cursor,
      visitorId: query.visitorId,
      from: query.from,
      to: query.to,
    });
    return result;
  }

  async listScans(ctx: ApiKeyContext, domainId: string, page: number, limit: number) {
    const domain = await this.getDomainForKey(ctx, domainId);
    const user = this.asApiUser(ctx);
    const scans = await this.scansService.list(user, domain.id);
    return paginateArray(scans, page, limit);
  }

  async getScan(ctx: ApiKeyContext, domainId: string, scanId: string) {
    const domain = await this.getDomainForKey(ctx, domainId);
    const user = this.asApiUser(ctx);
    return this.scansService.get(user, domain.id, scanId);
  }

  async startScan(
    ctx: ApiKeyContext,
    domainId: string,
    input: CreateDomainScanInput,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      const cached = await this.repos.apiKeys.findIdempotency(ctx.organizationId, idempotencyKey);
      if (cached) {
        return parseJsonValue(cached.responseBody) as { ok: boolean; data: unknown };
      }
    }

    const domain = await this.getDomainForKey(ctx, domainId);
    const user = this.asApiUser(ctx);
    const scan = await this.scansService.start(user, domain.id, input, {
      ipAddress: undefined,
      userAgent: 'cmp-api-key',
      requestId: idempotencyKey,
    });

    if (idempotencyKey) {
      const response = { ok: true, data: scan };
      await this.repos.apiKeys.saveIdempotency({
        organizationId: ctx.organizationId,
        apiKeyId: ctx.apiKeyId,
        idempotencyKey,
        method: 'POST',
        path: `/developer/v1/domains/${domainId}/scans`,
        statusCode: 200,
        responseBody: JSON.parse(JSON.stringify(response)),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }
    return scan;
  }

  async listCookies(ctx: ApiKeyContext, domainId: string, page: number, limit: number) {
    const domain = await this.getDomainForKey(ctx, domainId);
    const user = this.asApiUser(ctx);
    const cookies = await this.cookiesService.listDomainCookies(user, domain.id);
    return paginateArray(cookies, page, limit);
  }

  async listPolicies(ctx: ApiKeyContext, domainId: string, page: number, limit: number) {
    const domain = await this.getDomainForKey(ctx, domainId);
    const user = this.asApiUser(ctx);
    const policies = await this.consentService.listPolicies(user, domain.id);
    return paginateArray(policies, page, limit);
  }

  async getInstallScript(ctx: ApiKeyContext, domainId: string) {
    const domain = await this.getDomainForKey(ctx, domainId);
    const user = this.asApiUser(ctx);
    return this.domainsService.getInstallScript(user, domain.id);
  }

  async validateInstallation(ctx: ApiKeyContext, domainId: string) {
    const domain = await this.getDomainForKey(ctx, domainId);
    const user = this.asApiUser(ctx);
    return this.domainsService.validateInstallation(user, domain.id, {
      ipAddress: undefined,
      userAgent: 'cmp-api-key',
      requestId: `api-key-${ctx.apiKeyId}`,
    });
  }

  private async filterDomainsForKey(ctx: ApiKeyContext) {
    const domains = await this.repos.domains.listByOrganization(ctx.organizationId);
    return domains.filter((domain) => this.domainMatchesEnvironment(domain.environment, ctx.environment));
  }

  private async getDomainForKey(ctx: ApiKeyContext, domainId: string) {
    const domain = await this.repos.domains.findById(domainId);
    if (!domain || domain.organizationId !== ctx.organizationId) {
      throw new NotFoundException({ code: 'DOMAIN_NOT_FOUND', message: 'Domain not found' });
    }
    if (!this.domainMatchesEnvironment(domain.environment, ctx.environment)) {
      throw new NotFoundException({
        code: 'DOMAIN_ENVIRONMENT_MISMATCH',
        message: 'Domain is not available in this API key environment',
      });
    }
    return domain;
  }

  private domainMatchesEnvironment(
    domainEnvironment: string,
    keyEnvironment: ApiKeyContext['environment'],
  ) {
    const isSandboxDomain = domainEnvironment === 'sandbox';
    return keyEnvironment === 'SANDBOX' ? isSandboxDomain : !isSandboxDomain;
  }

  private asApiUser(ctx: ApiKeyContext): CurrentUser {
    return {
      id: ctx.apiKeyId,
      email: 'api-key@cmp.local',
      firstName: 'API',
      lastName: 'Key',
      emailVerified: true,
      organizationId: ctx.organizationId,
      roles: ['developer'],
      permissions: [
        'domain.manage',
        'scan.run',
        'scan.view',
        'cookie.manage',
        'consent.view',
        'banner.configure',
      ],
    };
  }
}
