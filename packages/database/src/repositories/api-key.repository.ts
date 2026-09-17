import { createHash, randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { toJsonArray, toJsonString } from '../json-array';

function hashSecret(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function generateApiKeyMaterial(environment: 'PRODUCTION' | 'SANDBOX') {
  const label = environment === 'SANDBOX' ? 'cmp_test' : 'cmp_live';
  const token = randomBytes(24).toString('hex');
  const fullKey = `${label}_${token}`;
  return {
    fullKey,
    keyPrefix: fullKey.slice(0, 16),
    keyHash: hashSecret(fullKey),
  };
}

export function hashApiKey(fullKey: string) {
  return hashSecret(fullKey);
}

export class ApiKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listByOrganization(organizationId: string) {
    return this.prisma.apiKey.findMany({
      where: { organizationId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.apiKey.findFirst({ where: { id, revokedAt: null } });
  }

  findByHash(keyHash: string) {
    return this.prisma.apiKey.findFirst({
      where: { keyHash, revokedAt: null },
    });
  }

  async create(data: {
    organizationId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: string[];
    environment: 'PRODUCTION' | 'SANDBOX';
    expiresAt?: Date | null;
    createdByUserId?: string | null;
  }) {
    return this.prisma.apiKey.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        keyPrefix: data.keyPrefix,
        keyHash: data.keyHash,
        scopes: toJsonArray(data.scopes),
        environment: data.environment,
        expiresAt: data.expiresAt ?? null,
        createdByUserId: data.createdByUserId ?? null,
      },
    });
  }

  touchLastUsed(id: string) {
    return this.prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  revoke(id: string) {
    return this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  findIdempotency(organizationId: string, idempotencyKey: string) {
    return this.prisma.apiIdempotencyKey.findFirst({
      where: {
        organizationId,
        idempotencyKey,
        expiresAt: { gt: new Date() },
      },
    });
  }

  saveIdempotency(data: {
    organizationId: string;
    apiKeyId?: string | null;
    idempotencyKey: string;
    method: string;
    path: string;
    statusCode: number;
    responseBody: Prisma.InputJsonValue;
    expiresAt: Date;
  }) {
    return this.prisma.apiIdempotencyKey.create({
      data: {
        ...data,
        responseBody: toJsonString(data.responseBody),
      },
    });
  }
}
