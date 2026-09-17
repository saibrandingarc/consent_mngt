import { PrismaClient } from '@prisma/client';
import { deserializeJsonFields, serializeJsonFields } from './json-array';
import * as Enums from './enums';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const serialized = serializeJsonFields(args) as typeof args;
          const result = await query(serialized);
          return deserializeJsonFields(result);
        },
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export * from '@prisma/client';
export * from './enums';
export { createRepositories } from './repositories';
export type { Repositories } from './repositories';
export { DEFAULT_BANNER_CONTENT, DEFAULT_CONSENT_CATEGORIES } from './constants/default-consent';
export { MASTER_COOKIE_DEFINITIONS } from './constants/master-cookies';
export type { CookieDetectionPatterns, MasterCookieSeed } from './constants/master-cookies';
export { initializeDomainConsent } from './repositories/consent.repository';
export type { ScanFindingInput } from './repositories/scan.repository';
export {
  generateApiKeyMaterial,
  hashApiKey,
} from './repositories/api-key.repository';
export { generateWebhookSecret } from './repositories/webhook.repository';
export { Enums };
