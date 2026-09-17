import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AUTH_ERROR_CODES } from '@cmp/auth';
import { AUTH_CONFIG, JWT_CONFIG, SECURITY_CONFIG, APP_URLS } from '@cmp/config';
import type { Auth0TokenClaims, AuthTokens, CurrentUser, PermissionSlug, RoleSlug } from '@cmp/types';
import type { Repositories } from '@cmp/database';
import { REPOS } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { Auth0Service } from './auth0.service';

type UserWithRoles = NonNullable<Awaited<ReturnType<Repositories['users']['findById']>>>;

@Injectable()
export class AuthService {
  constructor(
    @Inject(REPOS) private readonly repos: Repositories,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly auth0Service: Auth0Service,
  ) {}

  async register(input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    const existing = await this.repos.users.findByEmail(input.email);
    if (existing) {
      throw new ConflictException({ code: 'EMAIL_EXISTS', message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const verificationEnabled = AUTH_CONFIG.emailVerificationEnabled;
    const user = await this.repos.users.create({
      email: input.email.toLowerCase(),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      status: verificationEnabled ? 'PENDING' : 'ACTIVE',
      emailVerified: !verificationEnabled,
      ...(verificationEnabled ? {} : { emailVerifiedAt: new Date() }),
    });

    if (verificationEnabled) {
      const token = randomBytes(32).toString('hex');
      const tokenHash = this.hashToken(token);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.repos.authTokens.createEmailVerificationToken(user.id, tokenHash, expiresAt);
      await this.emailService.sendVerificationEmail(user.email, token);

      return {
        message: 'Registration successful. Please verify your email.',
        requiresEmailVerification: true,
      };
    }

    const tokens = await this.issueTokens(user.id);
    return {
      ...tokens,
      message: 'Registration successful. You are now signed in.',
      requiresEmailVerification: false,
    };
  }

  async verifyEmail(token: string) {
    const tokenHash = this.hashToken(token);
    const record = await this.repos.authTokens.findEmailVerificationToken(tokenHash);
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException({ code: 'TOKEN_INVALID', message: 'Invalid or expired token' });
    }

    await this.repos.users.update(record.userId, {
      emailVerified: true,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    });
    await this.repos.authTokens.markEmailVerificationUsed(record.id);

    return { message: 'Email verified successfully' };
  }

  async loginWithAuth0(
    idToken: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<AuthTokens & { isNewUser: boolean }> {
    const profile = await this.auth0Service.verifyIdToken(idToken);
    const { user, isNewUser } = await this.upsertAuth0User(profile, meta);
    const tokens = await this.issueTokens(user.id, meta);
    return { ...tokens, isNewUser };
  }

  async ensureFromAuth0Claims(claims: Auth0TokenClaims): Promise<CurrentUser> {
    if (!claims.sub) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.TOKEN_INVALID,
        message: 'Invalid Auth0 token claims.',
      });
    }

    const existing = await this.repos.users.findByAuth0Sub(claims.sub);
    if (existing) {
      if (existing.deletedAt || existing.status === 'DISABLED' || existing.status === 'DELETED') {
        throw new ForbiddenException({ code: 'ACCOUNT_DISABLED', message: 'Account is disabled' });
      }
      const withRole = await this.ensureOrganizationRole(existing);
      return this.toCurrentUser(withRole);
    }

    const { user } = await this.upsertAuth0User(this.claimsToProfile(claims));
    return this.toCurrentUser(user);
  }

  async syncFromAuth0(
    claims: Auth0TokenClaims,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<CurrentUser> {
    const profile = this.claimsToProfile(claims);
    const { user } = await this.upsertAuth0User(profile, meta);
    return this.getCurrentUser(user.id);
  }

  private claimsToProfile(claims: Auth0TokenClaims) {
    const email = claims.email ?? `${claims.sub.replace('|', '_')}@users.auth0.local`;
    const name = claims.name ?? claims.given_name ?? email.split('@')[0] ?? 'User';
    const parts = name.trim().split(/\s+/);
    return {
      sub: claims.sub,
      email,
      emailVerified: Boolean(claims.email_verified),
      firstName: claims.given_name ?? parts[0] ?? 'User',
      lastName: claims.family_name ?? (parts.length > 1 ? parts.slice(1).join(' ') : ''),
    };
  }

  private async upsertAuth0User(
    profile: {
      sub: string;
      email: string;
      emailVerified: boolean;
      firstName: string;
      lastName: string;
    },
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<{ user: UserWithRoles; isNewUser: boolean }> {
    let user = await this.repos.users.findByAuth0Sub(profile.sub);
    let isNewUser = false;

    if (!user) {
      const existingByEmail = await this.repos.users.findByEmail(profile.email);
      if (existingByEmail) {
        if (existingByEmail.auth0Sub && existingByEmail.auth0Sub !== profile.sub) {
          throw new ConflictException({
            code: 'EMAIL_EXISTS',
            message: 'Email is linked to a different Auth0 account',
          });
        }

        await this.repos.users.update(existingByEmail.id, {
          auth0Sub: profile.sub,
          emailVerified: profile.emailVerified || existingByEmail.emailVerified,
          emailVerifiedAt: existingByEmail.emailVerifiedAt ?? new Date(),
          status: 'ACTIVE',
        });
        user = await this.repos.users.findById(existingByEmail.id);
      }
    }

    if (!user) {
      isNewUser = true;
      const created = await this.repos.users.create({
        email: profile.email,
        auth0Sub: profile.sub,
        firstName: profile.firstName,
        lastName: profile.lastName,
        emailVerified: profile.emailVerified,
        emailVerifiedAt: profile.emailVerified ? new Date() : undefined,
        status: 'ACTIVE',
      });
      user = await this.repos.users.findById(created.id);
    }

    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Unable to load user account',
      });
    }

    if (user.status === 'DISABLED' || user.status === 'DELETED') {
      throw new ForbiddenException({ code: 'ACCOUNT_DISABLED', message: 'Account is disabled' });
    }

    await this.repos.users.update(user.id, {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      ...(profile.emailVerified && !user.emailVerified
        ? { emailVerified: true, emailVerifiedAt: new Date(), status: 'ACTIVE' }
        : {}),
    });
    await this.repos.users.recordLoginHistory(user.id, true, meta?.ipAddress, meta?.userAgent);

    const refreshed = await this.repos.users.findById(user.id);
    if (!refreshed) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Unable to load user account',
      });
    }

    const withRole = await this.ensureOrganizationRole(refreshed);
    return { user: withRole, isNewUser };
  }

  /** Auth0 users linked to an org without a role cannot access protected APIs (403). */
  private async ensureOrganizationRole(user: UserWithRoles): Promise<UserWithRoles> {
    if (!user.organizationId) {
      return user;
    }

    const permissionCount = user.roles.reduce(
      (sum, ur) => sum + ur.role.permissions.length,
      0,
    );

    if (user.roles.length > 0 && permissionCount > 0) {
      return user;
    }

    try {
      await this.repos.users.assignRole(user.id, 'org_owner');
    } catch (err) {
      console.error('[auth] Failed to assign org_owner role:', err);
    }

    const updated = await this.repos.users.findById(user.id);
    return updated ?? user;
  }

  async login(
    email: string,
    password: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    const user = await this.repos.users.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.repos.users.recordLoginHistory(user.id, false, meta?.ipAddress, meta?.userAgent);
      throw new ForbiddenException({
        code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
        message: 'Account is temporarily locked',
      });
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException({
        code: 'USE_AUTH0',
        message: 'This account uses Auth0. Please sign in with Auth0.',
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const failedLoginCount = user.failedLoginCount + 1;
      const updates: { failedLoginCount: number; lockedUntil?: Date } = {
        failedLoginCount,
      };
      if (failedLoginCount >= SECURITY_CONFIG.maxLoginAttempts) {
        updates.lockedUntil = new Date(
          Date.now() + SECURITY_CONFIG.lockoutDurationMinutes * 60 * 1000,
        );
      }
      await this.repos.users.update(user.id, updates);
      await this.repos.users.recordLoginHistory(user.id, false, meta?.ipAddress, meta?.userAgent);
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    if (AUTH_CONFIG.emailVerificationEnabled && !user.emailVerified) {
      throw new ForbiddenException({
        code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
        message: 'Please verify your email before logging in',
      });
    }

    if (!AUTH_CONFIG.emailVerificationEnabled && (!user.emailVerified || user.status === 'PENDING')) {
      await this.repos.users.update(user.id, {
        emailVerified: true,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        status: 'ACTIVE',
      });
    }

    if (user.status === 'DISABLED' || user.status === 'DELETED') {
      throw new ForbiddenException({ code: 'ACCOUNT_DISABLED', message: 'Account is disabled' });
    }

    await this.repos.users.update(user.id, {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    });
    await this.repos.users.recordLoginHistory(user.id, true, meta?.ipAddress, meta?.userAgent);

    return this.issueTokens(user.id, meta);
  }

  async refresh(refreshToken: string, meta?: { ipAddress?: string; userAgent?: string }) {
    const tokenHash = this.hashToken(refreshToken);
    const record = await this.repos.authTokens.findRefreshToken(tokenHash);
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.TOKEN_INVALID,
        message: 'Invalid refresh token',
      });
    }

    await this.repos.authTokens.revokeRefreshToken(tokenHash);
    return this.issueTokens(record.userId, meta);
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.repos.authTokens.revokeRefreshToken(tokenHash);
    return { message: 'Logged out' };
  }

  async logoutAll(userId: string) {
    await this.repos.authTokens.revokeAllUserTokens(userId);
    return { message: 'Logged out from all devices' };
  }

  async forgotPassword(email: string) {
    const user = await this.repos.users.findByEmail(email);
    if (!user) {
      return { message: 'If the email exists, a reset link has been sent' };
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.repos.authTokens.createPasswordResetToken(user.id, tokenHash, expiresAt);
    await this.emailService.sendPasswordResetEmail(user.email, token);

    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = this.hashToken(token);
    const record = await this.repos.authTokens.findPasswordResetToken(tokenHash);
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException({ code: 'TOKEN_INVALID', message: 'Invalid or expired token' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await this.repos.users.update(record.userId, { passwordHash, failedLoginCount: 0, lockedUntil: null });
    await this.repos.authTokens.markPasswordResetUsed(record.id);
    await this.repos.authTokens.revokeAllUserTokens(record.userId);

    return { message: 'Password reset successfully' };
  }

  async getCurrentUser(userId: string): Promise<CurrentUser> {
    const user = await this.repos.users.findById(userId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'User not found' });
    }
    const withRole = await this.ensureOrganizationRole(user);
    return this.toCurrentUser(withRole);
  }

  async getLoginHistory(userId: string, limit = 50) {
    return this.repos.users.listLoginHistory(userId, limit);
  }

  private async issueTokens(
    userId: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    const user = await this.repos.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'User not found' });
    }

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, type: 'access' },
      { secret: JWT_CONFIG.accessSecret(), expiresIn: JWT_CONFIG.accessExpiresIn },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.repos.authTokens.createRefreshToken({
      userId: user.id,
      tokenHash,
      expiresAt,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
    };
  }

  private toCurrentUser(user: UserWithRoles): CurrentUser {
    const roles = user.roles.map((ur) => ur.role.slug as RoleSlug);
    const permissions = new Set<PermissionSlug>(
      user.roles.flatMap((ur) =>
        ur.role.permissions.map((rp) => rp.permission.slug as PermissionSlug),
      ),
    );
    for (const assignment of user.customRoles ?? []) {
      const customPermissions = assignment.customRole?.permissions;
      const permissionList = Array.isArray(customPermissions)
        ? customPermissions
        : [];
      for (const permission of permissionList) {
        if (typeof permission === 'string') {
          permissions.add(permission as PermissionSlug);
        }
      }
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      emailVerified: AUTH_CONFIG.emailVerificationEnabled ? user.emailVerified : true,
      organizationId: user.organizationId,
      roles,
      permissions: [...permissions],
    };
  }

  async getSsoLoginHint(orgSlug: string) {
    const org = await this.repos.organizations.findBySlug(orgSlug);
    if (!org) {
      return { ok: false, error: { code: 'ORG_NOT_FOUND', message: 'Organization not found' } };
    }
    const sso = (org.ssoConfig as {
      enabled?: boolean;
      connectionName?: string;
      provider?: string;
    } | null) ?? {};
    if (!sso.enabled || !sso.connectionName) {
      return {
        ok: false,
        error: { code: 'SSO_NOT_CONFIGURED', message: 'SSO is not enabled for this organization' },
      };
    }
    const adminBase = process.env.ADMIN_URL ?? APP_URLS.admin;
    return {
      ok: true,
      data: {
        organizationSlug: org.slug,
        connectionName: sso.connectionName,
        provider: sso.provider ?? 'oidc',
        loginHint: `Use Auth0 Universal Login with connection="${sso.connectionName}"`,
        adminLoginUrl: `${adminBase}/auth/login?connection=${encodeURIComponent(sso.connectionName)}`,
      },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
