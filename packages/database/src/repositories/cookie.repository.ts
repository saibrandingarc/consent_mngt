import type { Prisma, PrismaClient } from '@prisma/client';
import type { CookieMatchMethod, CookieReviewStatus, CookieRiskLevel } from '../enums';
import { toJsonString, toOptionalJsonString } from '../json-array';

export function buildCookieKey(cookieName: string, cookieDomain?: string | null) {
  return `${cookieName}|${cookieDomain ?? ''}`;
}

export interface UpsertDomainCookieInput {
  domainId: string;
  organizationId: string;
  cookieName: string;
  cookieDomain?: string | null;
  inventoryKey?: string;
  provider?: string | null;
  providerDomain?: string | null;
  description?: string | null;
  purpose?: string | null;
  category?: string | null;
  duration?: string | null;
  dataCollected?: string | null;
  isThirdParty?: boolean | null;
  privacyPolicyUrl?: string | null;
  riskLevel?: CookieRiskLevel | null;
  cookieDefinitionId?: string | null;
  matchMethod?: CookieMatchMethod | null;
  matchConfidence?: number | null;
  reviewStatus?: CookieReviewStatus;
  lastScanId?: string | null;
  expiresAt?: Date | null;
  foundBeforeConsent?: boolean;
  sourceUrl?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export class CookieRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listDefinitions(organizationId?: string | null) {
    return this.prisma.cookieDefinition.findMany({
      where: organizationId
        ? { OR: [{ organizationId: null }, { organizationId }] }
        : { organizationId: null },
      orderBy: [{ provider: 'asc' }, { cookieName: 'asc' }],
    });
  }

  listByDomain(domainId: string) {
    return this.prisma.domainCookie.findMany({
      where: { domainId },
      orderBy: [{ reviewStatus: 'asc' }, { cookieName: 'asc' }],
      include: { cookieDefinition: true },
    });
  }

  listUnknownByDomain(domainId: string) {
    return this.prisma.domainCookie.findMany({
      where: {
        domainId,
        reviewStatus: { in: ['PENDING', 'AUTO_MATCHED'] },
      },
      orderBy: { lastSeenAt: 'desc' },
      include: { cookieDefinition: true },
    });
  }

  countReviewQueue(organizationId: string) {
    return this.prisma.domainCookie.count({
      where: {
        organizationId,
        reviewStatus: { in: ['PENDING', 'AUTO_MATCHED'] },
      },
    });
  }

  async countByCategory(domainId: string) {
    const groups = await this.prisma.domainCookie.groupBy({
      by: ['category'],
      where: { domainId },
      _count: { _all: true },
    });
    return groups.map((g) => ({ category: g.category, count: g._count._all }));
  }

  findDomainCookieById(id: string) {
    return this.prisma.domainCookie.findUnique({
      where: { id },
      include: { cookieDefinition: true },
    });
  }

  async upsertDefinition(data: {
    organizationId?: string | null;
    cookieName: string;
    provider: string;
    providerDomain?: string | null;
    description?: string | null;
    purpose?: string | null;
    category: string;
    duration?: string | null;
    dataCollected?: string | null;
    isThirdParty?: boolean;
    privacyPolicyUrl?: string | null;
    riskLevel?: CookieRiskLevel;
    aliases?: Prisma.InputJsonValue;
    detectionPatterns: Prisma.InputJsonValue;
    isSystem?: boolean;
  }) {
    const existing = await this.prisma.cookieDefinition.findFirst({
      where: {
        organizationId: data.organizationId ?? null,
        cookieName: data.cookieName,
        provider: data.provider,
      },
    });

    if (existing) {
      return this.prisma.cookieDefinition.update({
        where: { id: existing.id },
        data: {
          providerDomain: data.providerDomain,
          description: data.description,
          purpose: data.purpose,
          category: data.category,
          duration: data.duration,
          dataCollected: data.dataCollected,
          isThirdParty: data.isThirdParty,
          privacyPolicyUrl: data.privacyPolicyUrl,
          riskLevel: data.riskLevel,
          aliases: toOptionalJsonString(data.aliases),
          detectionPatterns: toJsonString(data.detectionPatterns),
          isSystem: data.isSystem,
        },
      });
    }

    return this.prisma.cookieDefinition.create({
      data: {
        ...data,
        aliases: toOptionalJsonString(data.aliases),
        detectionPatterns: toJsonString(data.detectionPatterns),
      },
    });
  }

  async upsertDomainCookie(input: UpsertDomainCookieInput) {
    const cookieKey = input.inventoryKey ?? buildCookieKey(input.cookieName, input.cookieDomain);
    const existing = await this.prisma.domainCookie.findUnique({
      where: { domainId_cookieKey: { domainId: input.domainId, cookieKey } },
    });

    const now = new Date();
    if (existing) {
      const preserveManual =
        existing.reviewStatus === 'APPROVED' || existing.reviewStatus === 'REJECTED';
      return this.prisma.domainCookie.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: now,
          lastScanId: input.lastScanId,
          seenCount: existing.seenCount + 1,
          expiresAt: input.expiresAt ?? existing.expiresAt,
          foundBeforeConsent: existing.foundBeforeConsent || (input.foundBeforeConsent ?? false),
          sourceUrl: input.sourceUrl ?? existing.sourceUrl,
          metadata: toOptionalJsonString(input.metadata ?? existing.metadata),
          ...(preserveManual
            ? {}
            : {
                provider: input.provider,
                providerDomain: input.providerDomain,
                description: input.description,
                purpose: input.purpose,
                category: input.category,
                duration: input.duration,
                dataCollected: input.dataCollected,
                isThirdParty: input.isThirdParty,
                privacyPolicyUrl: input.privacyPolicyUrl,
                riskLevel: input.riskLevel,
                cookieDefinitionId: input.cookieDefinitionId,
                matchMethod: input.matchMethod,
                matchConfidence: input.matchConfidence,
                reviewStatus: input.reviewStatus ?? existing.reviewStatus,
              }),
        },
      });
    }

    return this.prisma.domainCookie.create({
      data: {
        domainId: input.domainId,
        organizationId: input.organizationId,
        cookieKey,
        cookieName: input.cookieName,
        cookieDomain: input.cookieDomain,
        provider: input.provider,
        providerDomain: input.providerDomain,
        description: input.description,
        purpose: input.purpose,
        category: input.category,
        duration: input.duration,
        dataCollected: input.dataCollected,
        isThirdParty: input.isThirdParty,
        privacyPolicyUrl: input.privacyPolicyUrl,
        riskLevel: input.riskLevel,
        cookieDefinitionId: input.cookieDefinitionId,
        matchMethod: input.matchMethod,
        matchConfidence: input.matchConfidence,
        reviewStatus: input.reviewStatus ?? 'PENDING',
        firstSeenAt: now,
        lastSeenAt: now,
        lastScanId: input.lastScanId,
        expiresAt: input.expiresAt,
        foundBeforeConsent: input.foundBeforeConsent ?? false,
        sourceUrl: input.sourceUrl,
        metadata: toOptionalJsonString(input.metadata),
      },
    });
  }

  updateDomainCookie(
    id: string,
    data: Partial<{
      provider: string;
      providerDomain: string;
      description: string;
      purpose: string;
      category: string;
      duration: string;
      dataCollected: string;
      isThirdParty: boolean;
      privacyPolicyUrl: string;
      riskLevel: CookieRiskLevel;
      reviewStatus: CookieReviewStatus;
      matchMethod: CookieMatchMethod;
      matchConfidence: number;
      reviewedByUserId: string;
      reviewedAt: Date;
    }>,
  ) {
    return this.prisma.domainCookie.update({
      where: { id },
      data,
    });
  }

  /** Remove inventory rows not refreshed by the given scan (stale findings from older crawls). */
  deleteByDomainNotFromScan(domainId: string, scanId: string) {
    return this.prisma.domainCookie.deleteMany({
      where: {
        domainId,
        OR: [{ lastScanId: { not: scanId } }, { lastScanId: null }],
      },
    });
  }
}
