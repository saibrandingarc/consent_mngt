import type { PrismaClient } from '@prisma/client';
import { toJsonArray } from '../json-array';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

export class EnterpriseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listCustomRoles(organizationId: string) {
    return this.prisma.organizationCustomRole.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  findCustomRoleById(id: string) {
    return this.prisma.organizationCustomRole.findUnique({ where: { id } });
  }

  async createCustomRole(data: {
    organizationId: string;
    name: string;
    description?: string;
    permissions: string[];
  }) {
    const baseSlug = slugify(data.name) || 'role';
    let slug = baseSlug;
    let attempt = 0;
    while (
      await this.prisma.organizationCustomRole.findFirst({
        where: { organizationId: data.organizationId, slug },
      })
    ) {
      attempt += 1;
      slug = `${baseSlug}_${attempt}`;
    }

    return this.prisma.organizationCustomRole.create({
      data: {
        organizationId: data.organizationId,
        slug,
        name: data.name,
        description: data.description,
        permissions: toJsonArray(data.permissions),
      },
    });
  }

  updateCustomRole(
    id: string,
    data: { name?: string; description?: string; permissions?: string[] },
  ) {
    return this.prisma.organizationCustomRole.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions ? toJsonArray(data.permissions) : undefined,
      },
    });
  }

  deleteCustomRole(id: string) {
    return this.prisma.organizationCustomRole.delete({ where: { id } });
  }

  assignCustomRole(userId: string, customRoleId: string) {
    return this.prisma.userCustomRole.upsert({
      where: { userId_customRoleId: { userId, customRoleId } },
      create: { userId, customRoleId },
      update: {},
    });
  }

  removeCustomRole(userId: string, customRoleId: string) {
    return this.prisma.userCustomRole.delete({
      where: { userId_customRoleId: { userId, customRoleId } },
    });
  }

  listCustomRolesForUser(userId: string) {
    return this.prisma.userCustomRole.findMany({
      where: { userId },
      include: { customRole: true },
    });
  }

  upsertDomainAccess(userId: string, domainId: string, permissions: string[]) {
    return this.prisma.userDomainAccess.upsert({
      where: { userId_domainId: { userId, domainId } },
      create: { userId, domainId, permissions: toJsonArray(permissions) },
      update: { permissions: toJsonArray(permissions) },
    });
  }

  listDomainAccessForUser(userId: string) {
    return this.prisma.userDomainAccess.findMany({
      where: { userId },
      include: { domain: { select: { id: true, hostname: true } } },
    });
  }

  deleteDomainAccess(userId: string, domainId: string) {
    return this.prisma.userDomainAccess.delete({
      where: { userId_domainId: { userId, domainId } },
    });
  }

  deleteConsentSubmissionsBefore(organizationId: string, before: Date) {
    return this.prisma.consentSubmission.deleteMany({
      where: { organizationId, createdAt: { lt: before } },
    });
  }

  deleteAuditLogsBefore(organizationId: string, before: Date) {
    return this.prisma.auditLog.deleteMany({
      where: { organizationId, createdAt: { lt: before } },
    });
  }
}
