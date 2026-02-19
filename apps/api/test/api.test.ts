import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

let app: FastifyInstance;
let previousDatabaseUrl: string | undefined;
let previousRequireRegisteredKeys: string | undefined;
let previousApiKeys: string | undefined;
let previousRateLimitPerMinute: string | undefined;
let previousSearchRateLimitPerMinute: string | undefined;
let previousReportRateLimitPerHour: string | undefined;
let previousCorsOrigins: string | undefined;
let previousAdminKeys: string | undefined;

const apiKeyHeader = { 'x-api-key': 'dev-local-key' };

describe('api', () => {
  beforeAll(async () => {
    previousDatabaseUrl = process.env.DATABASE_URL;
    previousRequireRegisteredKeys = process.env.CLIME_REQUIRE_REGISTERED_API_KEYS;
    previousApiKeys = process.env.CLIME_API_KEYS;
    previousRateLimitPerMinute = process.env.CLIME_RATE_LIMIT_PER_MINUTE;
    previousSearchRateLimitPerMinute = process.env.CLIME_SEARCH_RATE_LIMIT_PER_MINUTE;
    previousReportRateLimitPerHour = process.env.CLIME_REPORT_LIMIT_PER_HOUR;
    previousCorsOrigins = process.env.CLIME_CORS_ORIGINS;
    previousAdminKeys = process.env.CLIME_ADMIN_KEYS;
    delete process.env.DATABASE_URL;
    delete process.env.CLIME_REQUIRE_REGISTERED_API_KEYS;
    process.env.CLIME_CORS_ORIGINS = 'https://clime.sh,http://localhost:3000';
    process.env.CLIME_ADMIN_KEYS = 'dev-local-key';
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    if (previousDatabaseUrl) {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    if (previousRequireRegisteredKeys !== undefined) {
      process.env.CLIME_REQUIRE_REGISTERED_API_KEYS = previousRequireRegisteredKeys;
    } else {
      delete process.env.CLIME_REQUIRE_REGISTERED_API_KEYS;
    }
    if (previousApiKeys !== undefined) {
      process.env.CLIME_API_KEYS = previousApiKeys;
    } else {
      delete process.env.CLIME_API_KEYS;
    }
    if (previousRateLimitPerMinute !== undefined) {
      process.env.CLIME_RATE_LIMIT_PER_MINUTE = previousRateLimitPerMinute;
    } else {
      delete process.env.CLIME_RATE_LIMIT_PER_MINUTE;
    }
    if (previousSearchRateLimitPerMinute !== undefined) {
      process.env.CLIME_SEARCH_RATE_LIMIT_PER_MINUTE = previousSearchRateLimitPerMinute;
    } else {
      delete process.env.CLIME_SEARCH_RATE_LIMIT_PER_MINUTE;
    }
    if (previousReportRateLimitPerHour !== undefined) {
      process.env.CLIME_REPORT_LIMIT_PER_HOUR = previousReportRateLimitPerHour;
    } else {
      delete process.env.CLIME_REPORT_LIMIT_PER_HOUR;
    }
    if (previousCorsOrigins !== undefined) {
      process.env.CLIME_CORS_ORIGINS = previousCorsOrigins;
    } else {
      delete process.env.CLIME_CORS_ORIGINS;
    }
    if (previousAdminKeys !== undefined) {
      process.env.CLIME_ADMIN_KEYS = previousAdminKeys;
    } else {
      delete process.env.CLIME_ADMIN_KEYS;
    }
  });

  it('requires API keys', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/workflows' });
    expect(response.statusCode).toBe(401);
  });

  it('accepts dynamic API keys when strict registration is disabled', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/workflows',
      headers: { 'x-api-key': 'clime_dynamic_test_key' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('applies CORS only for configured origins', async () => {
    const allowed = await app.inject({
      method: 'GET',
      url: '/v1/workflows',
      headers: {
        ...apiKeyHeader,
        origin: 'https://clime.sh',
      },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://clime.sh');

    const blocked = await app.inject({
      method: 'GET',
      url: '/v1/workflows',
      headers: {
        ...apiKeyHeader,
        origin: 'https://evil.example',
      },
    });
    expect(blocked.statusCode).toBe(200);
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns search results', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/search',
      headers: apiKeyHeader,
      payload: { query: 'deploy next app', limit: 5 },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('enforces search rate limit defaults when threshold is exceeded', async () => {
    const priorSearchLimit = process.env.CLIME_SEARCH_RATE_LIMIT_PER_MINUTE;
    process.env.CLIME_SEARCH_RATE_LIMIT_PER_MINUTE = '1';
    const limitedApp = await buildApp();
    try {
      const first = await limitedApp.inject({
        method: 'POST',
        url: '/v1/discover',
        headers: apiKeyHeader,
        payload: { query: 'deploy next app', limit: 5 },
      });
      expect(first.statusCode).toBe(200);

      const second = await limitedApp.inject({
        method: 'POST',
        url: '/v1/discover',
        headers: apiKeyHeader,
        payload: { query: 'deploy next app', limit: 5 },
      });
      expect(second.statusCode).toBe(429);
      expect(second.json().error.code).toBe('SEARCH_RATE_LIMITED');
    } finally {
      await limitedApp.close();
      if (priorSearchLimit !== undefined) {
        process.env.CLIME_SEARCH_RATE_LIMIT_PER_MINUTE = priorSearchLimit;
      } else {
        delete process.env.CLIME_SEARCH_RATE_LIMIT_PER_MINUTE;
      }
    }
  });

  it('returns semantic discover results with top command matches', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/discover',
      headers: apiKeyHeader,
      payload: { query: 'deploy a next.js app', limit: 5 },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(Array.isArray(body.data[0].top_matching_commands)).toBe(true);
    expect(typeof body.data[0].install_command).toBe('string');
  });

  it('returns full CLI listing collection', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/clis',
      headers: apiKeyHeader,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(50);
  });

  it('only marks listings as publisher-verified when an approved claim exists', async () => {
    const [clisResponse, claimsResponse] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/v1/clis',
        headers: apiKeyHeader,
      }),
      app.inject({
        method: 'GET',
        url: '/v1/publishers/claims',
        headers: apiKeyHeader,
      }),
    ]);

    expect(clisResponse.statusCode).toBe(200);
    expect(claimsResponse.statusCode).toBe(200);

    const clis = clisResponse.json().data as Array<{
      identity: { slug: string; verification_status: string };
    }>;
    const claims = claimsResponse.json().data as Array<{ cli_slug: string; status: string }>;

    const approvedSlugs = new Set(
      claims.filter((claim) => claim.status === 'approved').map((claim) => claim.cli_slug),
    );
    const verifiedSlugs = clis
      .filter((entry) => entry.identity.verification_status === 'publisher-verified')
      .map((entry) => entry.identity.slug);

    expect(verifiedSlugs.every((slug) => approvedSlugs.has(slug))).toBe(true);
    if (approvedSlugs.size === 0) {
      expect(verifiedSlugs.length).toBe(0);
    }
  });

  it('does not expose synthetic checksum placeholders as cryptographic checksums', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/clis/docker/install',
      headers: apiKeyHeader,
    });

    expect(response.statusCode).toBe(200);
    const instructions = response.json().data as Array<{ checksum?: string }>;
    expect(instructions.length).toBeGreaterThan(0);
    for (const instruction of instructions) {
      if (!instruction.checksum) {
        continue;
      }
      expect(instruction.checksum).toMatch(/^sha256:[a-f0-9]{64}$/i);
    }
  });

  it('returns workflow chains', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/workflows/search',
      headers: apiKeyHeader,
      payload: { query: 'full stack saas', limit: 3 },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data[0].slug).toBe('full-stack-saas');
  });

  it('supports intent-style workflow filters for command maps', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/clis/vercel/commands?workflow=deploy',
      headers: apiKeyHeader,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('accepts structured reports and supports idempotency by request_id', async () => {
    const payload = {
      status: 'success',
      cli_slug: 'vercel',
      cli_version: '34.2.0',
      workflow_id: 'wf_full_stack_saas',
      duration_ms: 1240,
      exit_code: 0,
      agent_name: 'codex',
      agent_version: '1.0',
      os: 'linux',
      arch: 'x64',
      request_id: 'request_123',
      timestamp: new Date().toISOString(),
    };

    const first = await app.inject({
      method: 'POST',
      url: '/v1/clis/vercel/report',
      headers: apiKeyHeader,
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/v1/clis/vercel/report',
      headers: apiKeyHeader,
      payload,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().data.duplicate).toBe(false);
    expect(second.json().data.duplicate).toBe(true);
  });

  it('enforces report rate limit defaults when threshold is exceeded', async () => {
    const priorReportLimit = process.env.CLIME_REPORT_LIMIT_PER_HOUR;
    process.env.CLIME_REPORT_LIMIT_PER_HOUR = '1';
    const limitedApp = await buildApp();
    try {
      const first = await limitedApp.inject({
        method: 'POST',
        url: '/v1/clis/vercel/report',
        headers: apiKeyHeader,
        payload: {
          status: 'success',
          cli_slug: 'vercel',
          cli_version: '34.2.0',
          command_id: 'vercel-deploy',
          duration_ms: 120,
          exit_code: 0,
          agent_name: 'codex',
          agent_version: '1.0',
          os: 'linux',
          arch: 'x64',
          request_id: 'rate_limit_report_1',
          timestamp: new Date().toISOString(),
        },
      });
      expect(first.statusCode).toBe(200);

      const second = await limitedApp.inject({
        method: 'POST',
        url: '/v1/clis/vercel/report',
        headers: apiKeyHeader,
        payload: {
          status: 'success',
          cli_slug: 'vercel',
          cli_version: '34.2.0',
          command_id: 'vercel-deploy',
          duration_ms: 140,
          exit_code: 0,
          agent_name: 'codex',
          agent_version: '1.0',
          os: 'linux',
          arch: 'x64',
          request_id: 'rate_limit_report_2',
          timestamp: new Date().toISOString(),
        },
      });
      expect(second.statusCode).toBe(429);
      expect(second.json().error.code).toBe('REPORT_RATE_LIMITED');
    } finally {
      await limitedApp.close();
      if (priorReportLimit !== undefined) {
        process.env.CLIME_REPORT_LIMIT_PER_HOUR = priorReportLimit;
      } else {
        delete process.env.CLIME_REPORT_LIMIT_PER_HOUR;
      }
    }
  });

  it('returns ranking snapshots', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/rankings?type=compat',
      headers: apiKeyHeader,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.type).toBe('compat');
    expect(body.data.entries.length).toBeGreaterThan(0);
    expect(
      body.data.entries.some((entry: { delta?: number }) => typeof entry.delta === 'number'),
    ).toBe(true);
  });

  it('exposes unmet request signals as a public list', async () => {
    const uniqueQuery = `zzzxqv${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const searchResponse = await app.inject({
      method: 'POST',
      url: '/v1/search',
      headers: apiKeyHeader,
      payload: { query: uniqueQuery, limit: 5 },
    });
    expect(searchResponse.statusCode).toBe(200);
    expect(searchResponse.json().data.length).toBe(0);

    const unmetResponse = await app.inject({
      method: 'GET',
      url: '/v1/unmet-requests?limit=20',
      headers: apiKeyHeader,
    });
    expect(unmetResponse.statusCode).toBe(200);

    const unmetEntries = unmetResponse.json().data as Array<{ query: string; count: number }>;
    expect(unmetEntries.some((entry) => entry.query === uniqueQuery)).toBe(true);
    expect(unmetEntries.every((entry) => entry.count >= 1)).toBe(true);
  });

  it('seeds mixed trend deltas (positive, negative, flat) for used rankings', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/rankings?type=used',
      headers: apiKeyHeader,
    });

    expect(response.statusCode).toBe(200);
    const entries = response.json().data.entries as Array<{ delta?: number }>;
    expect(entries.length).toBeGreaterThan(0);
    const deltas = entries.slice(0, 25).map((entry) => entry.delta ?? 0);
    expect(deltas.some((delta) => delta >= 0.5)).toBe(true);
    expect(deltas.some((delta) => delta <= -0.5)).toBe(true);
    expect(deltas.some((delta) => Math.abs(delta) < 0.5)).toBe(true);
  });

  it('expands compatibility matrix to major agent set', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/clis/vercel',
      headers: apiKeyHeader,
    });

    expect(response.statusCode).toBe(200);
    const profile = response.json().data;
    const names = profile.identity.compatibility.map(
      (entry: { agent_name: string }) => entry.agent_name,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'claude-code',
        'codex-cli',
        'gemini-cli',
        'cline',
        'aider',
        'opencode',
      ]),
    );
  });

  it('creates publisher claims', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/publishers/claim',
      headers: apiKeyHeader,
      payload: {
        cli_slug: 'vercel',
        publisher_name: 'Vercel',
        domain: 'vercel.com',
        evidence: 'dns proof',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('pending');
  });

  it('redacts claim verification secrets for non-admin claim-list requests', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/publishers/claim',
      headers: apiKeyHeader,
      payload: {
        cli_slug: 'vercel',
        publisher_name: 'Vercel',
        domain: 'vercel.com',
        evidence: 'dns proof',
      },
    });

    const publicList = await app.inject({
      method: 'GET',
      url: '/v1/publishers/claims',
      headers: { 'x-api-key': 'non-admin-key' },
    });
    expect(publicList.statusCode).toBe(200);
    const publicClaim = publicList.json().data[0] as {
      verification_token?: string;
      verification_instructions?: string;
      repository_url?: string;
    };
    expect(publicClaim.verification_token).toBeUndefined();
    expect(publicClaim.verification_instructions).toBeUndefined();
    expect(publicClaim.repository_url).toBeUndefined();

    const adminList = await app.inject({
      method: 'GET',
      url: '/v1/publishers/claims',
      headers: apiKeyHeader,
    });
    expect(adminList.statusCode).toBe(200);
    const adminClaim = adminList.json().data[0] as { verification_token?: string };
    expect(typeof adminClaim.verification_token).toBe('string');
  });

  it('verifies publisher claims and returns explicit result', async () => {
    const claimResponse = await app.inject({
      method: 'POST',
      url: '/v1/publishers/claim',
      headers: apiKeyHeader,
      payload: {
        cli_slug: 'vercel',
        publisher_name: 'Vercel',
        domain: 'vercel.com',
        evidence: 'dns proof',
      },
    });
    expect(claimResponse.statusCode).toBe(200);
    const claimId = claimResponse.json().data.id as string;

    const verifyResponse = await app.inject({
      method: 'POST',
      url: `/v1/publishers/claim/${claimId}/verify`,
      headers: apiKeyHeader,
    });
    expect(verifyResponse.statusCode).toBe(200);
    expect(typeof verifyResponse.json().data.verified).toBe('boolean');
  });

  it('blocks claim verification for non-admin API keys', async () => {
    const claimResponse = await app.inject({
      method: 'POST',
      url: '/v1/publishers/claim',
      headers: apiKeyHeader,
      payload: {
        cli_slug: 'vercel',
        publisher_name: 'Vercel',
        domain: 'vercel.com',
        evidence: 'dns proof',
      },
    });
    expect(claimResponse.statusCode).toBe(200);
    const claimId = claimResponse.json().data.id as string;

    const blocked = await app.inject({
      method: 'POST',
      url: `/v1/publishers/claim/${claimId}/verify`,
      headers: { 'x-api-key': 'non-admin-key' },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('ADMIN_REQUIRED');
  });

  it('reviews submissions through admin-only moderation endpoint', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/submissions',
      headers: apiKeyHeader,
      payload: {
        type: 'new_cli',
        submitter: 'test-suite',
        content: {
          name: 'moderated-cli',
          description: 'moderation flow test',
        },
      },
    });
    expect(created.statusCode).toBe(200);
    const submissionId = created.json().data.id as string;

    const blocked = await app.inject({
      method: 'POST',
      url: `/v1/submissions/${submissionId}/review`,
      headers: { 'x-api-key': 'non-admin-key' },
      payload: { status: 'approved', reviewer: 'mod-a' },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('ADMIN_REQUIRED');

    const reviewed = await app.inject({
      method: 'POST',
      url: `/v1/submissions/${submissionId}/review`,
      headers: apiKeyHeader,
      payload: {
        status: 'approved',
        reviewer: 'admin-reviewer',
        review_notes: 'Quality gate passed',
      },
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().data.status).toBe('approved');
    expect(reviewed.json().data.reviewer).toBe('admin-reviewer');
  });

  it('supports manual publisher claim approve/reject with admin-only access', async () => {
    const claimResponse = await app.inject({
      method: 'POST',
      url: '/v1/publishers/claim',
      headers: apiKeyHeader,
      payload: {
        cli_slug: 'render',
        publisher_name: 'Render',
        domain: 'render.com',
        evidence: 'ownership proof',
      },
    });
    expect(claimResponse.statusCode).toBe(200);
    const claimId = claimResponse.json().data.id as string;

    const blocked = await app.inject({
      method: 'POST',
      url: `/v1/publishers/claim/${claimId}/review`,
      headers: { 'x-api-key': 'non-admin-key' },
      payload: { status: 'rejected' },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('ADMIN_REQUIRED');

    const approved = await app.inject({
      method: 'POST',
      url: `/v1/publishers/claim/${claimId}/review`,
      headers: apiKeyHeader,
      payload: {
        status: 'approved',
        reviewer: 'admin-reviewer',
        review_notes: 'Verified manually',
      },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().data.claim.status).toBe('approved');
    expect(approved.json().data.verified).toBe(true);
  });

  it('validates publisher listing updates with structured schema', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/publishers/listings/vercel/update',
      headers: apiKeyHeader,
      payload: {
        publisher_name: 'Vercel',
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');
  });
  it('requires publisher-owned API keys for publisher listing updates', async () => {
    const claimResponse = await app.inject({
      method: 'POST',
      url: '/v1/publishers/claim',
      headers: apiKeyHeader,
      payload: {
        cli_slug: 'vercel',
        publisher_name: 'Vercel',
        domain: 'vercel.com',
        evidence: 'ownership proof',
      },
    });
    expect(claimResponse.statusCode).toBe(200);
    const claimId = claimResponse.json().data.id as string;

    const approveResponse = await app.inject({
      method: 'POST',
      url: `/v1/publishers/claim/${claimId}/review`,
      headers: apiKeyHeader,
      payload: { status: 'approved', reviewer: 'admin' },
    });
    expect(approveResponse.statusCode).toBe(200);

    const publisherKeyResponse = await app.inject({
      method: 'POST',
      url: '/v1/api-keys/create',
      headers: apiKeyHeader,
      payload: { owner_type: 'publisher', owner_id: 'Vercel' },
    });
    expect(publisherKeyResponse.statusCode).toBe(200);
    const publisherKey = publisherKeyResponse.json().data.api_key as string;

    const allowed = await app.inject({
      method: 'POST',
      url: '/v1/publishers/listings/vercel/update',
      headers: { 'x-api-key': publisherKey },
      payload: {
        publisher_name: 'Vercel',
        description: 'Deploy and manage Next.js projects',
      },
    });
    expect(allowed.statusCode).toBe(200);

    const wrongPublisherKeyResponse = await app.inject({
      method: 'POST',
      url: '/v1/api-keys/create',
      headers: apiKeyHeader,
      payload: { owner_type: 'publisher', owner_id: 'Stripe' },
    });
    expect(wrongPublisherKeyResponse.statusCode).toBe(200);
    const wrongPublisherKey = wrongPublisherKeyResponse.json().data.api_key as string;

    const blocked = await app.inject({
      method: 'POST',
      url: '/v1/publishers/listings/vercel/update',
      headers: { 'x-api-key': wrongPublisherKey },
      payload: {
        publisher_name: 'Vercel',
        description: 'Unauthorized update attempt',
      },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('PUBLISHER_KEY_MISMATCH');
  });

  it('creates API keys and returns usage summary scoped to that key', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/v1/api-keys/create',
      headers: apiKeyHeader,
      payload: {
        owner_type: 'agent',
        owner_id: 'agent-test',
      },
    });
    expect(create.statusCode).toBe(200);
    const issuedKey = create.json().data.api_key as string;
    expect(issuedKey.startsWith('clime_')).toBe(true);

    const scopedRequest = await app.inject({
      method: 'POST',
      url: '/v1/discover',
      headers: { 'x-api-key': issuedKey },
      payload: { query: 'database tools', limit: 3 },
    });
    expect(scopedRequest.statusCode).toBe(200);

    const usage = await app.inject({
      method: 'GET',
      url: `/v1/usage/by-key?api_key=${encodeURIComponent(issuedKey)}`,
      headers: apiKeyHeader,
    });
    expect(usage.statusCode).toBe(200);
    expect(usage.json().data.total_requests).toBeGreaterThan(0);
    const ownerUsage = await app.inject({
      method: 'GET',
      url: '/v1/usage/by-key',
      headers: { 'x-api-key': issuedKey },
    });
    expect(ownerUsage.statusCode).toBe(200);

    const otherKeyCreate = await app.inject({
      method: 'POST',
      url: '/v1/api-keys/create',
      headers: apiKeyHeader,
      payload: {
        owner_type: 'agent',
        owner_id: 'agent-other',
      },
    });
    expect(otherKeyCreate.statusCode).toBe(200);
    const otherKey = otherKeyCreate.json().data.api_key as string;

    const blockedUsage = await app.inject({
      method: 'GET',
      url: `/v1/usage/by-key?api_key=${encodeURIComponent(issuedKey)}`,
      headers: { 'x-api-key': otherKey },
    });
    expect(blockedUsage.statusCode).toBe(403);
    expect(blockedUsage.json().error.code).toBe('FORBIDDEN_API_KEY_SCOPE');
  });

  it('returns publisher analytics derived from real telemetry', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/discover',
      headers: apiKeyHeader,
      payload: { query: 'deploy next.js app', limit: 5 },
    });

    await app.inject({
      method: 'GET',
      url: '/v1/clis/vercel/install',
      headers: apiKeyHeader,
    });

    await app.inject({
      method: 'GET',
      url: '/v1/clis/vercel/commands?workflow=deploy',
      headers: apiKeyHeader,
    });

    await app.inject({
      method: 'POST',
      url: '/v1/clis/vercel/report',
      headers: apiKeyHeader,
      payload: {
        status: 'fail',
        cli_slug: 'vercel',
        cli_version: '34.2.0',
        command_id: 'cmd_vercel_deploy',
        duration_ms: 420,
        exit_code: 1,
        agent_name: 'codex',
        agent_version: '1.0',
        os: 'linux',
        arch: 'x64',
        error_code: 'BUILD_FAILED',
        request_id: 'request_publisher_analytics_1',
        timestamp: new Date().toISOString(),
      },
    });

    const analytics = await app.inject({
      method: 'GET',
      url: '/v1/publishers/analytics/vercel',
      headers: apiKeyHeader,
    });
    expect(analytics.statusCode).toBe(200);
    const body = analytics.json().data as {
      publisher: string;
      search_impressions: number;
      install_attempts: number;
      command_requests: number;
      report_count: number;
      report_failures: number;
    };
    expect(body.publisher).toBe('Vercel');
    expect(body.search_impressions).toBeGreaterThan(0);
    expect(body.install_attempts).toBeGreaterThan(0);
    expect(body.command_requests).toBeGreaterThan(0);
    expect(body.report_count).toBeGreaterThan(0);
    expect(body.report_failures).toBeGreaterThan(0);
  });

  it('exposes usage events for dashboard metrics', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/search',
      headers: apiKeyHeader,
      payload: { query: 'deploy', limit: 2 },
    });
    const usage = await app.inject({
      method: 'GET',
      url: '/v1/usage',
      headers: apiKeyHeader,
    });
    expect(usage.statusCode).toBe(200);
    expect(Array.isArray(usage.json().data)).toBe(true);
    expect(usage.json().data.length).toBeGreaterThan(0);
  });

  it('rejects unknown API keys when strict registration is enabled', async () => {
    const priorStrict = process.env.CLIME_REQUIRE_REGISTERED_API_KEYS;
    const priorKeys = process.env.CLIME_API_KEYS;
    process.env.CLIME_REQUIRE_REGISTERED_API_KEYS = 'true';
    process.env.CLIME_API_KEYS = 'strict-key';

    const strictApp = await buildApp();
    try {
      const invalid = await strictApp.inject({
        method: 'GET',
        url: '/v1/workflows',
        headers: { 'x-api-key': 'clime_dynamic_test_key' },
      });
      expect(invalid.statusCode).toBe(403);

      const valid = await strictApp.inject({
        method: 'GET',
        url: '/v1/workflows',
        headers: { 'x-api-key': 'strict-key' },
      });
      expect(valid.statusCode).toBe(200);
    } finally {
      await strictApp.close();
      if (priorStrict !== undefined) {
        process.env.CLIME_REQUIRE_REGISTERED_API_KEYS = priorStrict;
      } else {
        delete process.env.CLIME_REQUIRE_REGISTERED_API_KEYS;
      }
      if (priorKeys !== undefined) {
        process.env.CLIME_API_KEYS = priorKeys;
      } else {
        delete process.env.CLIME_API_KEYS;
      }
    }
  });
});
