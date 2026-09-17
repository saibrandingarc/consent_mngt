import type { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { toJsonArray } from '../json-array';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export class DomainGroupRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listByOrganization(organizationId: string) {
    return this.prisma.domainGroup.findMany({
      where: { organizationId },
      include: {
        members: {
          include: { domain: { select: { id: true, hostname: true, domainKey: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.domainGroup.findUnique({
      where: { id },
      include: {
        members: {
          include: { domain: { select: { id: true, hostname: true, domainKey: true } } },
        },
      },
    });
  }

  findMemberByDomainId(domainId: string) {
    return this.prisma.domainGroupMember.findFirst({
      where: { domainId },
      include: {
        group: {
          include: {
            members: {
              include: { domain: { select: { id: true, hostname: true, domainKey: true } } },
            },
          },
        },
      },
    });
  }

  async create(data: {
    organizationId: string;
    name: string;
    shareConsent?: boolean;
    parentDomainId?: string | null;
    allowedHostnames?: string[];
    domainIds?: string[];
  }) {
    const baseSlug = slugify(data.name) || 'group';
    let slug = baseSlug;
    let attempt = 0;
    while (
      await this.prisma.domainGroup.findFirst({
        where: { organizationId: data.organizationId, slug },
      })
    ) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    const consentSyncSecret = randomBytes(32).toString('hex');
    return this.prisma.domainGroup.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        slug,
        shareConsent: data.shareConsent ?? true,
        consentSyncSecret,
        parentDomainId: data.parentDomainId ?? null,
        allowedHostnames: toJsonArray(data.allowedHostnames),
        members: data.domainIds?.length
          ? {
              create: data.domainIds.map((domainId) => ({
                domainId,
                role: domainId === data.parentDomainId ? 'parent' : 'member',
              })),
            }
          : undefined,
      },
      include: {
        members: {
          include: { domain: { select: { id: true, hostname: true, domainKey: true } } },
        },
      },
    });
  }

  update(
    id: string,
    data: {
      name?: string;
      shareConsent?: boolean;
      parentDomainId?: string | null;
      allowedHostnames?: string[];
    },
  ) {
    return this.prisma.domainGroup.update({
      where: { id },
      data: {
        name: data.name,
        shareConsent: data.shareConsent,
        parentDomainId: data.parentDomainId,
        allowedHostnames: data.allowedHostnames
          ? toJsonArray(data.allowedHostnames)
          : undefined,
      },
      include: {
        members: {
          include: { domain: { select: { id: true, hostname: true, domainKey: true } } },
        },
      },
    });
  }

  delete(id: string) {
    return this.prisma.domainGroup.delete({ where: { id } });
  }

  addMember(groupId: string, domainId: string, role = 'member') {
    return this.prisma.domainGroupMember.upsert({
      where: { groupId_domainId: { groupId, domainId } },
      create: { groupId, domainId, role },
      update: { role },
    });
  }

  removeMember(groupId: string, domainId: string) {
    return this.prisma.domainGroupMember.delete({
      where: { groupId_domainId: { groupId, domainId } },
    });
  }
}
