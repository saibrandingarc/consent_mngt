import { createHash, randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { initializeDomainConsent } from './consent.repository';
import { toOptionalJsonString } from '../json-array';

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
}

function generateDomainKey(): string {
  return `dk_${randomBytes(16).toString('hex')}`;
}

function generateVerificationToken(): string {
  return `vf_${randomBytes(16).toString('hex')}`;
}

export class DomainRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findById(id: string) {
    return this.prisma.domain.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findByHostname(hostname: string) {
    return this.prisma.domain.findFirst({
      where: { hostname: normalizeHostname(hostname), deletedAt: null },
    });
  }

  findByDomainKey(domainKey: string) {
    return this.prisma.domain.findFirst({
      where: { domainKey, deletedAt: null },
    });
  }

  listByOrganization(organizationId: string) {
    return this.prisma.domain.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    organizationId: string;
    hostname: string;
    domainType?: 'ROOT' | 'SUBDOMAIN' | 'STAGING' | 'ALIAS';
    isProduction?: boolean;
    groupName?: string;
    scanLimit?: number;
    environment?: string;
    region?: string;
    autoBlocking?: boolean;
    debugMode?: boolean;
  }) {
    const hostname = normalizeHostname(data.hostname);
    const existing = await this.findByHostname(hostname);
    if (existing) {
      throw new Error('DOMAIN_EXISTS');
    }

    return this.prisma.domain.create({
      data: {
        organizationId: data.organizationId,
        hostname,
        domainKey: generateDomainKey(),
        verificationToken: generateVerificationToken(),
        domainType: data.domainType ?? 'ROOT',
        isProduction: data.isProduction ?? true,
        groupName: data.groupName,
        scanLimit: data.scanLimit ?? 10,
        environment: data.environment ?? 'production',
        region: data.region,
        autoBlocking: data.autoBlocking ?? true,
        debugMode: data.debugMode ?? false,
      },
    }).then(async (domain) => {
      await initializeDomainConsent(this.prisma, domain.id, domain.organizationId);
      return domain;
    });
  }

  update(id: string, data: Prisma.DomainUpdateInput) {
    return this.prisma.domain.update({ where: { id }, data });
  }

  findDueForScan(now: Date) {
    return this.prisma.domain.findMany({
      where: {
        enabled: true,
        scanFrequency: { not: 'MANUAL' },
        nextScanAt: { lte: now },
        deletedAt: null,
      },
    });
  }

  softDelete(id: string) {
    return this.prisma.domain.update({
      where: { id },
      data: { deletedAt: new Date(), enabled: false },
    });
  }

  markVerified(id: string, method: 'DNS_TXT' | 'HTML_FILE' | 'META_TAG' | 'CMP_SCRIPT' | 'MANUAL') {
    const now = new Date();
    return this.prisma.domain.update({
      where: { id },
      data: {
        verificationStatus: 'VERIFIED',
        verificationMethod: method,
        verifiedAt: now,
        lastVerifiedAt: now,
      },
    });
  }

  markVerificationFailed(id: string) {
    return this.prisma.domain.update({
      where: { id },
      data: {
        verificationStatus: 'FAILED',
        lastVerifiedAt: new Date(),
      },
    });
  }

  recordSdkHeartbeat(
    domainKey: string,
    payload?: {
      scriptLoaded?: boolean;
      consentEventDetected?: boolean;
      autoBlockingEnabled?: boolean;
      googleConsentModeDetected?: boolean;
      googleConsentModeEnabled?: boolean;
      googleConsentModeDefaultApplied?: boolean;
      googleConsentModeUpdateApplied?: boolean;
      googleConsentModeMode?: 'basic' | 'advanced';
      duplicateScripts?: number;
      jsErrors?: string[];
      scriptLoadedFirst?: boolean;
      defaultConsentApplied?: boolean;
      preConsentViolations?: number;
      integrationSource?: string;
    },
  ) {
    return this.prisma.domain.updateMany({
      where: { domainKey, deletedAt: null },
      data: {
        sdkLastSeenAt: new Date(),
        sdkLastHeartbeat: toOptionalJsonString(payload),
      },
    });
  }

  createValidation(data: {
    domainId: string;
    organizationId: string;
    overallStatus: 'PASS' | 'WARNING' | 'FAIL';
    checks: unknown;
  }) {
    return this.prisma.installationValidation.create({
      data: {
        domainId: data.domainId,
        organizationId: data.organizationId,
        overallStatus: data.overallStatus,
        checks: toOptionalJsonString(data.checks) ?? '{}',
      },
    });
  }

  listValidations(domainId: string, limit = 20) {
    return this.prisma.installationValidation.findMany({
      where: { domainId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  static normalizeHostname = normalizeHostname;
  static hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
