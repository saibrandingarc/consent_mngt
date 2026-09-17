import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { fromJsonStringArray, toJsonArray, toJsonString } from '../json-array';

export function generateWebhookSecret() {
  const secret = `whsec_${randomBytes(24).toString('hex')}`;
  return {
    secret,
    secretPrefix: secret.slice(0, 12),
  };
}

export class WebhookRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listEndpoints(organizationId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findEndpointById(id: string) {
    return this.prisma.webhookEndpoint.findFirst({ where: { id } });
  }

  listEnabledForEvent(organizationId: string, eventType: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: {
        organizationId,
        enabled: true,
      },
    }).then((endpoints) =>
      endpoints.filter((endpoint) => {
        const events = fromJsonStringArray(endpoint.events);
        return events.includes(eventType) || events.includes('*');
      }),
    );
  }

  createEndpoint(data: {
    organizationId: string;
    url: string;
    secret: string;
    secretPrefix: string;
    events: string[];
    description?: string | null;
  }) {
    return this.prisma.webhookEndpoint.create({
      data: {
        organizationId: data.organizationId,
        url: data.url,
        secret: data.secret,
        secretPrefix: data.secretPrefix,
        events: toJsonArray(data.events),
        description: data.description ?? null,
      },
    });
  }

  updateEndpoint(
    id: string,
    data: Partial<{
      url: string;
      events: string[];
      enabled: boolean;
      description: string | null;
      secret: string;
      secretPrefix: string;
    }>,
  ) {
    return this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        url: data.url,
        enabled: data.enabled,
        description: data.description,
        secret: data.secret,
        secretPrefix: data.secretPrefix,
        events: data.events ? toJsonArray(data.events) : undefined,
      },
    });
  }

  deleteEndpoint(id: string) {
    return this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  createDelivery(data: {
    webhookEndpointId: string;
    organizationId: string;
    eventType: string;
    payload: Prisma.InputJsonValue;
  }) {
    return this.prisma.webhookDelivery.create({
      data: {
        webhookEndpointId: data.webhookEndpointId,
        organizationId: data.organizationId,
        eventType: data.eventType,
        payload: toJsonString(data.payload),
        status: 'PENDING',
      },
    });
  }

  updateDelivery(
    id: string,
    data: Partial<{
      status: 'PENDING' | 'DELIVERED' | 'FAILED';
      attemptCount: number;
      lastAttemptAt: Date;
      nextRetryAt: Date | null;
      responseStatus: number | null;
      responseBody: string | null;
      errorMessage: string | null;
      deliveredAt: Date | null;
    }>,
  ) {
    return this.prisma.webhookDelivery.update({ where: { id }, data });
  }

  listDeliveries(organizationId: string, webhookEndpointId?: string, limit = 50) {
    return this.prisma.webhookDelivery.findMany({
      where: {
        organizationId,
        ...(webhookEndpointId ? { webhookEndpointId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  findDelivery(id: string) {
    return this.prisma.webhookDelivery.findFirst({ where: { id } });
  }
}
