/**
 * Copy CMP data from PostgreSQL (Neon) into Azure SQL.
 *
 * Usage (from repo root):
 *   pnpm --filter @cmp/database import:postgres
 *
 * Requires CM_POSTGRES_URL and CM_DATABASE_URL in .env
 */
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import pg from 'pg';
import sql from 'mssql';

const TABLES = [
  'permissions',
  'roles',
  'role_permissions',
  'organizations',
  'users',
  'user_roles',
  'refresh_tokens',
  'login_history',
  'email_verification_tokens',
  'password_reset_tokens',
  'domains',
  'cookie_definitions',
  'installation_validations',
  'consent_categories',
  'policy_versions',
  'consent_renewals',
  'consent_submissions',
  'domain_scans',
  'domain_scan_pages',
  'domain_scan_findings',
  'domain_cookies',
  'blocking_violations',
  'notifications',
  'report_schedules',
  'report_runs',
  'api_keys',
  'webhook_endpoints',
  'webhook_deliveries',
  'api_idempotency_keys',
  'domain_groups',
  'domain_group_members',
  'organization_custom_roles',
  'user_custom_roles',
  'user_domain_access',
  'ai_suggestions',
  'regression_test_runs',
  'audit_logs',
] as const;

function parseSqlServerUrl(url: string) {
  const trimmed = url.replace(/^sqlserver:\/\//, '');
  const [hostPort, ...rest] = trimmed.split(';');
  const [server, portRaw] = hostPort.split(':');
  const params = Object.fromEntries(
    rest
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf('=');
        return [part.slice(0, idx).toLowerCase(), part.slice(idx + 1)];
      }),
  );
  const password = (params.password ?? '').replace(/^\{/, '').replace(/\}$/, '');
  return {
    server,
    port: Number(portRaw || 1433),
    database: params.database,
    user: params.user,
    password,
    options: {
      encrypt: params.encrypt !== 'false',
      trustServerCertificate: params.trustservercertificate === 'true',
    },
  };
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) || (typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value))) {
    return JSON.stringify(value);
  }
  return value;
}

function bindInput(request: sql.Request, name: string, value: unknown) {
  const prepared = serializeValue(value);
  if (prepared === null || prepared === undefined) {
    request.input(name, sql.NVarChar, null);
    return;
  }
  if (typeof prepared === 'boolean') {
    request.input(name, sql.Bit, prepared);
    return;
  }
  if (prepared instanceof Date) {
    request.input(name, sql.DateTime2, prepared);
    return;
  }
  if (typeof prepared === 'number') {
    if (Number.isInteger(prepared)) {
      request.input(name, sql.Int, prepared);
    } else {
      request.input(name, sql.Float, prepared);
    }
    return;
  }
  const text = String(prepared);
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(text)) {
    request.input(name, sql.UniqueIdentifier, text);
    return;
  }
  request.input(name, sql.NVarChar(sql.MAX), text);
}

async function main() {
  const pgUrl = process.env.CM_POSTGRES_URL;
  const mssqlUrl = process.env.CM_DATABASE_URL;
  if (!pgUrl) throw new Error('CM_POSTGRES_URL is not set');
  if (!mssqlUrl) throw new Error('CM_DATABASE_URL is not set');

  const pgClient = new pg.Client({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });
  await pgClient.connect();
  console.log('Connected to PostgreSQL');

  const dump: Record<string, unknown[]> = {};
  const pgTables = await pgClient.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const existing = new Set(pgTables.rows.map((r) => r.tablename));

  for (const table of TABLES) {
    if (!existing.has(table)) {
      console.log(`skip missing postgres table ${table}`);
      dump[table] = [];
      continue;
    }
    const result = await pgClient.query(`SELECT * FROM "${table}"`);
    dump[table] = result.rows;
    console.log(`dumped ${table}: ${result.rows.length} rows`);
  }

  const dumpDir = resolve(__dirname, '../../../tmp');
  mkdirSync(dumpDir, { recursive: true });
  const dumpPath = resolve(dumpDir, 'postgres-dump.json');
  writeFileSync(dumpPath, JSON.stringify(dump));
  console.log(`Wrote ${dumpPath}`);

  const pool = await sql.connect({
    ...parseSqlServerUrl(mssqlUrl),
    requestTimeout: 120000,
    connectionTimeout: 30000,
  });
  console.log('Connected to Azure SQL');

  const colResult = await pool.request().query<{ TABLE_NAME: string; COLUMN_NAME: string }>(
    `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo'`,
  );
  const columnsByTable = new Map<string, string[]>();
  for (const row of colResult.recordset) {
    const list = columnsByTable.get(row.TABLE_NAME) ?? [];
    list.push(row.COLUMN_NAME);
    columnsByTable.set(row.TABLE_NAME, list);
  }

  for (const table of TABLES) {
    if (!columnsByTable.has(table)) continue;
    await pool.request().query(`ALTER TABLE [dbo].[${table}] NOCHECK CONSTRAINT ALL`);
  }

  for (const table of [...TABLES].reverse()) {
    if (!columnsByTable.has(table)) continue;
    await pool.request().query(`DELETE FROM [dbo].[${table}]`);
    console.log(`cleared ${table}`);
  }

  for (const table of TABLES) {
    const rows = dump[table] ?? [];
    const columns = columnsByTable.get(table);
    if (!columns || rows.length === 0) continue;

    let imported = 0;
    for (const row of rows) {
      const record = row as Record<string, unknown>;
      const usedCols = columns.filter((col) => Object.prototype.hasOwnProperty.call(record, col));
      if (usedCols.length === 0) continue;
      const request = pool.request();
      usedCols.forEach((col, index) => {
        bindInput(request, `p${index}`, record[col]);
      });
      const colSql = usedCols.map((col) => `[${col}]`).join(', ');
      const valSql = usedCols.map((_, index) => `@p${index}`).join(', ');
      await request.query(`INSERT INTO [dbo].[${table}] (${colSql}) VALUES (${valSql})`);
      imported += 1;
      if (imported % 50 === 0) {
        console.log(`  ${table} ${imported}/${rows.length}`);
      }
    }
    console.log(`imported ${table}: ${rows.length} rows`);
  }

  for (const table of TABLES) {
    if (!columnsByTable.has(table)) continue;
    await pool.request().query(`ALTER TABLE [dbo].[${table}] WITH CHECK CHECK CONSTRAINT ALL`);
  }

  await pgClient.end();
  await pool.close();
  console.log('PostgreSQL → Azure SQL import complete');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
