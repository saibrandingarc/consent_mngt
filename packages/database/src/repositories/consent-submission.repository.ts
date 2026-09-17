import type { Prisma, PrismaClient } from '@prisma/client';
import { toJsonString, toOptionalJsonString } from '../json-array';

export interface ConsentRecordSearchFilters {
  organizationId: string;
  domainId?: string;
  consentId?: string;
  visitorId?: string;
  from?: Date;
  to?: Date;
  consentStatus?: string;
  collectionMethod?: string;
  region?: string;
  regulation?: string;
  policyVersionId?: string;
  limit: number;
  cursor?: string;
}

export class ConsentSubmissionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: {
    id?: string;
    domainId: string;
    organizationId: string;
    visitorId: string;
    authenticatedUserId?: string | null;
    policyVersionId?: string | null;
    configVersion: number;
    bannerVersion?: number | null;
    categories: Record<string, boolean>;
    vendors?: Record<string, boolean> | null;
    region?: string | null;
    language?: string | null;
    regulation?: string | null;
    collectionMethod: string;
    eventType: Prisma.ConsentSubmissionCreateInput['eventType'];
    consentStatus: Prisma.ConsentSubmissionCreateInput['consentStatus'];
    checksum: string;
    proofHash: string;
    policySnapshotHash?: string | null;
    policySnapshot?: unknown;
    previousRecordId?: string | null;
    userAgent?: string | null;
    ipAddressHash?: string | null;
    expiresAt?: Date | null;
    withdrawnAt?: Date | null;
    groupVisitorId?: string | null;
  }) {
    return this.prisma.consentSubmission.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        domainId: data.domainId,
        organizationId: data.organizationId,
        visitorId: data.visitorId,
        authenticatedUserId: data.authenticatedUserId ?? null,
        policyVersionId: data.policyVersionId ?? null,
        configVersion: data.configVersion,
        bannerVersion: data.bannerVersion ?? null,
        categories: toJsonString(data.categories),
        vendors: toOptionalJsonString(data.vendors),
        region: data.region ?? null,
        language: data.language ?? null,
        regulation: data.regulation ?? null,
        collectionMethod: data.collectionMethod,
        eventType: data.eventType,
        consentStatus: data.consentStatus,
        checksum: data.checksum,
        proofHash: data.proofHash,
        policySnapshotHash: data.policySnapshotHash ?? null,
        policySnapshot: toOptionalJsonString(data.policySnapshot),
        previousRecordId: data.previousRecordId ?? null,
        userAgent: data.userAgent ?? null,
        ipAddressHash: data.ipAddressHash ?? null,
        expiresAt: data.expiresAt ?? null,
        withdrawnAt: data.withdrawnAt ?? null,
        groupVisitorId: data.groupVisitorId ?? null,
      },
    });
  }

  findById(id: string) {
    return this.prisma.consentSubmission.findUnique({
      where: { id },
      include: { domain: { select: { hostname: true, domainKey: true } } },
    });
  }

  findLatestForVisitor(domainId: string, visitorId: string) {
    return this.prisma.consentSubmission.findFirst({
      where: { domainId, visitorId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findLatestByGroupVisitorId(groupVisitorId: string, domainIds: string[]) {
    return this.prisma.consentSubmission.findFirst({
      where: {
        groupVisitorId,
        domainId: { in: domainIds },
        withdrawnAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findHistoryForVisitor(domainId: string, visitorId: string) {
    return this.prisma.consentSubmission.findMany({
      where: { domainId, visitorId },
      orderBy: { createdAt: 'asc' },
    });
  }

  search(filters: ConsentRecordSearchFilters) {
    const where: Prisma.ConsentSubmissionWhereInput = {
      organizationId: filters.organizationId,
    };

    if (filters.domainId) where.domainId = filters.domainId;
    if (filters.consentId) where.id = filters.consentId;
    if (filters.visitorId) where.visitorId = filters.visitorId;
    if (filters.consentStatus) {
      where.consentStatus = filters.consentStatus as Prisma.ConsentSubmissionWhereInput['consentStatus'];
    }
    if (filters.collectionMethod) where.collectionMethod = filters.collectionMethod;
    if (filters.region) where.region = filters.region;
    if (filters.regulation) where.regulation = filters.regulation;
    if (filters.policyVersionId) where.policyVersionId = filters.policyVersionId;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }

    return this.prisma.consentSubmission.findMany({
      where,
      include: { domain: { select: { hostname: true, domainKey: true } } },
      orderBy: { createdAt: 'desc' },
      take: filters.limit + 1,
      ...(filters.cursor
        ? {
            cursor: { id: filters.cursor },
            skip: 1,
          }
        : {}),
    });
  }

  exportAll(filters: Omit<ConsentRecordSearchFilters, 'limit' | 'cursor'>) {
    const where: Prisma.ConsentSubmissionWhereInput = {
      organizationId: filters.organizationId,
    };

    if (filters.domainId) where.domainId = filters.domainId;
    if (filters.consentId) where.id = filters.consentId;
    if (filters.visitorId) where.visitorId = filters.visitorId;
    if (filters.consentStatus) {
      where.consentStatus = filters.consentStatus as Prisma.ConsentSubmissionWhereInput['consentStatus'];
    }
    if (filters.collectionMethod) where.collectionMethod = filters.collectionMethod;
    if (filters.region) where.region = filters.region;
    if (filters.regulation) where.regulation = filters.regulation;
    if (filters.policyVersionId) where.policyVersionId = filters.policyVersionId;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }

    return this.prisma.consentSubmission.findMany({
      where,
      include: { domain: { select: { hostname: true, domainKey: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
  }

  aggregateByField(
    organizationId: string,
    field: 'collectionMethod' | 'eventType' | 'region' | 'regulation' | 'consentStatus',
    from?: Date,
    to?: Date,
    domainId?: string,
  ) {
    const where: Prisma.ConsentSubmissionWhereInput = { organizationId };
    if (domainId) where.domainId = domainId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }
    return this.prisma.consentSubmission.groupBy({
      by: [field],
      where,
      _count: { _all: true },
    });
  }

  countInRange(organizationId: string, from?: Date, to?: Date, domainId?: string) {
    const where: Prisma.ConsentSubmissionWhereInput = { organizationId };
    if (domainId) where.domainId = domainId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }
    return this.prisma.consentSubmission.count({ where });
  }

  countExpiring(organizationId: string, withinDays = 30) {
    const now = new Date();
    const until = new Date(Date.now() + withinDays * 86_400_000);
    return this.prisma.consentSubmission.count({
      where: {
        organizationId,
        expiresAt: { gte: now, lte: until },
        withdrawnAt: null,
      },
    });
  }
}
