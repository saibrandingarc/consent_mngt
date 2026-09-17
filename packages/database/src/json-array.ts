export function toJsonArray(values: string[] | undefined): string {
  return JSON.stringify(values ?? []);
}

export function toJsonString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value ?? null);
}

export function toOptionalJsonString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return toJsonString(value);
}

export function fromJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      return [];
    }
  }
  return [];
}

const JSON_FIELD_NAMES = new Set([
  'whiteLabel',
  'ssoConfig',
  'retentionPolicy',
  'previousValue',
  'newValue',
  'sdkLastHeartbeat',
  'checks',
  'externalSignals',
  'scriptMappings',
  'vendorPurposes',
  'categoriesSnapshot',
  'bannerContent',
  'legalText',
  'regulationConfig',
  'defaultConsentStates',
  'supportedLanguages',
  'renewalReason',
  'metadata',
  'categories',
  'vendors',
  'policySnapshot',
  'includePaths',
  'excludePaths',
  'aliases',
  'detectionPatterns',
  'resultSummary',
  'scopes',
  'events',
  'payload',
  'responseBody',
  'allowedHostnames',
  'permissions',
  'suggestion',
  'evidence',
  'scenarios',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

export function serializeJsonFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(serializeJsonFields);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (JSON_FIELD_NAMES.has(key) && nested !== undefined && nested !== null && typeof nested !== 'string') {
      next[key] = JSON.stringify(nested);
    } else {
      next[key] = serializeJsonFields(nested);
    }
  }
  return next;
}

export function deserializeJsonFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deserializeJsonFields);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (JSON_FIELD_NAMES.has(key) && typeof nested === 'string') {
      try {
        next[key] = JSON.parse(nested);
      } catch {
        next[key] = nested;
      }
    } else {
      next[key] = deserializeJsonFields(nested);
    }
  }
  return next;
}
