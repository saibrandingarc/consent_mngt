'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ProtectedLayout } from '@/components/protected-layout';
import { apiFetch } from '@/lib/api';

type Tab = 'white-label' | 'sso' | 'retention' | 'groups' | 'roles';

interface EnterpriseSettings {
  whiteLabel: Record<string, unknown>;
  ssoConfig: Record<string, unknown>;
  retentionPolicy: Record<string, unknown>;
  dataResidencyRegion: string | null;
}

interface DomainGroup {
  id: string;
  name: string;
  slug: string;
  shareConsent: boolean;
  members: Array<{ domainId: string; role: string; domain: { hostname: string; domainKey: string } }>;
}

interface CustomRole {
  id: string;
  slug: string;
  name: string;
  permissions: string[];
}

export default function EnterprisePage() {
  const [tab, setTab] = useState<Tab>('white-label');
  const [settings, setSettings] = useState<EnterpriseSettings | null>(null);
  const [groups, setGroups] = useState<DomainGroup[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [message, setMessage] = useState('');

  function load() {
    apiFetch<EnterpriseSettings>('/enterprise/settings').then((r) => {
      if (r.data) setSettings(r.data);
    });
    apiFetch<DomainGroup[]>('/enterprise/domain-groups').then((r) => {
      if (r.data) setGroups(r.data);
    });
    apiFetch<CustomRole[]>('/enterprise/custom-roles').then((r) => {
      if (r.data) setRoles(r.data);
    });
  }

  useEffect(() => {
    load();
  }, []);

  async function saveWhiteLabel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const result = await apiFetch('/enterprise/white-label', {
      method: 'PATCH',
      body: JSON.stringify({
        logoUrl: form.get('logoUrl') || null,
        primaryColor: form.get('primaryColor') || null,
        dashboardTitle: form.get('dashboardTitle') || null,
        cmpBrandName: form.get('cmpBrandName') || null,
        hidePlatformBranding: form.get('hidePlatformBranding') === 'on',
        customScriptDomain: form.get('customScriptDomain') || null,
      }),
    });
    setMessage(result.ok ? 'White-label saved' : result.error?.message ?? 'Save failed');
    load();
  }

  async function saveSso(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const result = await apiFetch('/enterprise/sso', {
      method: 'PATCH',
      body: JSON.stringify({
        enabled: form.get('enabled') === 'on',
        provider: form.get('provider') || null,
        connectionName: form.get('connectionName') || null,
        issuerUrl: form.get('issuerUrl') || null,
        mfaRequired: form.get('mfaRequired') === 'on',
      }),
    });
    setMessage(result.ok ? 'SSO settings saved' : result.error?.message ?? 'Save failed');
    load();
  }

  async function saveRetention(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const result = await apiFetch('/enterprise/retention', {
      method: 'PATCH',
      body: JSON.stringify({
        consentRetentionDays: Number(form.get('consentRetentionDays') || 0) || null,
        consentDeletionEnabled: form.get('consentDeletionEnabled') === 'on',
        auditRetentionDays: Number(form.get('auditRetentionDays') || 0) || null,
      }),
    });
    setMessage(result.ok ? 'Retention policy saved' : result.error?.message ?? 'Save failed');
    load();
  }

  async function createGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const result = await apiFetch('/enterprise/domain-groups', {
      method: 'POST',
      body: JSON.stringify({ name: form.get('name'), shareConsent: true }),
    });
    setMessage(result.ok ? 'Domain group created' : result.error?.message ?? 'Failed');
    load();
  }

  const wl = settings?.whiteLabel ?? {};
  const sso = settings?.ssoConfig ?? {};
  const retention = settings?.retentionPolicy ?? {};

  return (
    <ProtectedLayout>
      <h1>Enterprise</h1>
      <p style={{ color: 'var(--muted)' }}>SSO, cross-domain consent, white-label, and data retention.</p>
      {message && <p className="success">{message}</p>}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        {(['white-label', 'sso', 'retention', 'groups', 'roles'] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'btn' : 'btn btn-secondary'}
            onClick={() => setTab(key)}
          >
            {key.replace('-', ' ')}
          </button>
        ))}
      </div>

      {tab === 'white-label' && (
        <form className="card" style={{ marginTop: '1.5rem', maxWidth: 560 }} onSubmit={saveWhiteLabel}>
          <h3>White-label branding</h3>
          <div className="field">
            <label htmlFor="logoUrl">Logo URL</label>
            <input id="logoUrl" name="logoUrl" value={(wl.logoUrl as string) ?? ''} onChange={() => {}} />
          </div>
          <div className="field">
            <label htmlFor="primaryColor">Primary color</label>
            <input id="primaryColor" name="primaryColor" value={(wl.primaryColor as string) ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="dashboardTitle">Dashboard title</label>
            <input id="dashboardTitle" name="dashboardTitle" value={(wl.dashboardTitle as string) ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="cmpBrandName">CMP brand name</label>
            <input id="cmpBrandName" name="cmpBrandName" value={(wl.cmpBrandName as string) ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="customScriptDomain">Custom script domain</label>
            <input id="customScriptDomain" name="customScriptDomain" value={(wl.customScriptDomain as string) ?? ''} />
          </div>
          <label>
            <input type="checkbox" name="hidePlatformBranding" checked={Boolean(wl.hidePlatformBranding)} />
            Hide platform branding
          </label>
          <button className="btn" type="submit" style={{ marginTop: '1rem' }}>Save</button>
        </form>
      )}

      {tab === 'sso' && (
        <form className="card" style={{ marginTop: '1.5rem', maxWidth: 560 }} onSubmit={saveSso}>
          <h3>SSO (Auth0 / OIDC / SAML)</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
            Configure your IdP connection in Auth0, then enter the connection name here. Users sign in via{' '}
            <code>/api/v1/auth/sso/start?org=your-org-slug</code>
          </p>
          <label>
            <input type="checkbox" name="enabled" checked={Boolean(sso.enabled)} />
            Enable SSO
          </label>
          <div className="field">
            <label htmlFor="provider">Provider</label>
            <select id="provider" name="provider" defaultValue={(sso.provider as string) ?? 'oidc'}>
              <option value="oidc">OIDC</option>
              <option value="saml">SAML</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="connectionName">Auth0 connection name</label>
            <input id="connectionName" name="connectionName" value={(sso.connectionName as string) ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="issuerUrl">Issuer URL (optional)</label>
            <input id="issuerUrl" name="issuerUrl" value={(sso.issuerUrl as string) ?? ''} />
          </div>
          <label>
            <input type="checkbox" name="mfaRequired" checked={Boolean(sso.mfaRequired)} />
            Require MFA (via IdP)
          </label>
          <button className="btn" type="submit" style={{ marginTop: '1rem' }}>Save SSO</button>
        </form>
      )}

      {tab === 'retention' && (
        <form className="card" style={{ marginTop: '1.5rem', maxWidth: 560 }} onSubmit={saveRetention}>
          <h3>Data retention</h3>
          <div className="field">
            <label htmlFor="consentRetentionDays">Consent retention (days)</label>
            <input
              id="consentRetentionDays"
              name="consentRetentionDays"
              type="number"
              min={30}
              value={(retention.consentRetentionDays as number) ?? 365}
            />
          </div>
          <label>
            <input type="checkbox" name="consentDeletionEnabled" checked={Boolean(retention.consentDeletionEnabled)} />
            Auto-delete expired consent records
          </label>
          <div className="field" style={{ marginTop: '1rem' }}>
            <label htmlFor="auditRetentionDays">Audit log retention (days)</label>
            <input
              id="auditRetentionDays"
              name="auditRetentionDays"
              type="number"
              min={30}
              value={(retention.auditRetentionDays as number) ?? 730}
            />
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
            Data residency: <strong>{settings?.dataResidencyRegion ?? 'not set'}</strong>
          </p>
          <button className="btn" type="submit" style={{ marginTop: '1rem' }}>Save retention</button>
          <button
            className="btn btn-secondary"
            type="button"
            style={{ marginLeft: '0.5rem' }}
            onClick={() => apiFetch('/enterprise/retention/run', { method: 'POST' }).then((r) => setMessage(r.ok ? 'Retention job ran' : 'Failed'))}
          >
            Run now
          </button>
        </form>
      )}

      {tab === 'groups' && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3>Cross-domain consent groups</h3>
          <form onSubmit={createGroup} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input name="name" placeholder="Group name" required />
            <button className="btn" type="submit">Create group</button>
          </form>
          <ul>
            {groups.map((g) => (
              <li key={g.id} style={{ marginBottom: '0.75rem' }}>
                <strong>{g.name}</strong> · {g.members.length} domain(s)
                <ul style={{ fontSize: '0.875rem' }}>
                  {g.members.map((m) => (
                    <li key={m.domainId}>{m.domain.hostname} ({m.domain.domainKey})</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
            Add domains to groups from the domain detail page or API. Consent syncs across group members via the SDK.
          </p>
        </div>
      )}

      {tab === 'roles' && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3>Custom roles</h3>
          <table>
            <thead>
              <tr><th>Name</th><th>Slug</th><th>Permissions</th></tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td><code>{r.slug}</code></td>
                  <td>
                    {Array.isArray(r.permissions)
                      ? r.permissions.join(', ')
                      : String(r.permissions ?? '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginTop: '1rem' }}>
            Create custom roles via API <code>POST /enterprise/custom-roles</code> and assign with{' '}
            <code>POST /enterprise/custom-roles/assign</code>. Domain-level access via{' '}
            <code>PUT /enterprise/user-domain-access</code>.
          </p>
        </div>
      )}
    </ProtectedLayout>
  );
}
