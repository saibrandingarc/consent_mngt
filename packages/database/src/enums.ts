/** SQL Server stores these as NVARCHAR; values match the previous Prisma enums. */

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  PENDING: 'PENDING',
  LOCKED: 'LOCKED',
  DISABLED: 'DISABLED',
  DELETED: 'DELETED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const OrganizationStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
} as const;
export type OrganizationStatus = (typeof OrganizationStatus)[keyof typeof OrganizationStatus];

export const DomainType = {
  ROOT: 'ROOT',
  SUBDOMAIN: 'SUBDOMAIN',
  STAGING: 'STAGING',
  ALIAS: 'ALIAS',
} as const;
export type DomainType = (typeof DomainType)[keyof typeof DomainType];

export const DomainVerificationStatus = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
} as const;
export type DomainVerificationStatus = (typeof DomainVerificationStatus)[keyof typeof DomainVerificationStatus];

export const DomainVerificationMethod = {
  DNS_TXT: 'DNS_TXT',
  HTML_FILE: 'HTML_FILE',
  META_TAG: 'META_TAG',
  CMP_SCRIPT: 'CMP_SCRIPT',
  MANUAL: 'MANUAL',
} as const;
export type DomainVerificationMethod = (typeof DomainVerificationMethod)[keyof typeof DomainVerificationMethod];

export const ScanFrequency = {
  MANUAL: 'MANUAL',
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
} as const;
export type ScanFrequency = (typeof ScanFrequency)[keyof typeof ScanFrequency];

export const ValidationCheckStatus = {
  PASS: 'PASS',
  WARNING: 'WARNING',
  FAIL: 'FAIL',
} as const;
export type ValidationCheckStatus = (typeof ValidationCheckStatus)[keyof typeof ValidationCheckStatus];

export const ConsentCategoryDefaultState = {
  ENABLED: 'ENABLED',
  DISABLED: 'DISABLED',
} as const;
export type ConsentCategoryDefaultState = (typeof ConsentCategoryDefaultState)[keyof typeof ConsentCategoryDefaultState];

export const PolicyVersionStatus = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type PolicyVersionStatus = (typeof PolicyVersionStatus)[keyof typeof PolicyVersionStatus];

export const ConsentEventType = {
  INITIAL_CONSENT: 'INITIAL_CONSENT',
  CONSENT_UPDATE: 'CONSENT_UPDATE',
  CONSENT_WITHDRAWAL: 'CONSENT_WITHDRAWAL',
  CONSENT_RENEWAL: 'CONSENT_RENEWAL',
  POLICY_RENEWAL: 'POLICY_RENEWAL',
  CONSENT_EXPIRATION: 'CONSENT_EXPIRATION',
  ADMIN_INVALIDATION: 'ADMIN_INVALIDATION',
} as const;
export type ConsentEventType = (typeof ConsentEventType)[keyof typeof ConsentEventType];

export const ConsentStatus = {
  GRANTED: 'GRANTED',
  PARTIAL: 'PARTIAL',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type ConsentStatus = (typeof ConsentStatus)[keyof typeof ConsentStatus];

export const ScanStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus];

export const ScanFindingType = {
  COOKIE: 'COOKIE',
  LOCAL_STORAGE: 'LOCAL_STORAGE',
  SESSION_STORAGE: 'SESSION_STORAGE',
  INDEXED_DB: 'INDEXED_DB',
  SCRIPT: 'SCRIPT',
  IFRAME: 'IFRAME',
  PIXEL: 'PIXEL',
  NETWORK_REQUEST: 'NETWORK_REQUEST',
  SERVICE_WORKER: 'SERVICE_WORKER',
} as const;
export type ScanFindingType = (typeof ScanFindingType)[keyof typeof ScanFindingType];

export const ScanConsentState = {
  BEFORE_CONSENT: 'BEFORE_CONSENT',
  AFTER_ACCEPT: 'AFTER_ACCEPT',
  AFTER_REJECT: 'AFTER_REJECT',
} as const;
export type ScanConsentState = (typeof ScanConsentState)[keyof typeof ScanConsentState];

export const CookieReviewStatus = {
  PENDING: 'PENDING',
  AUTO_MATCHED: 'AUTO_MATCHED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type CookieReviewStatus = (typeof CookieReviewStatus)[keyof typeof CookieReviewStatus];

export const CookieMatchMethod = {
  EXACT: 'EXACT',
  PREFIX: 'PREFIX',
  SUFFIX: 'SUFFIX',
  REGEX: 'REGEX',
  PROVIDER_DOMAIN: 'PROVIDER_DOMAIN',
  SCRIPT_SOURCE: 'SCRIPT_SOURCE',
  NETWORK_ENDPOINT: 'NETWORK_ENDPOINT',
  VENDOR_SIGNATURE: 'VENDOR_SIGNATURE',
  MANUAL: 'MANUAL',
} as const;
export type CookieMatchMethod = (typeof CookieMatchMethod)[keyof typeof CookieMatchMethod];

export const CookieRiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;
export type CookieRiskLevel = (typeof CookieRiskLevel)[keyof typeof CookieRiskLevel];

export const NotificationSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
} as const;
export type NotificationSeverity = (typeof NotificationSeverity)[keyof typeof NotificationSeverity];

export const ReportScheduleFrequency = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
} as const;
export type ReportScheduleFrequency = (typeof ReportScheduleFrequency)[keyof typeof ReportScheduleFrequency];

export const ReportType = {
  COMPLIANCE: 'COMPLIANCE',
  SCAN_SUMMARY: 'SCAN_SUMMARY',
  CONSENT_EXPORT: 'CONSENT_EXPORT',
} as const;
export type ReportType = (typeof ReportType)[keyof typeof ReportType];

export const ReportRunStatus = {
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type ReportRunStatus = (typeof ReportRunStatus)[keyof typeof ReportRunStatus];

export const ApiKeyEnvironment = {
  PRODUCTION: 'PRODUCTION',
  SANDBOX: 'SANDBOX',
} as const;
export type ApiKeyEnvironment = (typeof ApiKeyEnvironment)[keyof typeof ApiKeyEnvironment];

export const WebhookDeliveryStatus = {
  PENDING: 'PENDING',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
} as const;
export type WebhookDeliveryStatus = (typeof WebhookDeliveryStatus)[keyof typeof WebhookDeliveryStatus];

export const AiSuggestionType = {
  COOKIE_CLASSIFICATION: 'COOKIE_CLASSIFICATION',
  COOKIE_DESCRIPTION: 'COOKIE_DESCRIPTION',
  COMPLIANCE_RECOMMENDATION: 'COMPLIANCE_RECOMMENDATION',
  BANNER_TEXT: 'BANNER_TEXT',
  MISCLASSIFIED_NECESSARY: 'MISCLASSIFIED_NECESSARY',
} as const;
export type AiSuggestionType = (typeof AiSuggestionType)[keyof typeof AiSuggestionType];

export const AiSuggestionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  APPLIED: 'APPLIED',
} as const;
export type AiSuggestionStatus = (typeof AiSuggestionStatus)[keyof typeof AiSuggestionStatus];

