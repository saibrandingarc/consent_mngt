import type { PrismaClient } from '@prisma/client';
import { toOptionalJsonString } from '../json-array';

export interface AuditLogInput {
  userId?: string | null;
  organizationId?: string | null;
  action: string;
  module: string;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export class AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        organizationId: input.organizationId ?? null,
        action: input.action,
        module: input.module,
        previousValue: toOptionalJsonString(input.previousValue),
        newValue: toOptionalJsonString(input.newValue),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
      },
    });
  }

  listByOrganization(
    organizationId: string,
    options: {
      module?: string;
      action?: string;
      userId?: string;
      from?: Date;
      to?: Date;
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    const limit = options.limit ?? 50;
    return this.prisma.auditLog.findMany({
      where: {
        organizationId,
        ...(options.module ? { module: options.module } : {}),
        ...(options.action ? { action: options.action } : {}),
        ...(options.userId ? { userId: options.userId } : {}),
        ...(options.from || options.to
          ? {
              createdAt: {
                ...(options.from ? { gte: options.from } : {}),
                ...(options.to ? { lte: options.to } : {}),
              },
            }
          : {}),
        ...(options.cursor ? { id: { lt: options.cursor } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }

  exportByOrganization(
    organizationId: string,
    options: {
      module?: string;
      action?: string;
      userId?: string;
      from?: Date;
      to?: Date;
    } = {},
  ) {
    return this.prisma.auditLog.findMany({
      where: {
        organizationId,
        ...(options.module ? { module: options.module } : {}),
        ...(options.action ? { action: options.action } : {}),
        ...(options.userId ? { userId: options.userId } : {}),
        ...(options.from || options.to
          ? {
              createdAt: {
                ...(options.from ? { gte: options.from } : {}),
                ...(options.to ? { lte: options.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }
}
