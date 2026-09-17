import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Repositories } from '@cmp/database';
import { parseJsonRecord } from '@cmp/database';
import type { CurrentUser } from '@cmp/types';
import { computeGroupVisitorId } from '@cmp/utils';
import { REPOS } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../organizations/organizations.service';

@Injectable()
export class EnterpriseService {
  constructor(
    @Inject(REPOS) private readonly repos: Repositories,
    private readonly auditService: AuditService,
  ) {}

  private requireOrg(user: CurrentUser) {
    if (!user.organizationId) {
      throw new BadRequestException({ code: 'NO_ORG', message: 'No organization found' });
    }
    return user.organizationId;
  }

  async getSettings(user: CurrentUser) {
    const orgId = this.requireOrg(user);
    const org = await this.repos.organizations.findById(orgId);
    if (!org) throw new NotFoundException({ code: 'NO_ORG', message: 'Organization not found' });
    return {
      whiteLabel: (org.whiteLabel as Record<string, unknown> | null) ?? {},
      ssoConfig: (org.ssoConfig as Record<string, unknown> | null) ?? {},
      retentionPolicy: (org.retentionPolicy as Record<string, unknown> | null) ?? {},
      dataResidencyRegion: org.dataResidencyRegion,
    };
  }

  async updateWhiteLabel(
    user: CurrentUser,
    input: Record<string, unknown>,
    meta: AuditMeta,
  ): Promise<Record<string, unknown>> {
    const orgId = this.requireOrg(user);
    const updated = await this.repos.organizations.update(orgId, {
      whiteLabel: JSON.parse(JSON.stringify(input)),
    });
    await this.auditService.log({
      userId: user.id,
      organizationId: orgId,
      action: 'enterprise.white_label_updated',
      module: 'enterprise',
      newValue: input,
      ...meta,
    });
    return (updated.whiteLabel as Record<string, unknown> | null) ?? {};
  }

  async updateSsoConfig(
    user: CurrentUser,
    input: Record<string, unknown>,
    meta: AuditMeta,
  ): Promise<Record<string, unknown>> {
    const orgId = this.requireOrg(user);
    const updated = await this.repos.organizations.update(orgId, {
      ssoConfig: JSON.parse(JSON.stringify(input)),
    });
    await this.auditService.log({
      userId: user.id,
      organizationId: orgId,
      action: 'enterprise.sso_updated',
      module: 'enterprise',
      newValue: input,
      ...meta,
    });
    return (updated.ssoConfig as Record<string, unknown> | null) ?? {};
  }

  async updateRetentionPolicy(
    user: CurrentUser,
    input: Record<string, unknown>,
    meta: AuditMeta,
  ): Promise<Record<string, unknown>> {
    const orgId = this.requireOrg(user);
    const updated = await this.repos.organizations.update(orgId, {
      retentionPolicy: JSON.parse(JSON.stringify(input)),
    });
    await this.auditService.log({
      userId: user.id,
      organizationId: orgId,
      action: 'enterprise.retention_updated',
      module: 'enterprise',
      newValue: input,
      ...meta,
    });
    return (updated.retentionPolicy as Record<string, unknown> | null) ?? {};
  }

  async updateDataResidency(
    user: CurrentUser,
    region: string | null | undefined,
    meta: AuditMeta,
  ) {
    const orgId = this.requireOrg(user);
    const updated = await this.repos.organizations.update(orgId, {
      dataResidencyRegion: region ?? null,
    });
    await this.auditService.log({
      userId: user.id,
      organizationId: orgId,
      action: 'enterprise.data_residency_updated',
      module: 'enterprise',
      newValue: { region },
      ...meta,
    });
    return { region: updated.dataResidencyRegion };
  }

  listDomainGroups(user: CurrentUser) {
    const orgId = this.requireOrg(user);
    return this.repos.domainGroups.listByOrganization(orgId);
  }

  async createDomainGroup(
    user: CurrentUser,
    input: {
      name: string;
      shareConsent?: boolean;
      parentDomainId?: string | null;
      allowedHostnames?: string[];
      domainIds?: string[];
    },
    meta: AuditMeta,
  ) {
    const orgId = this.requireOrg(user);
    const group = await this.repos.domainGroups.create({
      organizationId: orgId,
      ...input,
    });
    await this.auditService.log({
      userId: user.id,
      organizationId: orgId,
      action: 'enterprise.domain_group_created',
      module: 'enterprise',
      newValue: { id: group.id, name: group.name },
      ...meta,
    });
    return group;
  }

  async updateDomainGroup(
    user: CurrentUser,
    groupId: string,
    input: {
      name?: string;
      shareConsent?: boolean;
      parentDomainId?: string | null;
      allowedHostnames?: string[];
    },
    meta: AuditMeta,
  ) {
    const orgId = this.requireOrg(user);
    const group = await this.repos.domainGroups.findById(groupId);
    if (!group || group.organizationId !== orgId) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Domain group not found' });
    }
    const updated = await this.repos.domainGroups.update(groupId, input);
    await this.auditService.log({
      userId: user.id,
      organizationId: orgId,
      action: 'enterprise.domain_group_updated',
      module: 'enterprise',
      newValue: { id: groupId },
      ...meta,
    });
    return updated;
  }

  async deleteDomainGroup(user: CurrentUser, groupId: string, meta: AuditMeta) {
    const orgId = this.requireOrg(user);
    const group = await this.repos.domainGroups.findById(groupId);
    if (!group || group.organizationId !== orgId) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Domain group not found' });
    }
    await this.repos.domainGroups.delete(groupId);
    await this.auditService.log({
      userId: user.id,
      organizationId: orgId,
      action: 'enterprise.domain_group_deleted',
      module: 'enterprise',
      newValue: { id: groupId },
      ...meta,
    });
    return { deleted: true };
  }

  async addDomainToGroup(
    user: CurrentUser,
    groupId: string,
    domainId: string,
    role?: string,
    meta?: AuditMeta,
  ) {
    const orgId = this.requireOrg(user);
    const group = await this.repos.domainGroups.findById(groupId);
    if (!group || group.organizationId !== orgId) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Domain group not found' });
    }
    const domain = await this.repos.domains.findById(domainId);
    if (!domain || domain.organizationId !== orgId) {
      throw new NotFoundException({ code: 'DOMAIN_NOT_FOUND', message: 'Domain not found' });
    }
    await this.repos.domainGroups.addMember(groupId, domainId, role);
    if (meta) {
      await this.auditService.log({
        userId: user.id,
        organizationId: orgId,
        action: 'enterprise.domain_group_member_added',
        module: 'enterprise',
        newValue: { groupId, domainId },
        ...meta,
      });
    }
    return this.repos.domainGroups.findById(groupId);
  }

  async removeDomainFromGroup(
    user: CurrentUser,
    groupId: string,
    domainId: string,
    meta: AuditMeta,
  ) {
    const orgId = this.requireOrg(user);
    const group = await this.repos.domainGroups.findById(groupId);
    if (!group || group.organizationId !== orgId) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Domain group not found' });
    }
    await this.repos.domainGroups.removeMember(groupId, domainId);
    await this.auditService.log({
      userId: user.id,
      organizationId: orgId,
      action: 'enterprise.domain_group_member_removed',
      module: 'enterprise',
      newValue: { groupId, domainId },
      ...meta,
    });
    return this.repos.domainGroups.findById(groupId);
  }

  listCustomRoles(user: CurrentUser) {
    const orgId = this.requireOrg(user);
    return this.repos.enterprise.listCustomRoles(orgId);
  }

  async createCustomRole(
    user: CurrentUser,
    input: { name: string; description?: string; permissions: string[] },
    meta: AuditMeta,
  ) {
    const orgId = this.requireOrg(user);
    const role = await this.repos.enterprise.createCustomRole({
      organizationId: orgId,
      ...input,
    });
    await this.auditService.log({
      userId: user.id,
      organizationId: orgId,
      action: 'enterprise.custom_role_created',
      module: 'enterprise',
      newValue: { id: role.id, slug: role.slug },
      ...meta,
    });
    return role;
  }

  async updateCustomRole(
    user: CurrentUser,
    roleId: string,
    input: { name?: string; description?: string; permissions?: string[] },
    meta: AuditMeta,
  ) {
    const orgId = this.requireOrg(user);
    const role = await this.repos.enterprise.findCustomRoleById(roleId);
    if (!role || role.organizationId !== orgId) {
      throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Custom role not found' });
    }
    const updated = await this.repos.enterprise.updateCustomRole(roleId, input);
    await this.auditService.log({
      userId: user.id,
      organizationId: orgId,
      action: 'enterprise.custom_role_updated',
      module: 'enterprise',
      newValue: { id: roleId },
      ...meta,
    });
    return updated;
  }

  async deleteCustomRole(user: CurrentUser, roleId: string, meta: AuditMeta) {
    const orgId = this.requireOrg(user);
    const role = await this.repos.enterprise.findCustomRoleById(roleId);
    if (!role || role.organizationId !== orgId) {
      throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Custom role not found' });
    }
    await this.repos.enterprise.deleteCustomRole(roleId);
    await this.auditService.log({
      userId: user.id,
      organizationId: orgId,
      action: 'enterprise.custom_role_deleted',
      module: 'enterprise',
      newValue: { id: roleId },
      ...meta,
    });
    return { deleted: true };
  }

  async assignCustomRole(
    user: CurrentUser,
    userId: string,
    customRoleId: string,
    meta: AuditMeta,
  ) {
    const orgId = this.requireOrg(user);
    const target = await this.repos.users.findById(userId);
    if (!target || target.organizationId !== orgId) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    const role = await this.repos.enterprise.findCustomRoleById(customRoleId);
    if (!role || role.organizationId !== orgId) {
      throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Custom role not found' });
    }
    await this.repos.enterprise.assignCustomRole(userId, customRoleId);
    await this.auditService.log({
      userId: user.id,
      organizationId: orgId,
      action: 'enterprise.custom_role_assigned',
      module: 'enterprise',
      newValue: { userId, customRoleId },
      ...meta,
    });
    return { assigned: true };
  }

  async setUserDomainAccess(
    user: CurrentUser,
    userId: string,
    domainId: string,
    permissions: string[],
    meta: AuditMeta,
  ) {
    const orgId = this.requireOrg(user);
    const target = await this.repos.users.findById(userId);
    if (!target || target.organizationId !== orgId) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    const domain = await this.repos.domains.findById(domainId);
    if (!domain || domain.organizationId !== orgId) {
      throw new NotFoundException({ code: 'DOMAIN_NOT_FOUND', message: 'Domain not found' });
    }
    const access = await this.repos.enterprise.upsertDomainAccess(userId, domainId, permissions);
    await this.auditService.log({
      userId: user.id,
      organizationId: orgId,
      action: 'enterprise.domain_access_updated',
      module: 'enterprise',
      newValue: { userId, domainId, permissions },
      ...meta,
    });
    return access;
  }

  async listUserDomainAccess(user: CurrentUser, userId: string) {
    const orgId = this.requireOrg(user);
    const target = await this.repos.users.findById(userId);
    if (!target || target.organizationId !== orgId) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    return this.repos.enterprise.listDomainAccessForUser(userId);
  }

  async computeGroupVisitorIdForDomain(domainId: string, visitorId: string) {
    const member = await this.repos.domainGroups.findMemberByDomainId(domainId);
    if (!member?.group.shareConsent) return null;
    return computeGroupVisitorId(member.group.consentSyncSecret, visitorId);
  }

  async buildCrossDomainGroupPayload(domainId: string) {
    const member = await this.repos.domainGroups.findMemberByDomainId(domainId);
    if (!member?.group.shareConsent) return null;
    const group = await this.repos.domainGroups.findById(member.groupId);
    if (!group) return null;
    return {
      groupId: group.id,
      shareConsent: group.shareConsent,
      memberDomainKeys: group.members.map((m) => m.domain.domainKey),
    };
  }

  async syncGroupConsent(domainKey: string, visitorId: string, groupId: string) {
    const domain = await this.repos.domains.findByDomainKey(domainKey);
    if (!domain) {
      return { ok: false, error: { code: 'DOMAIN_NOT_FOUND', message: 'Invalid domain key' } };
    }

    const member = await this.repos.domainGroups.findMemberByDomainId(domain.id);
    if (!member || member.groupId !== groupId || !member.group.shareConsent) {
      return { ok: false, error: { code: 'GROUP_MISMATCH', message: 'Domain not in consent group' } };
    }

    const groupVisitorId = computeGroupVisitorId(member.group.consentSyncSecret, visitorId);
    const domainIds = member.group.members.map((m) => m.domainId);
    const record = await this.repos.consentSubmissions.findLatestByGroupVisitorId(
      groupVisitorId,
      domainIds,
    );

    if (!record || record.domainId === domain.id) {
      return { ok: true, data: null };
    }

    return {
      ok: true,
      data: {
        sourceDomainId: record.domainId,
        categories: parseJsonRecord(record.categories) as unknown as Record<string, boolean>,
        configVersion: record.configVersion,
        policyVersionId: record.policyVersionId,
        savedAt: record.createdAt.toISOString(),
        expiresAt: record.expiresAt?.toISOString() ?? null,
      },
    };
  }

  buildPublicWhiteLabel(org: { whiteLabel: unknown } | null) {
    const wl = (org?.whiteLabel as Record<string, unknown> | null) ?? {};
    if (!wl || Object.keys(wl).length === 0) return null;
    return {
      logoUrl: wl.logoUrl ?? null,
      primaryColor: wl.primaryColor ?? null,
      cmpBrandName: wl.cmpBrandName ?? null,
      hidePlatformBranding: Boolean(wl.hidePlatformBranding),
    };
  }
}
