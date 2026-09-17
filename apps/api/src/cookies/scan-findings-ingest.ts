import type { ScanFindingType } from '@cmp/database';
import { buildCookieKey } from './scan-comparison';
import { matchTracker } from '../scans/scanner/tracker-patterns';
import { getHostname } from '../scans/scanner/crawl.util';

const INGESTIBLE_FINDING_TYPES: ScanFindingType[] = [
  'COOKIE',
  'LOCAL_STORAGE',
  'SESSION_STORAGE',
  'INDEXED_DB',
  'SCRIPT',
  'IFRAME',
  'PIXEL',
  'NETWORK_REQUEST',
  'SERVICE_WORKER',
];

export interface GroupedScanFinding {
  inventoryKey: string;
  cookieName: string;
  cookieDomain: string | null;
  sourceUrl: string | null;
  pageUrl: string | null;
  isThirdParty: boolean | null;
  expiresAt: Date | null;
  foundBeforeConsent: boolean;
  findingType: ScanFindingType;
  metadata?: Record<string, unknown>;
}

export function buildInventoryKey(
  findingType: ScanFindingType,
  name: string,
  cookieDomain?: string | null,
  sourceUrl?: string | null,
  pageUrl?: string | null,
): string {
  const pageHost = pageUrl ? getHostname(pageUrl) ?? '' : '';
  switch (findingType) {
    case 'COOKIE':
      return buildCookieKey(name, cookieDomain ?? null);
    case 'LOCAL_STORAGE':
      return `localStorage|${pageHost}|${name}`;
    case 'SESSION_STORAGE':
      return `sessionStorage|${pageHost}|${name}`;
    case 'INDEXED_DB':
      return `indexedDB|${pageHost}|${name}`;
    case 'SERVICE_WORKER':
      return `serviceWorker|${sourceUrl ?? name}`;
    case 'SCRIPT':
    case 'IFRAME':
    case 'PIXEL':
    case 'NETWORK_REQUEST':
      return `tracker|${findingType}|${name}|${sourceUrl ?? ''}`;
    default:
      return `${findingType}|${name}|${cookieDomain ?? ''}|${sourceUrl ?? ''}|${pageHost}`;
  }
}

export function resolveTrackerCategory(name: string, sourceUrl: string | null): string | null {
  if (sourceUrl) {
    const byUrl = matchTracker(sourceUrl);
    if (byUrl) return byUrl.category;
  }
  const byName = matchTracker(name);
  if (byName) return byName.category;
  return null;
}

export function resolveStorageCategory(pageUrl: string | null): string | null {
  if (!pageUrl) return null;
  const fromTracker = matchTracker(pageUrl);
  if (fromTracker) return fromTracker.category;
  const host = getHostname(pageUrl)?.toLowerCase() ?? '';
  if (host.includes('youtube-nocookie') || host.includes('youtube.com')) {
    return 'marketing';
  }
  return null;
}

export function resolveProviderDomain(entry: {
  cookieDomain?: string | null;
  sourceUrl?: string | null;
  pageUrl?: string | null;
}): string | null {
  if (entry.cookieDomain) {
    return entry.cookieDomain.replace(/^\./, '');
  }
  if (entry.sourceUrl) {
    return getHostname(entry.sourceUrl);
  }
  if (entry.pageUrl) {
    return getHostname(entry.pageUrl);
  }
  return null;
}

export function isTrackerFindingType(findingType: string) {
  return ['SCRIPT', 'IFRAME', 'PIXEL', 'NETWORK_REQUEST', 'SERVICE_WORKER'].includes(findingType);
}

export function isStorageFindingType(findingType: string) {
  return ['LOCAL_STORAGE', 'SESSION_STORAGE', 'INDEXED_DB'].includes(findingType);
}

function isFirstPartyHost(hostname: string, siteHostname: string) {
  const host = hostname.toLowerCase();
  const site = siteHostname.toLowerCase();
  return host === site || host.endsWith(`.${site}`);
}

/** Skip first-party app bundles; keep cookies, storage, and third-party / known trackers. */
function isFirstPartyAppBundle(url: string, siteHostname: string) {
  try {
    const host = new URL(url).hostname;
    if (!isFirstPartyHost(host, siteHostname)) return false;
    return /\/_next\/|\/static\/chunks\/|webpack|hot-update/i.test(url);
  } catch {
    return false;
  }
}

export function shouldIncludeInInventory(
  finding: {
    findingType: string;
    name: string;
    sourceUrl: string | null;
    pageUrl?: string | null;
    isThirdParty: boolean | null;
    metadata: unknown;
  },
  siteHostname: string,
): boolean {
  if (!INGESTIBLE_FINDING_TYPES.includes(finding.findingType as ScanFindingType)) return false;

  if (finding.findingType === 'COOKIE' || isStorageFindingType(finding.findingType)) {
    return true;
  }

  if (finding.name === 'inline-script') return false;

  const candidateUrl =
    finding.sourceUrl ??
    finding.pageUrl ??
    (finding.name.startsWith('http://') || finding.name.startsWith('https://') ? finding.name : null);

  if (candidateUrl && matchTracker(candidateUrl)) return true;
  if (matchTracker(finding.name)) return true;
  if (finding.isThirdParty) return true;

  if (candidateUrl && isFirstPartyAppBundle(candidateUrl, siteHostname)) return false;

  if (candidateUrl && siteHostname) {
    try {
      const host = new URL(candidateUrl).hostname;
      if (!isFirstPartyHost(host, siteHostname)) return true;
    } catch {
      /* ignore invalid URL */
    }
  }

  return Boolean(candidateUrl);
}

export function groupScanFindingsForIngest(
  findings: Array<{
    findingType: string;
    consentState: string;
    name: string;
    cookieDomain: string | null;
    sourceUrl: string | null;
    pageUrl?: string | null;
    expiresAt: Date | null;
    isThirdParty: boolean | null;
    technology: string | null;
    metadata: unknown;
  }>,
): GroupedScanFinding[] {
  const grouped = new Map<string, GroupedScanFinding>();

  for (const finding of findings) {
    if (!INGESTIBLE_FINDING_TYPES.includes(finding.findingType as ScanFindingType)) continue;

    const inventoryKey = buildInventoryKey(
      finding.findingType as ScanFindingType,
      finding.name,
      finding.cookieDomain ?? null,
      finding.sourceUrl ?? null,
      finding.pageUrl ?? null,
    );

    const existing = grouped.get(inventoryKey);
    const foundBeforeConsent =
      finding.consentState === 'BEFORE_CONSENT' || existing?.foundBeforeConsent;

    const baseMetadata: Record<string, unknown> = {
      findingType: finding.findingType,
    };
    if (finding.technology) baseMetadata.technology = finding.technology;
    if (finding.metadata && typeof finding.metadata === 'object') {
      Object.assign(baseMetadata, finding.metadata as Record<string, unknown>);
    }

    grouped.set(inventoryKey, {
      inventoryKey,
      cookieName: finding.name,
      cookieDomain: finding.cookieDomain,
      sourceUrl: finding.sourceUrl,
      pageUrl: finding.pageUrl ?? null,
      expiresAt: finding.expiresAt ?? existing?.expiresAt ?? null,
      isThirdParty: finding.isThirdParty ?? existing?.isThirdParty ?? null,
      foundBeforeConsent: Boolean(foundBeforeConsent),
      findingType: finding.findingType as ScanFindingType,
      metadata: baseMetadata,
    });
  }

  return Array.from(grouped.values());
}

export function countInventoryFromFindings(
  findings: Array<{
    findingType: string;
    consentState: string;
    name: string;
    cookieDomain: string | null;
    sourceUrl: string | null;
    pageUrl?: string | null;
    expiresAt: Date | null;
    isThirdParty: boolean | null;
    technology: string | null;
    metadata: unknown;
  }>,
  siteHostname: string,
) {
  const inventoryFindings = findings.filter((f) => shouldIncludeInInventory(f, siteHostname));
  const grouped = groupScanFindingsForIngest(inventoryFindings);
  const cookies = grouped.filter(
    (g) =>
      g.findingType === 'COOKIE' || isStorageFindingType(g.findingType),
  ).length;
  const trackers = grouped.filter((g) => isTrackerFindingType(g.findingType)).length;
  return { inventoryItems: grouped.length, cookies, trackers };
}
