import { createHmac } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Repositories } from '@cmp/database';
import type { WebhookDelivery } from '@cmp/database';
import { parseJsonRecord } from '@cmp/database';
import { REPOS } from '../database/database.module';

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 30_000, 300_000];

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(@Inject(REPOS) private readonly repos: Repositories) {}

  signPayload(secret: string, timestamp: number, body: string) {
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    return `t=${timestamp},v1=${signature}`;
  }

  async emit(organizationId: string, eventType: string, data: Record<string, unknown>) {
    const endpoints = await this.repos.webhooks.listEnabledForEvent(organizationId, eventType);
    if (!endpoints.length) return;

    const envelope = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      type: eventType,
      createdAt: new Date().toISOString(),
      data,
    };

    for (const endpoint of endpoints) {
      const delivery = await this.repos.webhooks.createDelivery({
        webhookEndpointId: endpoint.id,
        organizationId,
        eventType,
        payload: JSON.parse(JSON.stringify(envelope)),
      });
      await this.deliverWithRetries(delivery.id, endpoint.url, endpoint.secret, envelope);
    }
  }

  async retryDelivery(deliveryId: string): Promise<WebhookDelivery | null> {
    const delivery = await this.repos.webhooks.findDelivery(deliveryId);
    if (!delivery) return null;
    const endpoint = await this.repos.webhooks.findEndpointById(delivery.webhookEndpointId);
    if (!endpoint) return null;
    await this.deliverWithRetries(
      delivery.id,
      endpoint.url,
      endpoint.secret,
      parseJsonRecord(delivery.payload),
    );
    return this.repos.webhooks.findDelivery(deliveryId);
  }

  private async deliverWithRetries(
    deliveryId: string,
    url: string,
    secret: string,
    envelope: Record<string, unknown>,
  ) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const delay = RETRY_DELAYS_MS[attempt] ?? 0;
      if (delay > 0) {
        await sleep(delay);
      }

      const result = await this.sendOnce(url, secret, envelope);
      const attemptCount = attempt + 1;

      await this.repos.webhooks.updateDelivery(deliveryId, {
        attemptCount,
        lastAttemptAt: new Date(),
        responseStatus: result.status,
        responseBody: result.body?.slice(0, 2000) ?? null,
        errorMessage: result.error ?? null,
        status: result.ok ? 'DELIVERED' : attemptCount >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
        deliveredAt: result.ok ? new Date() : null,
        nextRetryAt:
          result.ok || attemptCount >= MAX_ATTEMPTS
            ? null
            : new Date(Date.now() + (RETRY_DELAYS_MS[attemptCount] ?? 300_000)),
      });

      if (result.ok) return;
    }
  }

  private async sendOnce(url: string, secret: string, envelope: Record<string, unknown>) {
    const body = JSON.stringify(envelope);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.signPayload(secret, timestamp, body);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'CMP-Webhook/1.0',
          'CMP-Signature': signature,
          'CMP-Event': String(envelope.type ?? ''),
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        body: text,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delivery failed';
      this.logger.warn(`Webhook delivery failed: ${message}`);
      return { ok: false, status: null, body: null, error: message };
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
