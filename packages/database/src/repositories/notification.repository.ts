import type { PrismaClient } from '@prisma/client';
import type { NotificationSeverity } from '../enums';
import { toOptionalJsonString } from '../json-array';

export class NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(organizationId: string, unreadOnly = false, limit = 50) {
    return this.prisma.notification.findMany({
      where: {
        organizationId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { domain: { select: { hostname: true } } },
    });
  }

  countUnread(organizationId: string) {
    return this.prisma.notification.count({
      where: { organizationId, readAt: null },
    });
  }

  findRecentDuplicate(
    organizationId: string,
    type: string,
    domainId: string | null,
    since: Date,
  ) {
    return this.prisma.notification.findFirst({
      where: {
        organizationId,
        type,
        domainId,
        createdAt: { gte: since },
      },
    });
  }

  create(data: {
    organizationId: string;
    domainId?: string | null;
    type: string;
    title: string;
    message: string;
    severity?: NotificationSeverity;
    metadata?: unknown;
  }) {
    return this.prisma.notification.create({
      data: {
        organizationId: data.organizationId,
        domainId: data.domainId ?? null,
        type: data.type,
        title: data.title,
        message: data.message,
        severity: data.severity ?? 'INFO',
        metadata: toOptionalJsonString(data.metadata),
      },
    });
  }

  markRead(organizationId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, organizationId },
      data: { readAt: new Date() },
    });
  }

  markAllRead(organizationId: string) {
    return this.prisma.notification.updateMany({
      where: { organizationId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
