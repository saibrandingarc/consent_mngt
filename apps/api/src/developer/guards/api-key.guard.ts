import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Inject } from '@nestjs/common';
import type { Repositories } from '@cmp/database';
import { fromJsonStringArray, hashApiKey } from '@cmp/database';
import { REPOS } from '../../database/database.module';
import { API_KEY_SCOPES_KEY } from '../decorators/api-key-scope.decorator';

export interface ApiKeyContext {
  apiKeyId: string;
  organizationId: string;
  environment: 'PRODUCTION' | 'SANDBOX';
  scopes: string[];
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject(REPOS) private readonly repos: Repositories,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      apiKeyContext?: ApiKeyContext;
    }>();

    const rawKey = extractApiKey(request.headers);
    if (!rawKey) {
      throw new UnauthorizedException({
        code: 'API_KEY_REQUIRED',
        message: 'Provide an API key via Authorization: Bearer cmp_… or X-API-Key',
      });
    }

    const record = await this.repos.apiKeys.findByHash(hashApiKey(rawKey));
    if (!record) {
      throw new UnauthorizedException({ code: 'API_KEY_INVALID', message: 'Invalid API key' });
    }
    if (record.expiresAt && record.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'API_KEY_EXPIRED', message: 'API key expired' });
    }

    const scopes = fromJsonStringArray(record.scopes);
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(API_KEY_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredScopes?.length) {
      const allowed = requiredScopes.some((scope) => scopes.includes(scope));
      if (!allowed) {
        throw new ForbiddenException({
          code: 'API_KEY_SCOPE_DENIED',
          message: `API key missing required scope: ${requiredScopes.join(' or ')}`,
        });
      }
    }

    request.apiKeyContext = {
      apiKeyId: record.id,
      organizationId: record.organizationId,
      environment: record.environment === 'SANDBOX' ? 'SANDBOX' : 'PRODUCTION',
      scopes,
    };

    void this.repos.apiKeys.touchLastUsed(record.id);
    return true;
  }
}

function extractApiKey(headers: Record<string, string | string[] | undefined>) {
  const authorization = headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    const token = authorization.slice(7).trim();
    if (token.startsWith('cmp_')) return token;
  }
  const headerKey = headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.startsWith('cmp_')) {
    return headerKey.trim();
  }
  return null;
}
