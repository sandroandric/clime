import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import type {
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
  ApiKeyUsageSummary,
  ChangeFeedEvent,
  CliProfile,
  CommunitySubmission,
  ListingVersion,
  PublisherClaim,
  RankingSnapshot,
  ReportPayload,
  UnmetRequest,
  UsageEvent,
  WorkflowChain,
} from '@cli-me/shared-types';
import { normalizeSha256Checksum } from '@cli-me/shared-types';
import { embedText } from './semantic.js';
import type { RegistryData } from './types.js';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(THIS_DIR, '../../../../infra/migrations');

type Json = Record<string, unknown> | Array<unknown>;

function toIso(value: string | Date | null | undefined) {
  if (!value) {
    return undefined;
  }
  return new Date(value).toISOString();
}

function parseJsonArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as T[];
}

function keyHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function vectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

function cosineSimilarity(a: number[], b: number[]) {
  const size = Math.min(a.length, b.length);
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < size; index += 1) {
    dot += a[index] * b[index];
    aNorm += a[index] ** 2;
    bNorm += b[index] ** 2;
  }
  if (aNorm === 0 || bNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export interface PersistenceAdapter {
  loadOrSeed(seed: RegistryData): Promise<RegistryData>;
  persistSubmission(submission: CommunitySubmission, change: ChangeFeedEvent): Promise<void>;
  persistPublisherClaim(claim: PublisherClaim, change: ChangeFeedEvent): Promise<PublisherClaim>;
  updatePublisherClaim(claim: PublisherClaim): Promise<void>;
  persistUsage(event: UsageEvent): Promise<void>;
  persistReport(report: ReportPayload): Promise<boolean>;
  semanticDiscover(
    query: string,
    limit: number,
  ): Promise<Array<{ cli_slug: string; similarity: number; top_commands: string[] }>>;
  createApiKey(payload: ApiKeyCreateRequest): Promise<ApiKeyCreateResponse>;
  apiKeyOwner(apiKey: string): Promise<{ owner_type: string; owner_id?: string } | null>;
  apiKeyUsageSummary(apiKey: string): Promise<ApiKeyUsageSummary>;
  persistCliTelemetry(
    cli: CliProfile,
    listingVersion: ListingVersion,
    change: ChangeFeedEvent,
  ): Promise<void>;
  updateCliProfile(cli: CliProfile): Promise<void>;
  updateInstallChecksum(
    slug: string,
    os: string,
    packageManager: string,
    command: string,
    checksum: string,
  ): Promise<void>;
  persistRanking(snapshot: RankingSnapshot, change: ChangeFeedEvent): Promise<void>;
  persistUnmetRequest(unmet: UnmetRequest): Promise<string>;
  close(): Promise<void>;
}

export class PostgresPersistence implements PersistenceAdapter {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;
  private readonly embeddingCache = new Map<string, number[]>();
  private readonly embeddingProvider = (() => {
    const configured = process.env.CLIME_EMBEDDING_PROVIDER?.trim().toLowerCase();
    if (configured) {
      return configured;
    }
    return process.env.OPENAI_API_KEY ? 'openai' : 'local';
  })();
  private readonly openaiEmbeddingModel =
    process.env.CLIME_OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
  private readonly embeddingTimeoutMs = Math.max(
    1500,
    Number(process.env.CLIME_EMBEDDING_TIMEOUT_MS ?? 6000),
  );
  private readonly pgVectorDimension = (() => {
    const value = Number(process.env.CLIME_PGVECTOR_DIMENSION ?? 384);
    if (!Number.isFinite(value) || value < 128 || value > 4096) {
      return 384;
    }
    return Math.floor(value);
  })();
  private vectorEnabled = false;

  private static readonly EMBEDDING_CACHE_MAX = 500;

  constructor(connectionStringOrPool: string | Pool) {
    if (typeof connectionStringOrPool === 'string') {
      this.pool = new Pool({
        connectionString: connectionStringOrPool,
        connectionTimeoutMillis: 5000,
        statement_timeout: 30000,
      });
      this.ownsPool = true;
      return;
    }

    this.pool = connectionStringOrPool;
    this.ownsPool = false;
  }

  async close() {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  async migrate() {
    await this.applyMigrations();
    await this.ensurePgVectorArtifacts();
  }

  async seed(seed: RegistryData) {
    await this.applyMigrations();
    await this.ensurePgVectorArtifacts();

    const countResult = await this.pool.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM clis',
    );
    const count = Number(countResult.rows[0]?.total ?? '0');

    if (count === 0) {
      await this.seedInitialData(seed);
      return { seeded: true, existingCliCount: count };
    }

    return { seeded: false, existingCliCount: count };
  }

  async syncSeed(seed: RegistryData) {
    await this.applyMigrations();
    await this.ensurePgVectorArtifacts();
    await this.seedInitialData(seed);
    const prune = String(process.env.CLIME_SYNC_PRUNE ?? 'false').toLowerCase() === 'true';
    if (prune) {
      await this.pruneToSeed(seed);
    }

    const [cliCountResult, workflowCountResult] = await Promise.all([
      this.pool.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM clis'),
      this.pool.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM workflows'),
    ]);

    return {
      synced: true,
      cliCount: Number(cliCountResult.rows[0]?.total ?? String(seed.clis.length)),
      workflowCount: Number(workflowCountResult.rows[0]?.total ?? String(seed.workflows.length)),
      changeCount: seed.changes.length,
      pruned: prune,
    };
  }

  async loadOrSeed(seed: RegistryData): Promise<RegistryData> {
    await this.seed(seed);

    return this.loadState();
  }

  async persistSubmission(submission: CommunitySubmission, change: ChangeFeedEvent) {
    await this.transaction(async (client) => {
      await client.query(
        `
        INSERT INTO community_submissions
          (id, type, submitter, target_cli_slug, content, status, created_at, reviewed_at, reviewer, review_notes)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO UPDATE
        SET
          type = EXCLUDED.type,
          submitter = EXCLUDED.submitter,
          target_cli_slug = EXCLUDED.target_cli_slug,
          content = EXCLUDED.content,
          status = EXCLUDED.status,
          created_at = EXCLUDED.created_at,
          reviewed_at = EXCLUDED.reviewed_at,
          reviewer = EXCLUDED.reviewer,
          review_notes = EXCLUDED.review_notes
      `,
        [
          submission.id,
          submission.type,
          submission.submitter,
          submission.target_cli_slug ?? null,
          JSON.stringify(submission.content),
          submission.status,
          submission.created_at,
          submission.reviewed_at ?? null,
          submission.reviewer ?? null,
          submission.review_notes ?? null,
        ],
      );

      await this.insertChangeEvent(client, change);
    });
  }

  async persistPublisherClaim(
    claim: PublisherClaim,
    change: ChangeFeedEvent,
  ): Promise<PublisherClaim> {
    return this.transaction(async (client) => {
      const publisherResult = await client.query<{ id: number; name: string; domain: string }>(
        `
        INSERT INTO publishers (name, domain, verified)
        VALUES ($1, $2, FALSE)
        ON CONFLICT (domain) DO UPDATE
        SET name = EXCLUDED.name
        RETURNING id, name, domain
      `,
        [claim.publisher_name, claim.domain],
      );

      const publisher = publisherResult.rows[0];

      const claimResult = await client.query<{ id: number; created_at: string }>(
        `
        INSERT INTO listing_claims
          (cli_slug, publisher_id, status, evidence, created_at, verification_method,
           verification_token, verification_instructions, repository_url, verified_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, created_at
      `,
        [
          claim.cli_slug,
          publisher.id,
          claim.status,
          claim.evidence,
          claim.created_at,
          claim.verification_method ?? 'dns_txt',
          claim.verification_token ?? null,
          claim.verification_instructions ?? null,
          claim.repository_url ?? null,
          claim.verified_at ?? null,
        ],
      );

      const persistedClaim = claimResult.rows[0];

      const normalized: PublisherClaim = {
        id: `claim_${persistedClaim.id}`,
        cli_slug: claim.cli_slug,
        publisher_name: publisher.name,
        domain: publisher.domain,
        status: claim.status,
        evidence: claim.evidence,
        verification_method: claim.verification_method ?? 'dns_txt',
        verification_token: claim.verification_token,
        verification_instructions: claim.verification_instructions,
        repository_url: claim.repository_url,
        verified_at: claim.verified_at,
        created_at: toIso(persistedClaim.created_at) ?? claim.created_at,
      };

      await this.insertChangeEvent(client, {
        ...change,
        entity_id: normalized.id,
        occurred_at: normalized.created_at,
        payload: {
          ...change.payload,
          db_id: persistedClaim.id,
        },
      });

      return normalized;
    });
  }

  async updatePublisherClaim(claim: PublisherClaim) {
    const dbId = Number(claim.id.replace(/^claim_/, ''));
    if (!Number.isFinite(dbId)) {
      return;
    }

    await this.transaction(async (client) => {
      await client.query(
        `
        UPDATE listing_claims
        SET
          status = $2,
          evidence = $3,
          verification_method = $4,
          verification_token = $5,
          verification_instructions = $6,
          repository_url = $7,
          verified_at = $8,
          reviewed_at = NOW()
        WHERE id = $1
      `,
        [
          dbId,
          claim.status,
          claim.evidence,
          claim.verification_method ?? 'dns_txt',
          claim.verification_token ?? null,
          claim.verification_instructions ?? null,
          claim.repository_url ?? null,
          claim.verified_at ?? null,
        ],
      );

      await client.query(
        `
        UPDATE publishers AS p
        SET verified = EXISTS (
          SELECT 1
          FROM listing_claims AS lc
          WHERE lc.publisher_id = p.id
            AND lc.status = 'approved'
        )
        WHERE p.id = (SELECT publisher_id FROM listing_claims WHERE id = $1)
      `,
        [dbId],
      );
    });
  }

  async persistUsage(event: UsageEvent) {
    await this.transaction(async (client) => {
      const hashed = keyHash(event.api_key);
      const apiKeyResult = await client.query<{ id: number }>(
        `
        INSERT INTO api_keys (key_hash, owner_type, status)
        VALUES ($1, 'consumer', 'active')
        ON CONFLICT (key_hash) DO UPDATE
        SET last_used_at = NOW()
        RETURNING id
      `,
        [hashed],
      );

      const apiKeyId = apiKeyResult.rows[0].id;
      await client.query(
        `
        INSERT INTO usage_events
          (api_key_id, endpoint, method, status_code, latency_ms, request_id, created_at, cli_slug, query, metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
      `,
        [
          apiKeyId,
          event.endpoint,
          event.method,
          event.status_code,
          event.latency_ms,
          event.id,
          event.created_at,
          event.cli_slug ?? null,
          event.query ?? null,
          JSON.stringify(event.metadata ?? {}),
        ],
      );
    });
  }

  async semanticDiscover(
    query: string,
    limit: number,
  ): Promise<Array<{ cli_slug: string; similarity: number; top_commands: string[] }>> {
    const vector = await this.buildEmbedding(query);

    if (this.vectorEnabled && vector.length === this.pgVectorDimension) {
      const result = await this.pool.query<{
        cli_slug: string;
        similarity: number;
        top_commands: unknown;
      }>(
        `
        SELECT v.cli_slug, 1 - (v.embedding <=> $1::vector) AS similarity, e.top_commands
        FROM cli_embeddings_vector v
        INNER JOIN cli_embeddings e ON e.cli_slug = v.cli_slug
        ORDER BY v.embedding <=> $1::vector
        LIMIT $2
      `,
        [vectorLiteral(vector), limit],
      );

      return result.rows.map((row) => ({
        cli_slug: row.cli_slug,
        similarity: Number(row.similarity),
        top_commands: parseJsonArray<string>(row.top_commands),
      }));
    }

    const fallback = await this.pool.query<{
      cli_slug: string;
      embedding: unknown;
      top_commands: unknown;
    }>(
      `
      SELECT cli_slug, embedding, top_commands
      FROM cli_embeddings
    `,
    );

    return fallback.rows
      .map((row) => ({
        cli_slug: row.cli_slug,
        similarity: cosineSimilarity(vector, parseJsonArray<number>(row.embedding)),
        top_commands: parseJsonArray<string>(row.top_commands),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async createApiKey(payload: ApiKeyCreateRequest): Promise<ApiKeyCreateResponse> {
    const token = `clime_${randomBytes(20).toString('hex')}`;
    const createdAt = new Date().toISOString();
    const hashed = keyHash(token);

    const result = await this.pool.query<{
      id: number;
      owner_type: string;
      owner_id: string | null;
      created_at: string;
    }>(
      `
      INSERT INTO api_keys (key_hash, owner_type, owner_id, status, created_at, label)
      VALUES ($1,$2,$3,'active',$4,$5)
      RETURNING id, owner_type, owner_id, created_at
    `,
      [hashed, payload.owner_type, payload.owner_id ?? null, createdAt, payload.label ?? null],
    );

    const row = result.rows[0];
    return {
      api_key: token,
      key_id: `key_${row.id}`,
      owner_type: row.owner_type,
      owner_id: row.owner_id ?? undefined,
      created_at: toIso(row.created_at) ?? createdAt,
    };
  }
  async apiKeyOwner(apiKey: string): Promise<{ owner_type: string; owner_id?: string } | null> {
    const hashed = keyHash(apiKey);
    const result = await this.pool.query<{ owner_type: string; owner_id: string | null }>(
      `
    SELECT owner_type, owner_id
    FROM api_keys
    WHERE key_hash = $1 AND status = 'active'
    LIMIT 1
  `,
      [hashed],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      owner_type: row.owner_type,
      owner_id: row.owner_id ?? undefined,
    };
  }

  async apiKeyUsageSummary(apiKey: string): Promise<ApiKeyUsageSummary> {
    const hashed = keyHash(apiKey);

    const usage = await this.pool.query<{
      endpoint: string;
      cli_slug: string | null;
      query: string | null;
      created_at: string;
    }>(
      `
      SELECT ue.endpoint, ue.cli_slug, ue.query, ue.created_at
      FROM usage_events ue
      INNER JOIN api_keys ak ON ak.id = ue.api_key_id
      WHERE ak.key_hash = $1
      ORDER BY ue.created_at DESC
      LIMIT 5000
    `,
      [hashed],
    );

    const endpointCounts = new Map<string, number>();
    const cliCounts = new Map<string, number>();
    const queryCounts = new Map<string, number>();
    let lastSeen: string | undefined;

    for (const row of usage.rows) {
      endpointCounts.set(row.endpoint, (endpointCounts.get(row.endpoint) ?? 0) + 1);
      if (row.cli_slug) {
        cliCounts.set(row.cli_slug, (cliCounts.get(row.cli_slug) ?? 0) + 1);
      }
      if (row.query) {
        const normalized = row.query.trim().toLowerCase();
        queryCounts.set(normalized, (queryCounts.get(normalized) ?? 0) + 1);
      }
      if (!lastSeen || Date.parse(row.created_at) > Date.parse(lastSeen)) {
        lastSeen = toIso(row.created_at);
      }
    }

    return {
      api_key_hash: hashed,
      total_requests: usage.rows.length,
      endpoints: [...endpointCounts.entries()]
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      top_clis: [...cliCounts.entries()]
        .map(([cli_slug, count]) => ({ cli_slug, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      top_queries: [...queryCounts.entries()]
        .map(([query, count]) => ({ query, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      last_seen: lastSeen,
    };
  }

  async persistReport(report: ReportPayload): Promise<boolean> {
    const result = await this.pool.query<{ request_id: string }>(
      `
      INSERT INTO reports
        (request_id, cli_slug, status, cli_version, workflow_id, command_id, duration_ms, exit_code,
         agent_name, agent_version, os, arch, error_code, stderr_hash, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (request_id) DO NOTHING
      RETURNING request_id
    `,
      [
        report.request_id,
        report.cli_slug,
        report.status,
        report.cli_version,
        report.workflow_id ?? null,
        report.command_id ?? null,
        report.duration_ms,
        report.exit_code,
        report.agent_name,
        report.agent_version,
        report.os,
        report.arch,
        report.error_code ?? null,
        report.stderr_hash ?? null,
        report.timestamp,
      ],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async persistCliTelemetry(
    cli: CliProfile,
    listingVersion: ListingVersion,
    change: ChangeFeedEvent,
  ) {
    await this.transaction(async (client) => {
      await client.query(
        `
        UPDATE clis
        SET
          popularity_score = $2,
          trust_score = $3,
          last_updated = $4,
          last_verified = $5,
          latest_version = $6
        WHERE slug = $1
      `,
        [
          cli.identity.slug,
          cli.identity.popularity_score,
          cli.identity.trust_score,
          listingVersion.updated_at,
          listingVersion.updated_at,
          cli.identity.latest_version,
        ],
      );

      await client.query(`DELETE FROM compatibility_matrix WHERE cli_slug = $1`, [
        cli.identity.slug,
      ]);
      for (const compatibility of cli.identity.compatibility) {
        await client.query(
          `
          INSERT INTO compatibility_matrix (cli_slug, agent_name, success_rate, status, last_verified)
          VALUES ($1,$2,$3,$4,$5)
        `,
          [
            cli.identity.slug,
            compatibility.agent_name,
            compatibility.success_rate,
            compatibility.status,
            compatibility.last_verified,
          ],
        );
      }

      await client.query(
        `
        INSERT INTO listing_versions (id, cli_slug, version_number, changed_fields, changelog, updated_at)
        VALUES ($1,$2,$3,$4::jsonb,$5,$6)
        ON CONFLICT (id) DO UPDATE
        SET
          cli_slug = EXCLUDED.cli_slug,
          version_number = EXCLUDED.version_number,
          changed_fields = EXCLUDED.changed_fields,
          changelog = EXCLUDED.changelog,
          updated_at = EXCLUDED.updated_at
      `,
        [
          listingVersion.id,
          listingVersion.cli_slug,
          listingVersion.version_number,
          JSON.stringify(listingVersion.changed_fields),
          listingVersion.changelog,
          listingVersion.updated_at,
        ],
      );

      await this.insertChangeEvent(client, change);
    });
  }

  async updateCliProfile(cli: CliProfile) {
    await this.transaction(async (client) => {
      await this.upsertCliProfile(client, cli, true);
    });
  }

  async updateInstallChecksum(
    slug: string,
    os: string,
    packageManager: string,
    command: string,
    checksum: string,
  ) {
    const normalized = normalizeSha256Checksum(checksum);
    if (!normalized) {
      return;
    }
    await this.pool.query(
      `
      UPDATE install_methods
      SET checksum = $1
      WHERE cli_slug = $2 AND os = $3 AND package_manager = $4 AND command = $5
    `,
      [normalized, slug, os, packageManager, command],
    );
  }

  async persistRanking(snapshot: RankingSnapshot, change: ChangeFeedEvent) {
    await this.transaction(async (client) => {
      await client.query(
        `
        INSERT INTO ranking_snapshots (type, generated_at, entries)
        VALUES ($1,$2,$3::jsonb)
      `,
        [snapshot.type, snapshot.generated_at, JSON.stringify(snapshot.entries)],
      );

      await this.insertChangeEvent(client, change);
    });
  }

  async persistUnmetRequest(unmet: UnmetRequest): Promise<string> {
    const update = await this.pool.query<{ id: string }>(
      `
      UPDATE unmet_requests
      SET count = $1, last_seen = $2
      WHERE lower(query) = lower($3)
      RETURNING id
    `,
      [unmet.count, unmet.last_seen, unmet.query],
    );

    if ((update.rowCount ?? 0) > 0) {
      return update.rows[0].id;
    }

    await this.pool.query(
      `
      INSERT INTO unmet_requests (id, query, count, last_seen)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (id) DO UPDATE
      SET query = EXCLUDED.query, count = EXCLUDED.count, last_seen = EXCLUDED.last_seen
    `,
      [unmet.id, unmet.query, unmet.count, unmet.last_seen],
    );

    return unmet.id;
  }

  private async applyMigrations() {
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const fileName of migrationFiles) {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, fileName), 'utf-8');
      await this.pool.query(sql);
    }
  }

  private async seedInitialData(seed: RegistryData) {
    await this.transaction(async (client) => {
      for (const cli of seed.clis) {
        await this.upsertCliProfile(client, cli, true);
      }

      for (const workflow of seed.workflows) {
        await client.query(
          `
          INSERT INTO workflows (id, slug, title, description, tags, estimated_minutes, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
          ON CONFLICT (id) DO UPDATE
          SET
            slug = EXCLUDED.slug,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            tags = EXCLUDED.tags,
            estimated_minutes = EXCLUDED.estimated_minutes,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
          [
            workflow.id,
            workflow.slug,
            workflow.title,
            workflow.description,
            JSON.stringify(workflow.tags),
            workflow.estimated_minutes,
            workflow.created_at,
            workflow.updated_at,
          ],
        );

        await client.query(`DELETE FROM workflow_steps WHERE workflow_id = $1`, [workflow.id]);
        for (const step of workflow.steps) {
          await client.query(
            `
            INSERT INTO workflow_steps
              (workflow_id, step_number, cli_slug, purpose, command_ids, auth_prerequisite)
            VALUES ($1,$2,$3,$4,$5::jsonb,$6)
          `,
            [
              workflow.id,
              step.step_number,
              step.cli_slug,
              step.purpose,
              JSON.stringify(step.command_ids),
              step.auth_prerequisite,
            ],
          );
        }
      }

      for (const change of seed.changes) {
        await this.insertChangeEvent(client, change);
      }
    });
  }

  private async pruneToSeed(seed: RegistryData) {
    if (seed.clis.length === 0 || seed.workflows.length === 0) {
      throw new Error('Refusing to prune with empty seed payload.');
    }

    const seededCliSlugs = seed.clis.map((cli) => cli.identity.slug);
    const seededWorkflowIds = seed.workflows.map((workflow) => workflow.id);

    await this.transaction(async (client) => {
      await client.query(`DELETE FROM workflows WHERE NOT (id = ANY($1::text[]))`, [
        seededWorkflowIds,
      ]);
      await client.query(`DELETE FROM clis WHERE NOT (slug = ANY($1::text[]))`, [seededCliSlugs]);
    });
  }

  private async upsertCliProfile(client: PoolClient, cli: CliProfile, replaceChildren: boolean) {
    await client.query(
      `
      INSERT INTO clis
        (slug, name, publisher, description, website, repository, verification_status, latest_version,
         popularity_score, trust_score, last_updated, last_verified, permission_scope)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
      ON CONFLICT (slug) DO UPDATE
      SET
        name = EXCLUDED.name,
        publisher = EXCLUDED.publisher,
        description = EXCLUDED.description,
        website = EXCLUDED.website,
        repository = EXCLUDED.repository,
        verification_status = EXCLUDED.verification_status,
        latest_version = EXCLUDED.latest_version,
        popularity_score = EXCLUDED.popularity_score,
        trust_score = EXCLUDED.trust_score,
        last_updated = EXCLUDED.last_updated,
        last_verified = EXCLUDED.last_verified,
        permission_scope = EXCLUDED.permission_scope
    `,
      [
        cli.identity.slug,
        cli.identity.name,
        cli.identity.publisher,
        cli.identity.description,
        cli.identity.website,
        cli.identity.repository,
        cli.identity.verification_status,
        cli.identity.latest_version,
        cli.identity.popularity_score,
        cli.identity.trust_score,
        cli.identity.last_updated,
        cli.identity.last_verified ?? null,
        JSON.stringify(cli.identity.permission_scope ?? []),
      ],
    );

    if (!replaceChildren) {
      return;
    }

    await client.query(`DELETE FROM cli_tags WHERE cli_slug = $1`, [cli.identity.slug]);
    for (const tag of cli.identity.category_tags) {
      await client.query(`INSERT INTO cli_tags (cli_slug, tag) VALUES ($1,$2)`, [
        cli.identity.slug,
        tag,
      ]);
    }

    await client.query(`DELETE FROM install_methods WHERE cli_slug = $1`, [cli.identity.slug]);
    for (const install of cli.install) {
      const checksum = normalizeSha256Checksum(install.checksum);
      await client.query(
        `
        INSERT INTO install_methods (cli_slug, os, package_manager, command, checksum, signature)
        VALUES ($1,$2,$3,$4,$5,$6)
      `,
        [
          cli.identity.slug,
          install.os,
          install.package_manager,
          install.command,
          checksum ?? null,
          install.signature ?? null,
        ],
      );
    }

    await client.query(`DELETE FROM auth_flows WHERE cli_slug = $1`, [cli.identity.slug]);
    await client.query(
      `
      INSERT INTO auth_flows
        (cli_slug, auth_type, token_refresh, scopes, environment_variables, setup_steps)
      VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)
    `,
      [
        cli.identity.slug,
        cli.auth.auth_type,
        cli.auth.token_refresh,
        JSON.stringify(cli.auth.scopes),
        JSON.stringify(cli.auth.environment_variables),
        JSON.stringify(cli.auth.setup_steps),
      ],
    );

    await client.query(`DELETE FROM command_entries WHERE cli_slug = $1`, [cli.identity.slug]);
    for (const command of cli.commands) {
      await client.query(
        `
        INSERT INTO command_entries
          (id, cli_slug, command, description, required_parameters, optional_parameters,
           examples, expected_output, common_errors, workflow_context)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10::jsonb)
      `,
        [
          command.id,
          command.cli_slug,
          command.command,
          command.description,
          JSON.stringify(command.required_parameters),
          JSON.stringify(command.optional_parameters),
          JSON.stringify(command.examples),
          command.expected_output,
          JSON.stringify(command.common_errors),
          JSON.stringify(command.workflow_context),
        ],
      );
    }

    await client.query(`DELETE FROM compatibility_matrix WHERE cli_slug = $1`, [cli.identity.slug]);
    for (const compatibility of cli.identity.compatibility) {
      await client.query(
        `
        INSERT INTO compatibility_matrix (cli_slug, agent_name, success_rate, status, last_verified)
        VALUES ($1,$2,$3,$4,$5)
      `,
        [
          cli.identity.slug,
          compatibility.agent_name,
          compatibility.success_rate,
          compatibility.status,
          compatibility.last_verified,
        ],
      );
    }

    if (process.env.CLIME_SYNC_SKIP_EMBEDDINGS !== 'true') {
      await this.upsertCliEmbedding(client, cli);
    }

    if (cli.listing_version) {
      await client.query(
        `
        INSERT INTO listing_versions (id, cli_slug, version_number, changed_fields, changelog, updated_at)
        VALUES ($1,$2,$3,$4::jsonb,$5,$6)
        ON CONFLICT (id) DO UPDATE
        SET
          cli_slug = EXCLUDED.cli_slug,
          version_number = EXCLUDED.version_number,
          changed_fields = EXCLUDED.changed_fields,
          changelog = EXCLUDED.changelog,
          updated_at = EXCLUDED.updated_at
      `,
        [
          cli.listing_version.id,
          cli.listing_version.cli_slug,
          cli.listing_version.version_number,
          JSON.stringify(cli.listing_version.changed_fields),
          cli.listing_version.changelog,
          cli.listing_version.updated_at,
        ],
      );
    }
  }

  private async loadState(): Promise<RegistryData> {
    const [
      clisRes,
      tagsRes,
      installRes,
      authRes,
      commandsRes,
      compatibilityRes,
      listingVersionRes,
      workflowsRes,
      workflowStepsRes,
      submissionsRes,
      claimsRes,
      reportsRes,
      usageRes,
      unmetRes,
      changesRes,
      rankingsRes,
    ] = await Promise.all([
      this.pool.query(`SELECT * FROM clis`),
      this.pool.query(`SELECT cli_slug, tag FROM cli_tags`),
      this.pool.query(
        `SELECT cli_slug, os, package_manager, command, checksum, signature FROM install_methods`,
      ),
      this.pool.query(
        `SELECT cli_slug, auth_type, token_refresh, scopes, environment_variables, setup_steps FROM auth_flows`,
      ),
      this.pool.query(`SELECT * FROM command_entries`),
      this.pool.query(
        `SELECT cli_slug, agent_name, status, success_rate, last_verified FROM compatibility_matrix`,
      ),
      this.pool.query(
        `SELECT DISTINCT ON (cli_slug) * FROM listing_versions ORDER BY cli_slug, version_number DESC`,
      ),
      this.pool.query(`SELECT * FROM workflows ORDER BY updated_at DESC`),
      this.pool.query(`SELECT * FROM workflow_steps ORDER BY workflow_id, step_number`),
      this.pool.query(`SELECT * FROM community_submissions ORDER BY created_at DESC`),
      this.pool.query(
        `
        SELECT lc.id, lc.cli_slug, lc.status, lc.created_at, lc.evidence,
               lc.verification_method, lc.verification_token, lc.verification_instructions,
               lc.repository_url, lc.verified_at,
               p.name AS publisher_name, p.domain
        FROM listing_claims lc
        INNER JOIN publishers p ON p.id = lc.publisher_id
        ORDER BY lc.created_at DESC
      `,
      ),
      this.pool.query(`SELECT * FROM reports ORDER BY created_at DESC`),
      this.pool.query(
        `
        SELECT ue.id, COALESCE(ak.key_hash, 'unknown') AS api_key, ue.endpoint, ue.method,
               ue.status_code, ue.latency_ms, ue.created_at, ue.cli_slug, ue.query, ue.metadata
        FROM usage_events ue
        LEFT JOIN api_keys ak ON ak.id = ue.api_key_id
        ORDER BY ue.created_at DESC
        LIMIT 5000
      `,
      ),
      this.pool.query(`SELECT * FROM unmet_requests ORDER BY count DESC`),
      this.pool.query(`SELECT * FROM change_feed_events ORDER BY occurred_at DESC LIMIT 1000`),
      this.pool.query(
        `SELECT DISTINCT ON (type) type, generated_at, entries FROM ranking_snapshots ORDER BY type, generated_at DESC`,
      ),
    ]);

    const tagsByCli = new Map<string, string[]>();
    for (const row of tagsRes.rows) {
      const list = tagsByCli.get(row.cli_slug) ?? [];
      list.push(row.tag);
      tagsByCli.set(row.cli_slug, list);
    }

    const installsByCli = new Map<string, Array<Record<string, unknown>>>();
    for (const row of installRes.rows) {
      const list = installsByCli.get(row.cli_slug) ?? [];
      list.push({
        os: row.os,
        package_manager: row.package_manager,
        command: row.command,
        checksum: row.checksum ?? undefined,
        signature: row.signature ?? undefined,
        dependencies: [],
      });
      installsByCli.set(row.cli_slug, list);
    }

    const authByCli = new Map<string, Record<string, unknown>>();
    for (const row of authRes.rows) {
      authByCli.set(row.cli_slug, {
        auth_type: row.auth_type,
        setup_steps: parseJsonArray(row.setup_steps),
        environment_variables: parseJsonArray(row.environment_variables),
        token_refresh: row.token_refresh,
        scopes: parseJsonArray(row.scopes),
      });
    }

    const commandsByCli = new Map<string, Array<Record<string, unknown>>>();
    for (const row of commandsRes.rows) {
      const list = commandsByCli.get(row.cli_slug) ?? [];
      list.push({
        id: row.id,
        cli_slug: row.cli_slug,
        command: row.command,
        description: row.description,
        required_parameters: parseJsonArray(row.required_parameters),
        optional_parameters: parseJsonArray(row.optional_parameters),
        examples: parseJsonArray<string>(row.examples),
        expected_output: row.expected_output,
        common_errors: parseJsonArray<string>(row.common_errors),
        workflow_context: parseJsonArray<string>(row.workflow_context),
      });
      commandsByCli.set(row.cli_slug, list);
    }

    const compatibilityByCli = new Map<string, Array<Record<string, unknown>>>();
    for (const row of compatibilityRes.rows) {
      const list = compatibilityByCli.get(row.cli_slug) ?? [];
      list.push({
        agent_name: row.agent_name,
        status: row.status,
        success_rate: Number(row.success_rate),
        last_verified: toIso(row.last_verified),
      });
      compatibilityByCli.set(row.cli_slug, list);
    }

    const listingVersionByCli = new Map<string, Record<string, unknown>>();
    for (const row of listingVersionRes.rows) {
      listingVersionByCli.set(row.cli_slug, {
        id: row.id,
        cli_slug: row.cli_slug,
        version_number: Number(row.version_number),
        changed_fields: parseJsonArray<string>(row.changed_fields),
        changelog: row.changelog,
        updated_at: toIso(row.updated_at),
      });
    }

    const clis: CliProfile[] = clisRes.rows.map((row) => ({
      identity: {
        slug: row.slug,
        name: row.name,
        publisher: row.publisher,
        description: row.description,
        category_tags: tagsByCli.get(row.slug) ?? [],
        website: row.website,
        repository: row.repository,
        verification_status: row.verification_status,
        latest_version: row.latest_version,
        last_updated: toIso(row.last_updated) ?? new Date().toISOString(),
        last_verified: toIso(row.last_verified),
        popularity_score: Number(row.popularity_score),
        trust_score: Number(row.trust_score),
        permission_scope: parseJsonArray<string>(row.permission_scope),
        compatibility: (compatibilityByCli.get(row.slug) ??
          []) as CliProfile['identity']['compatibility'],
      },
      install: (installsByCli.get(row.slug) ?? []) as CliProfile['install'],
      auth: (authByCli.get(row.slug) ?? {
        auth_type: 'none',
        setup_steps: [],
        environment_variables: [],
        token_refresh: 'No token',
        scopes: [],
      }) as CliProfile['auth'],
      commands: (commandsByCli.get(row.slug) ?? []) as CliProfile['commands'],
      listing_version: listingVersionByCli.get(row.slug) as CliProfile['listing_version'],
    }));

    const stepsByWorkflow = new Map<string, Array<Record<string, unknown>>>();
    for (const row of workflowStepsRes.rows) {
      const list = stepsByWorkflow.get(row.workflow_id) ?? [];
      list.push({
        step_number: Number(row.step_number),
        cli_slug: row.cli_slug,
        purpose: row.purpose,
        command_ids: parseJsonArray<string>(row.command_ids),
        auth_prerequisite: Boolean(row.auth_prerequisite),
      });
      stepsByWorkflow.set(row.workflow_id, list);
    }

    const workflows: WorkflowChain[] = workflowsRes.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      tags: parseJsonArray<string>(row.tags),
      estimated_minutes: Number(row.estimated_minutes),
      created_at: toIso(row.created_at) ?? new Date().toISOString(),
      updated_at: toIso(row.updated_at) ?? new Date().toISOString(),
      steps: (stepsByWorkflow.get(row.id) ?? []) as WorkflowChain['steps'],
    }));

    const submissions: CommunitySubmission[] = submissionsRes.rows.map((row) => ({
      id: row.id,
      type: row.type,
      submitter: row.submitter,
      target_cli_slug: row.target_cli_slug ?? undefined,
      content: (row.content ?? {}) as Json,
      status: row.status,
      created_at: toIso(row.created_at) ?? new Date().toISOString(),
      reviewed_at: toIso(row.reviewed_at),
      reviewer: row.reviewer ?? undefined,
      review_notes: row.review_notes ?? undefined,
    }));

    const publisherClaims: PublisherClaim[] = claimsRes.rows.map((row) => ({
      id: `claim_${row.id}`,
      cli_slug: row.cli_slug,
      publisher_name: row.publisher_name,
      domain: row.domain,
      status: row.status,
      evidence: row.evidence ?? '',
      verification_method: row.verification_method ?? 'dns_txt',
      verification_token: row.verification_token ?? undefined,
      verification_instructions: row.verification_instructions ?? undefined,
      repository_url: row.repository_url ?? undefined,
      verified_at: toIso(row.verified_at),
      created_at: toIso(row.created_at) ?? new Date().toISOString(),
    }));

    const reports: ReportPayload[] = reportsRes.rows.map((row) => ({
      status: row.status,
      cli_slug: row.cli_slug,
      cli_version: row.cli_version,
      workflow_id: row.workflow_id ?? undefined,
      command_id: row.command_id ?? undefined,
      duration_ms: Number(row.duration_ms),
      exit_code: Number(row.exit_code),
      agent_name: row.agent_name,
      agent_version: row.agent_version,
      os: row.os,
      arch: row.arch,
      error_code: row.error_code ?? undefined,
      stderr_hash: row.stderr_hash ?? undefined,
      request_id: row.request_id,
      timestamp: toIso(row.created_at) ?? new Date().toISOString(),
    }));

    const usageEvents: UsageEvent[] = usageRes.rows.map((row) => ({
      id: `use_${row.id}`,
      api_key: row.api_key,
      endpoint: row.endpoint,
      method: row.method,
      status_code: Number(row.status_code),
      latency_ms: Number(row.latency_ms),
      cli_slug: row.cli_slug ?? undefined,
      query: row.query ?? undefined,
      metadata: (row.metadata ?? {}) as UsageEvent['metadata'],
      created_at: toIso(row.created_at) ?? new Date().toISOString(),
    }));

    const unmetRequests: UnmetRequest[] = unmetRes.rows.map((row) => ({
      id: row.id,
      query: row.query,
      count: Number(row.count),
      last_seen: toIso(row.last_seen) ?? new Date().toISOString(),
    }));

    const listingVersions: ListingVersion[] = listingVersionRes.rows.map((row) => ({
      id: row.id,
      cli_slug: row.cli_slug,
      version_number: Number(row.version_number),
      changed_fields: parseJsonArray<string>(row.changed_fields),
      changelog: row.changelog,
      updated_at: toIso(row.updated_at) ?? new Date().toISOString(),
    }));

    const changes: ChangeFeedEvent[] = changesRes.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      entity_id: row.entity_id,
      occurred_at: toIso(row.occurred_at) ?? new Date().toISOString(),
      payload: (row.payload ?? {}) as Record<string, unknown>,
    }));

    const rankings: RankingSnapshot[] = rankingsRes.rows.map((row) => ({
      type: row.type,
      generated_at: toIso(row.generated_at) ?? new Date().toISOString(),
      entries: parseJsonArray(row.entries) as RankingSnapshot['entries'],
    }));

    return {
      clis,
      workflows,
      submissions,
      publisherClaims,
      reports,
      usageEvents,
      unmetRequests,
      listingVersions,
      changes,
      rankings,
    };
  }

  private async insertChangeEvent(client: PoolClient, change: ChangeFeedEvent) {
    await client.query(
      `
      INSERT INTO change_feed_events (id, kind, entity_id, occurred_at, payload)
      VALUES ($1,$2,$3,$4,$5::jsonb)
      ON CONFLICT (id) DO NOTHING
    `,
      [
        change.id,
        change.kind,
        change.entity_id,
        change.occurred_at,
        JSON.stringify(change.payload),
      ],
    );
  }

  private async ensurePgVectorArtifacts() {
    try {
      await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector');
      await this.pool.query(
        `
        CREATE TABLE IF NOT EXISTS cli_embeddings_vector (
          cli_slug TEXT PRIMARY KEY REFERENCES clis(slug) ON DELETE CASCADE,
          embedding vector(${this.pgVectorDimension}) NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      );
      await this.pool.query(
        `
        CREATE INDEX IF NOT EXISTS idx_cli_embeddings_vector_ivfflat
        ON cli_embeddings_vector
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `,
      );
      this.vectorEnabled = true;
    } catch {
      this.vectorEnabled = false;
    }
  }

  private async upsertCliEmbedding(client: PoolClient, cli: CliProfile) {
    const searchableText = [
      cli.identity.name,
      cli.identity.slug,
      cli.identity.description,
      cli.identity.category_tags.join(' '),
      ...cli.commands.map((command) => `${command.command} ${command.description}`),
      ...cli.auth.setup_steps.map((step) => step.instruction),
    ].join(' ');
    const embedding = await this.buildEmbedding(searchableText);
    const topCommands = cli.commands.slice(0, 10).map((command) => command.command);

    await client.query(
      `
      INSERT INTO cli_embeddings (cli_slug, embedding, searchable_text, top_commands, updated_at)
      VALUES ($1, $2::jsonb, $3, $4::jsonb, NOW())
      ON CONFLICT (cli_slug) DO UPDATE
      SET
        embedding = EXCLUDED.embedding,
        searchable_text = EXCLUDED.searchable_text,
        top_commands = EXCLUDED.top_commands,
        updated_at = NOW()
    `,
      [cli.identity.slug, JSON.stringify(embedding), searchableText, JSON.stringify(topCommands)],
    );

    if (!this.vectorEnabled || embedding.length !== this.pgVectorDimension) {
      return;
    }

    try {
      await client.query(
        `
        INSERT INTO cli_embeddings_vector (cli_slug, embedding, updated_at)
        VALUES ($1, $2::vector, NOW())
        ON CONFLICT (cli_slug) DO UPDATE
        SET embedding = EXCLUDED.embedding, updated_at = NOW()
      `,
        [cli.identity.slug, vectorLiteral(embedding)],
      );
    } catch {
      this.vectorEnabled = false;
    }
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async buildEmbedding(text: string): Promise<number[]> {
    const cacheKey = createHash('sha256').update(text).digest('hex');
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (this.embeddingCache.size >= PostgresPersistence.EMBEDDING_CACHE_MAX) {
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey !== undefined) {
        this.embeddingCache.delete(firstKey);
      }
    }

    const openAiKey = process.env.OPENAI_API_KEY;
    if (this.embeddingProvider === 'openai' && openAiKey) {
      const remote = await this.fetchOpenAiEmbedding(text, openAiKey);
      if (remote) {
        this.embeddingCache.set(cacheKey, remote);
        return remote;
      }
    }

    const fallback = embedText(text);
    this.embeddingCache.set(cacheKey, fallback);
    return fallback;
  }

  private async fetchOpenAiEmbedding(text: string, apiKey: string): Promise<number[] | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.embeddingTimeoutMs);
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.openaiEmbeddingModel,
          input: text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };
      const embedding = payload.data?.[0]?.embedding;
      if (!Array.isArray(embedding) || embedding.length === 0) {
        return null;
      }

      const normalized = embedding
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
      return normalized.length === embedding.length ? normalized : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
