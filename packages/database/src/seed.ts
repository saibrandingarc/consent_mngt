import { PERMISSIONS, ROLE_DEFINITIONS } from '@cmp/auth';
import { prisma } from './index';
import { MASTER_COOKIE_DEFINITIONS } from './constants/master-cookies';
import { toJsonString, toOptionalJsonString } from './json-array';

const PERMISSION_META: Record<string, { name: string; module: string }> = {
  [PERMISSIONS.ORGANIZATION_MANAGE]: { name: 'Manage organization', module: 'organization' },
  [PERMISSIONS.DOMAIN_MANAGE]: { name: 'Manage domains', module: 'domain' },
  [PERMISSIONS.BANNER_CONFIGURE]: { name: 'Configure banners', module: 'banner' },
  [PERMISSIONS.SCAN_RUN]: { name: 'Run scans', module: 'scanner' },
  [PERMISSIONS.SCAN_VIEW]: { name: 'View scan results', module: 'scanner' },
  [PERMISSIONS.COOKIE_MANAGE]: { name: 'Manage cookies', module: 'cookie' },
  [PERMISSIONS.CONSENT_VIEW]: { name: 'View consent logs', module: 'consent' },
  [PERMISSIONS.CONSENT_EXPORT]: { name: 'Export consent records', module: 'consent' },
  [PERMISSIONS.USER_MANAGE]: { name: 'Manage users', module: 'user' },
  [PERMISSIONS.INTEGRATION_MANAGE]: { name: 'Manage integrations', module: 'integration' },
  [PERMISSIONS.BILLING_MANAGE]: { name: 'Manage billing', module: 'billing' },
  [PERMISSIONS.API_KEY_MANAGE]: { name: 'Manage API keys', module: 'api' },
  [PERMISSIONS.AUDIT_VIEW]: { name: 'View audit logs', module: 'audit' },
};

async function seedPermissions() {
  for (const [slug, meta] of Object.entries(PERMISSION_META)) {
    await prisma.permission.upsert({
      where: { slug },
      create: { slug, name: meta.name, module: meta.module },
      update: { name: meta.name, module: meta.module },
    });
  }
  console.log(`Seeded ${Object.keys(PERMISSION_META).length} permissions`);
}

async function seedRoles() {
  for (const [slug, def] of Object.entries(ROLE_DEFINITIONS)) {
    const role = await prisma.role.upsert({
      where: { slug },
      create: { slug, name: def.name, description: def.description },
      update: { name: def.name, description: def.description },
    });

    const permissions = await prisma.permission.findMany({
      where: { slug: { in: def.permissions } },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }
  console.log(`Seeded ${Object.keys(ROLE_DEFINITIONS).length} roles`);
}

async function seedMasterCookieDefinitions() {
  let created = 0;
  let updated = 0;

  for (const cookie of MASTER_COOKIE_DEFINITIONS) {
    const existing = await prisma.cookieDefinition.findFirst({
      where: {
        organizationId: null,
        cookieName: cookie.cookieName,
        provider: cookie.provider,
      },
    });

    const data = {
      providerDomain: cookie.providerDomain,
      description: cookie.description,
      purpose: cookie.purpose,
      category: cookie.category,
      duration: cookie.duration,
      dataCollected: cookie.dataCollected,
      isThirdParty: cookie.isThirdParty,
      privacyPolicyUrl: cookie.privacyPolicyUrl,
      riskLevel: cookie.riskLevel,
      aliases: toOptionalJsonString(cookie.aliases),
      detectionPatterns: toJsonString(cookie.detectionPatterns),
      isSystem: true,
    };

    if (existing) {
      await prisma.cookieDefinition.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.cookieDefinition.create({
        data: {
          organizationId: null,
          cookieName: cookie.cookieName,
          provider: cookie.provider,
          ...data,
        },
      });
      created += 1;
    }
  }

  console.log(
    `Seeded master cookie definitions (${MASTER_COOKIE_DEFINITIONS.length} total, ${created} created, ${updated} updated)`,
  );
}

async function main() {
  await seedPermissions();
  await seedRoles();
  await seedMasterCookieDefinitions();
  console.log('Database seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
