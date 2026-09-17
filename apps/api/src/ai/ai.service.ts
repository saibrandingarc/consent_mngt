import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Repositories } from '@cmp/database';
import { parseJsonRecord } from '@cmp/database';
import type { CurrentUser } from '@cmp/types';
import {
  classifyCookieHeuristic,
  generateBannerTextHeuristic,
  isSuspiciousNecessaryClassification,
} from '@cmp/utils';
import { REPOS } from '../database/database.module';
import { assertSameOrganization } from '../common/guards/tenant.guard';
import { AuditService } from '../audit/audit.service';
import {
  buildInstallationChecks,
  summarizeChecks,
  type SdkHeartbeatPayload,
} from '../domains/installation-checks';
import type { AuditMeta } from '../organizations/organizations.service';

type CookieRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

interface AiSuggestionRow {
  id: string;
  organizationId: string;
  domainId: string;
  suggestionType: string;
  status: string;
  targetType: string;
  targetId: string | null;
  confidence: number | null;
  suggestion: unknown;
  evidence: unknown;
  createdBy: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RegressionRunRow {
  id: string;
  organizationId: string;
  domainId: string;
  overallStatus: string;
  scenarios: unknown;
  createdAt: Date;
}

function toSuggestionResponse(row: AiSuggestionRow): Record<string, unknown> {
  return {
    id: row.id,
    organizationId: row.organizationId,
    domainId: row.domainId,
    suggestionType: row.suggestionType,
    status: row.status,
    targetType: row.targetType,
    targetId: row.targetId,
    confidence: row.confidence,
    suggestion: row.suggestion as Record<string, unknown>,
    evidence: (row.evidence as Record<string, unknown> | null) ?? null,
    createdBy: row.createdBy,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRegressionRunResponse(row: RegressionRunRow): Record<string, unknown> {
  return {
    id: row.id,
    organizationId: row.organizationId,
    domainId: row.domainId,
    overallStatus: row.overallStatus,
    scenarios: row.scenarios,
    createdAt: row.createdAt,
  };
}

function mapRiskLevel(value: unknown): CookieRiskLevel | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toUpperCase();
  if (normalized === 'LOW' || normalized === 'MEDIUM' || normalized === 'HIGH') {
    return normalized as CookieRiskLevel;
  }
  return undefined;
}

@Injectable()
export class AiService {
  constructor(
    @Inject(REPOS) private readonly repos: Repositories,
    private readonly auditService: AuditService,
  ) {}

  private async getDomainForUser(user: CurrentUser, domainId: string) {
    if (!user.organizationId) {
      throw new BadRequestException({ code: 'NO_ORG', message: 'No organization found' });
    }
    const domain = await this.repos.domains.findById(domainId);
    if (!domain) {
      throw new NotFoundException({ code: 'DOMAIN_NOT_FOUND', message: 'Domain not found' });
    }
    assertSameOrganization(user, domain.organizationId);
    return domain;
  }

  async listSuggestions(
    user: CurrentUser,
    domainId: string,
    status?: string,
  ): Promise<Record<string, unknown>[]> {
    await this.getDomainForUser(user, domainId);
    const rows = await this.repos.ai.listSuggestions(domainId, status);
    return rows.map((row) => toSuggestionResponse(row as AiSuggestionRow));
  }

  async classifyCookie(
    user: CurrentUser,
    domainId: string,
    cookieId: string,
  ): Promise<Record<string, unknown>> {
    const domain = await this.getDomainForUser(user, domainId);
    const cookie = await this.repos.cookies.findDomainCookieById(cookieId);
    if (!cookie || cookie.domainId !== domain.id) {
      throw new NotFoundException({ code: 'COOKIE_NOT_FOUND', message: 'Cookie not found' });
    }

    const hint =
      classifyCookieHeuristic(cookie.cookieName, cookie.cookieDomain) ?? {
        category: 'functional',
        provider: cookie.provider ?? 'Unknown',
        purpose: 'Unknown purpose — manual review recommended',
        description: `Cookie ${cookie.cookieName} detected on ${cookie.cookieDomain ?? domain.hostname}.`,
        visitorDescription: 'Supports website functionality.',
        riskLevel: 'medium' as const,
        confidence: 45,
        evidence: ['No strong pattern match — default functional classification'],
      };

    const suggestion = await this.repos.ai.createSuggestion({
      organizationId: domain.organizationId,
      domainId: domain.id,
      suggestionType: 'COOKIE_CLASSIFICATION',
      targetType: 'domain_cookie',
      targetId: cookieId,
      confidence: hint.confidence,
      suggestion: {
        category: hint.category,
        provider: hint.provider,
        purpose: hint.purpose,
        description: hint.description,
        visitorDescription: hint.visitorDescription,
        riskLevel: hint.riskLevel,
      },
      evidence: { items: hint.evidence },
      createdBy: user.id,
    });

    return toSuggestionResponse(suggestion as AiSuggestionRow);
  }

  async describeCookie(
    user: CurrentUser,
    domainId: string,
    cookieId: string,
  ): Promise<Record<string, unknown>> {
    const domain = await this.getDomainForUser(user, domainId);
    const cookie = await this.repos.cookies.findDomainCookieById(cookieId);
    if (!cookie || cookie.domainId !== domain.id) {
      throw new NotFoundException({ code: 'COOKIE_NOT_FOUND', message: 'Cookie not found' });
    }

    const hint = classifyCookieHeuristic(cookie.cookieName, cookie.cookieDomain);
    const description = hint?.description ?? `Technical cookie: ${cookie.cookieName}`;
    const visitorDescription =
      hint?.visitorDescription ?? 'Supports website features during your visit.';

    return toSuggestionResponse(
      await this.repos.ai.createSuggestion({
        organizationId: domain.organizationId,
        domainId: domain.id,
        suggestionType: 'COOKIE_DESCRIPTION',
        targetType: 'domain_cookie',
        targetId: cookieId,
        confidence: hint?.confidence ?? 50,
        suggestion: {
          description,
          visitorDescription,
          purpose: hint?.purpose ?? cookie.purpose,
          category: hint?.category ?? cookie.category,
          provider: hint?.provider ?? cookie.provider,
          riskLevel: hint?.riskLevel ?? cookie.riskLevel,
        },
        evidence: { items: hint?.evidence ?? ['Generated from cookie metadata'] },
        createdBy: user.id,
      }) as AiSuggestionRow,
    );
  }

  async generateComplianceRecommendations(
    user: CurrentUser,
    domainId: string,
  ): Promise<Record<string, unknown>> {
    const domain = await this.getDomainForUser(user, domainId);
    const published = await this.repos.policyVersions.findPublished(domain.id);
    const unknownCount = await this.repos.cookies.countReviewQueue(domain.organizationId);
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

    const recommendations: Array<{
      issue: string;
      severity: 'low' | 'medium' | 'high';
      evidence: string;
      recommendedAction: string;
      suggestedOwner: string;
    }> = [];

    for (const check of checks) {
      if (check.status === 'FAIL') {
        recommendations.push({
          issue: check.label,
          severity: 'high',
          evidence: check.message,
          recommendedAction: check.remediation ?? 'Review installation validation',
          suggestedOwner: 'developer',
        });
      } else if (check.status === 'WARNING') {
        recommendations.push({
          issue: check.label,
          severity: 'medium',
          evidence: check.message,
          recommendedAction: check.remediation ?? 'Review and remediate',
          suggestedOwner: 'compliance_manager',
        });
      }
    }

    if (unknownCount > 0) {
      recommendations.push({
        issue: 'Cookies pending classification review',
        severity: unknownCount > 10 ? 'high' : 'medium',
        evidence: `${unknownCount} cookie(s) in review queue`,
        recommendedAction: 'Review and approve cookie classifications in Cookie repository',
        suggestedOwner: 'compliance_manager',
      });
    }

    const suggestion = await this.repos.ai.createSuggestion({
      organizationId: domain.organizationId,
      domainId: domain.id,
      suggestionType: 'COMPLIANCE_RECOMMENDATION',
      targetType: 'domain',
      targetId: domain.id,
      confidence: 80,
      suggestion: { recommendations },
      evidence: { installationStatus: summarizeChecks(checks), unknownCount },
      createdBy: user.id,
    });

    return toSuggestionResponse(suggestion as AiSuggestionRow);
  }

  async generateBannerText(
    user: CurrentUser,
    domainId: string,
    input: { regulation?: string; industry?: string; tone?: string; language?: string },
  ): Promise<Record<string, unknown>> {
    const domain = await this.getDomainForUser(user, domainId);
    const org = await this.repos.organizations.findById(domain.organizationId);
    const text = generateBannerTextHeuristic({
      regulation: input.regulation ?? org?.defaultRegulation,
      industry: input.industry,
      tone: input.tone,
      language: input.language,
    });

    return toSuggestionResponse(
      await this.repos.ai.createSuggestion({
        organizationId: domain.organizationId,
        domainId: domain.id,
        suggestionType: 'BANNER_TEXT',
        targetType: 'policy',
        confidence: text.confidence,
        suggestion: text,
        evidence: { items: text.evidence },
        createdBy: user.id,
      }) as AiSuggestionRow,
    );
  }

  async detectMisclassifiedNecessary(
    user: CurrentUser,
    domainId: string,
  ): Promise<Record<string, unknown>> {
    const domain = await this.getDomainForUser(user, domainId);
    const cookies = await this.repos.cookies.listByDomain(domain.id);
    const suspicious = cookies.filter((c) =>
      isSuspiciousNecessaryClassification(c.cookieName, c.category),
    );

    const items = suspicious.map((c) => ({
      cookieId: c.id,
      cookieName: c.cookieName,
      category: c.category,
      evidence: 'Cookie name suggests marketing/analytics but category is strictly_necessary',
      suggestedCategory: 'marketing',
    }));

    return toSuggestionResponse(
      await this.repos.ai.createSuggestion({
        organizationId: domain.organizationId,
        domainId: domain.id,
        suggestionType: 'MISCLASSIFIED_NECESSARY',
        targetType: 'domain',
        confidence: items.length > 0 ? 85 : 100,
        suggestion: { items },
        evidence: { count: items.length },
        createdBy: user.id,
      }) as AiSuggestionRow,
    );
  }

  async approveSuggestion(
    user: CurrentUser,
    suggestionId: string,
    meta: AuditMeta,
  ): Promise<Record<string, unknown>> {
    const suggestion = await this.repos.ai.findSuggestionById(suggestionId);
    if (!suggestion) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Suggestion not found' });
    }
    await this.getDomainForUser(user, suggestion.domainId);

    if (
      suggestion.suggestionType === 'COOKIE_CLASSIFICATION' ||
      suggestion.suggestionType === 'COOKIE_DESCRIPTION'
    ) {
      if (!suggestion.targetId) {
        throw new BadRequestException({ code: 'INVALID', message: 'Missing cookie target' });
      }
      const payload = parseJsonRecord(suggestion.suggestion);
      await this.repos.cookies.updateDomainCookie(suggestion.targetId, {
        provider: (payload.provider as string) ?? undefined,
        description: (payload.description as string) ?? undefined,
        purpose: (payload.purpose as string) ?? undefined,
        category: (payload.category as string) ?? undefined,
        riskLevel: mapRiskLevel(payload.riskLevel),
        reviewStatus: 'APPROVED',
      });
    }

    const updated = await this.repos.ai.updateSuggestionStatus(suggestionId, 'APPLIED', user.id);

    await this.auditService.log({
      userId: user.id,
      organizationId: user.organizationId,
      action: 'ai.suggestion_approved',
      module: 'ai',
      newValue: { suggestionId, type: suggestion.suggestionType },
      ...meta,
    });

    return toSuggestionResponse(updated as AiSuggestionRow);
  }

  async rejectSuggestion(
    user: CurrentUser,
    suggestionId: string,
    meta: AuditMeta,
  ): Promise<Record<string, unknown>> {
    const suggestion = await this.repos.ai.findSuggestionById(suggestionId);
    if (!suggestion) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Suggestion not found' });
    }
    await this.getDomainForUser(user, suggestion.domainId);
    const updated = await this.repos.ai.updateSuggestionStatus(suggestionId, 'REJECTED', user.id);
    await this.auditService.log({
      userId: user.id,
      organizationId: user.organizationId,
      action: 'ai.suggestion_rejected',
      module: 'ai',
      newValue: { suggestionId },
      ...meta,
    });
    return toSuggestionResponse(updated as AiSuggestionRow);
  }

  async runRegressionTests(
    user: CurrentUser,
    domainId: string,
  ): Promise<Record<string, unknown>> {
    const domain = await this.getDomainForUser(user, domainId);
    const published = await this.repos.policyVersions.findPublished(domain.id);
    const heartbeat = (domain.sdkLastHeartbeat as SdkHeartbeatPayload | null) ?? {};
    const hasHeartbeat = Boolean(domain.sdkLastSeenAt);

    const scenarios: Array<{
      id: string;
      label: string;
      status: 'PASS' | 'WARNING' | 'FAIL';
      message: string;
    }> = [
      {
        id: 'fresh_visitor',
        label: 'Fresh visitor (no prior consent)',
        status: hasHeartbeat ? 'PASS' : 'WARNING',
        message: hasHeartbeat
          ? 'SDK reports installation — simulate fresh visitor in browser'
          : 'No SDK heartbeat yet',
      },
      {
        id: 'banner_published',
        label: 'Banner configuration published',
        status: published ? 'PASS' : 'FAIL',
        message: published ? 'Published policy available' : 'No published banner policy',
      },
      {
        id: 'gcm_default',
        label: 'Google Consent Mode default',
        status:
          heartbeat.googleConsentModeEnabled === false
            ? 'PASS'
            : heartbeat.googleConsentModeDefaultApplied
              ? 'PASS'
              : hasHeartbeat
                ? 'FAIL'
                : 'WARNING',
        message: heartbeat.googleConsentModeDefaultApplied
          ? 'GCM default applied'
          : 'GCM default not confirmed',
      },
      {
        id: 'gcm_update',
        label: 'Google Consent Mode update after consent',
        status:
          heartbeat.googleConsentModeEnabled === false
            ? 'PASS'
            : heartbeat.googleConsentModeUpdateApplied
              ? 'PASS'
              : hasHeartbeat
                ? 'WARNING'
                : 'WARNING',
        message: heartbeat.googleConsentModeUpdateApplied
          ? 'Consent update observed'
          : 'Awaiting visitor consent interaction',
      },
      {
        id: 'auto_blocking',
        label: 'Auto-blocking active',
        status:
          domain.autoBlocking && heartbeat.autoBlockingEnabled !== false
            ? 'PASS'
            : domain.autoBlocking
              ? 'WARNING'
              : 'PASS',
        message: domain.autoBlocking ? 'Auto-blocking enabled' : 'Auto-blocking disabled by design',
      },
      {
        id: 'pre_consent_violations',
        label: 'Pre-consent tracker blocking',
        status:
          (heartbeat.preConsentViolations ?? 0) === 0
            ? 'PASS'
            : 'WARNING',
        message:
          (heartbeat.preConsentViolations ?? 0) === 0
            ? 'No pre-consent violations reported'
            : `${heartbeat.preConsentViolations} violation(s) reported`,
      },
      {
        id: 'domain_verified',
        label: 'Production domain verified',
        status:
          domain.verificationStatus === 'VERIFIED' ||
          !domain.isProduction ||
          domain.environment !== 'production'
            ? 'PASS'
            : 'FAIL',
        message: `Verification: ${domain.verificationStatus}`,
      },
    ];

    const failCount = scenarios.filter((s) => s.status === 'FAIL').length;
    const warnCount = scenarios.filter((s) => s.status === 'WARNING').length;
    const overallStatus =
      failCount > 0 ? 'FAIL' : warnCount > 0 ? 'WARNING' : 'PASS';

    return toRegressionRunResponse(
      await this.repos.ai.createRegressionRun({
        organizationId: domain.organizationId,
        domainId: domain.id,
        overallStatus,
        scenarios,
      }) as RegressionRunRow,
    );
  }

  async listRegressionRuns(
    user: CurrentUser,
    domainId: string,
  ): Promise<Record<string, unknown>[]> {
    const domain = await this.getDomainForUser(user, domainId);
    const rows = await this.repos.ai.listRegressionRuns(domain.id);
    return rows.map((row) => toRegressionRunResponse(row as RegressionRunRow));
  }
}
