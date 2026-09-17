import type { Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_BANNER_CONTENT, DEFAULT_CONSENT_CATEGORIES } from '../constants/default-consent';
import { toOptionalJsonString, toJsonString } from '../json-array';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

export class ConsentCategoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listByDomain(domainId: string) {
    return this.prisma.consentCategory.findMany({
      where: { domainId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.consentCategory.findUnique({ where: { id } });
  }

  findBySlug(domainId: string, slug: string) {
    return this.prisma.consentCategory.findUnique({
      where: { domainId_slug: { domainId, slug } },
    });
  }

  async seedDefaults(domainId: string, organizationId: string) {
    const existing = await this.prisma.consentCategory.count({ where: { domainId } });
    if (existing > 0) return this.listByDomain(domainId);

    await this.prisma.consentCategory.createMany({
      data: DEFAULT_CONSENT_CATEGORIES.map((category) => ({
        domainId,
        organizationId,
        slug: category.slug,
        name: category.name,
        description: category.description,
        required: category.required,
        defaultState: category.defaultState,
        sortOrder: category.sortOrder,
        isSystem: category.isSystem,
      })),
    });

    return this.listByDomain(domainId);
  }

  async create(data: {
    domainId: string;
    organizationId: string;
    name: string;
    slug?: string;
    description?: string;
    legalBasis?: string;
    defaultState?: 'ENABLED' | 'DISABLED';
    required?: boolean;
    enabled?: boolean;
    externalSignals?: unknown;
    scriptMappings?: unknown;
    vendorPurposes?: unknown;
  }) {
    const count = await this.prisma.consentCategory.count({ where: { domainId: data.domainId } });
    const slug = data.slug ?? slugify(data.name);
    const existing = await this.findBySlug(data.domainId, slug);
    if (existing) throw new Error('CATEGORY_EXISTS');

    return this.prisma.consentCategory.create({
      data: {
        domainId: data.domainId,
        organizationId: data.organizationId,
        slug,
        name: data.name,
        description: data.description,
        legalBasis: data.legalBasis,
        defaultState: data.defaultState ?? 'DISABLED',
        required: data.required ?? false,
        enabled: data.enabled ?? true,
        sortOrder: count,
        isSystem: false,
        externalSignals: toOptionalJsonString(data.externalSignals),
        scriptMappings: toOptionalJsonString(data.scriptMappings),
        vendorPurposes: toOptionalJsonString(data.vendorPurposes),
      },
    });
  }

  update(id: string, data: Prisma.ConsentCategoryUpdateInput) {
    return this.prisma.consentCategory.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.consentCategory.delete({ where: { id } });
  }

  async reorder(domainId: string, orderedIds: string[]) {
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.consentCategory.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.listByDomain(domainId);
  }

  hasScriptMappings(category: { scriptMappings: unknown }) {
    const mappings = category.scriptMappings;
    if (!mappings || typeof mappings !== 'object') return false;
    const record = mappings as Record<string, unknown>;
    const scripts = Array.isArray(record.scripts) ? record.scripts : [];
    const cookies = Array.isArray(record.cookies) ? record.cookies : [];
    return scripts.length > 0 || cookies.length > 0;
  }

  async remapAndDelete(id: string, remapToCategoryId: string) {
    const category = await this.findById(id);
    if (!category) throw new Error('CATEGORY_NOT_FOUND');
    const target = await this.findById(remapToCategoryId);
    if (!target || target.domainId !== category.domainId) throw new Error('INVALID_REMAP_TARGET');

    const sourceMappings = (category.scriptMappings as Record<string, unknown> | null) ?? {};
    const targetMappings = (target.scriptMappings as Record<string, unknown> | null) ?? {};
    const merged = {
      scripts: [
        ...(Array.isArray(targetMappings.scripts) ? targetMappings.scripts : []),
        ...(Array.isArray(sourceMappings.scripts) ? sourceMappings.scripts : []),
      ],
      cookies: [
        ...(Array.isArray(targetMappings.cookies) ? targetMappings.cookies : []),
        ...(Array.isArray(sourceMappings.cookies) ? sourceMappings.cookies : []),
      ],
    };

    await this.prisma.$transaction([
      this.prisma.consentCategory.update({
        where: { id: remapToCategoryId },
        data: { scriptMappings: toOptionalJsonString(merged) },
      }),
      this.prisma.consentCategory.delete({ where: { id } }),
    ]);
  }
}

export class PolicyVersionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listByDomain(domainId: string) {
    return this.prisma.policyVersion.findMany({
      where: { domainId },
      orderBy: { versionNumber: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.policyVersion.findUnique({ where: { id } });
  }

  findPublished(domainId: string) {
    return this.prisma.policyVersion.findFirst({
      where: { domainId, status: 'PUBLISHED' },
      orderBy: { versionNumber: 'desc' },
    });
  }

  findDraft(domainId: string) {
    return this.prisma.policyVersion.findFirst({
      where: { domainId, status: 'DRAFT' },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async getOrCreateDraft(domainId: string, organizationId: string) {
    const draft = await this.findDraft(domainId);
    if (draft) return draft;

    const latest = await this.prisma.policyVersion.findFirst({
      where: { domainId },
      orderBy: { versionNumber: 'desc' },
    });
    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    return this.prisma.policyVersion.create({
      data: {
        domainId,
        organizationId,
        versionNumber,
        status: 'DRAFT',
        bannerContent: toOptionalJsonString(DEFAULT_BANNER_CONTENT),
        supportedLanguages: toJsonString(['en']),
      },
    });
  }

  update(id: string, data: Prisma.PolicyVersionUpdateInput) {
    return this.prisma.policyVersion.update({ where: { id }, data });
  }

  async publishScheduled() {
    const now = new Date();
    const due = await this.prisma.policyVersion.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
    });
    for (const policy of due) {
      const snapshot =
        policy.categoriesSnapshot ??
        (await this.prisma.consentCategory.findMany({
          where: { domainId: policy.domainId },
          orderBy: { sortOrder: 'asc' },
        }));
      await this.publish(policy.id, policy.domainId, snapshot);
    }
    return due.length;
  }

  async publish(policyId: string, domainId: string, categoriesSnapshot: unknown) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.policyVersion.findUnique({ where: { id: policyId } });
      if (!current || current.domainId !== domainId) throw new Error('POLICY_NOT_FOUND');
      if (current.status !== 'DRAFT' && current.status !== 'SCHEDULED') {
        throw new Error('POLICY_NOT_PUBLISHABLE');
      }

      await tx.policyVersion.updateMany({
        where: { domainId, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });

      const published = await tx.policyVersion.update({
        where: { id: policyId },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          scheduledAt: null,
          categoriesSnapshot: toOptionalJsonString(categoriesSnapshot),
        },
      });

      await tx.domain.update({
        where: { id: domainId },
        data: { configVersion: { increment: 1 } },
      });

      return published;
    });
  }

  schedule(policyId: string, scheduledAt: Date, categoriesSnapshot: unknown) {
    return this.prisma.policyVersion.update({
      where: { id: policyId },
      data: {
        status: 'SCHEDULED',
        scheduledAt,
        categoriesSnapshot: toOptionalJsonString(categoriesSnapshot),
      },
    });
  }

  archive(policyId: string) {
    return this.prisma.policyVersion.update({
      where: { id: policyId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
  }

  markRequiresRenewal(domainId: string, reason: unknown) {
    return this.prisma.policyVersion.updateMany({
      where: { domainId, status: 'PUBLISHED' },
      data: { requiresRenewal: true, renewalReason: toOptionalJsonString(reason) },
    });
  }
}

export class ConsentRenewalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listByDomain(domainId: string, limit = 20) {
    return this.prisma.consentRenewal.findMany({
      where: { domainId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  create(data: {
    domainId: string;
    organizationId: string;
    policyVersionId?: string;
    reason: string;
    scope?: string;
    triggeredBy?: string;
    metadata?: unknown;
  }) {
    return this.prisma.consentRenewal.create({
      data: {
        domainId: data.domainId,
        organizationId: data.organizationId,
        policyVersionId: data.policyVersionId,
        reason: data.reason,
        scope: data.scope ?? 'all',
        triggeredBy: data.triggeredBy,
        metadata: toOptionalJsonString(data.metadata),
      },
    });
  }
}

export async function initializeDomainConsent(
  prisma: PrismaClient,
  domainId: string,
  organizationId: string,
) {
  const categories = new ConsentCategoryRepository(prisma);
  const policies = new PolicyVersionRepository(prisma);
  await categories.seedDefaults(domainId, organizationId);
  await policies.getOrCreateDraft(domainId, organizationId);
}
