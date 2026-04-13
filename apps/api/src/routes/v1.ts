import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  ApiKeyCreateRequestSchema,
  DiscoverRequestSchema,
  type InstallInstruction,
  PublisherClaimReviewRequestSchema,
  PublisherListingUpdateRequestSchema,
  PublisherClaimRequestSchema,
  RankingTypeSchema,
  ReportPayloadSchema,
  SearchRequestSchema,
  SubmissionReviewRequestSchema,
  SubmissionRequestSchema,
  WorkflowSearchRequestSchema,
} from '@cli-me/shared-types';
import { buildOpenApiDocument } from '@cli-me/shared-types/openapi';
import type { SafeParseReturnType } from 'zod';
import { ApiError, success } from '../lib/errors.js';
import type { InstallChecksumResolver } from '../lib/install-checksum-resolver.js';
import type { RegistryStore } from '../lib/store.js';

function assertSchema<T>(result: SafeParseReturnType<unknown, T>) {
  if (!result.success) {
    throw new ApiError('VALIDATION_ERROR', 'Request validation failed', 400, {
      issues: result.error?.flatten(),
    });
  }
  return result.data;
}

function ensureAdmin(request: FastifyRequest) {
  if (!request.isAdmin) {
    throw new ApiError('ADMIN_REQUIRED', 'This action requires an admin API key.', 403);
  }
}

function renderUsageSummaryPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>clime admin usage summary</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #faf7f2;
        --surface: #ffffff;
        --border: #e3d8c6;
        --text: #201d1a;
        --muted: #6b6254;
        --accent: #0a8e89;
        --accent-soft: rgba(10, 142, 137, 0.1);
      }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
      main { max-width: 1200px; margin: 0 auto; padding: 32px 20px 64px; }
      h1, h2, h3, p { margin: 0; }
      p { color: var(--muted); }
      .stack { display: grid; gap: 20px; }
      .card { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 20px; }
      .controls { display: grid; gap: 12px; }
      label { display: grid; gap: 8px; font-size: 14px; font-weight: 600; }
      input { width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); font-size: 14px; }
      button { width: fit-content; border: 0; border-radius: 999px; padding: 12px 18px; font-size: 14px; font-weight: 700; background: var(--accent); color: white; cursor: pointer; }
      .note { padding: 12px 14px; border-radius: 12px; background: var(--accent-soft); color: var(--text); font-size: 14px; }
      .error { color: #b42318; font-size: 14px; min-height: 20px; }
      .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
      .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
      .stat { border: 1px solid var(--border); border-radius: 14px; padding: 14px; }
      .stat-label { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--accent); margin-bottom: 6px; }
      .stat-value { font-size: 26px; font-weight: 700; }
      .meta { margin-top: 16px; font-size: 13px; color: var(--muted); }
      .lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 18px; }
      ol { margin: 12px 0 0; padding-left: 20px; }
      li { margin-bottom: 8px; font-size: 14px; }
      .empty { color: var(--muted); font-size: 14px; margin-top: 12px; }
      .hidden { display: none; }
      @media (max-width: 640px) { main { padding: 20px 14px 48px; } .stats { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main class="stack">
      <section class="card stack">
        <div class="stack" style="gap:8px">
          <h1>clime admin usage summary</h1>
          <p>Internal dashboard for production telemetry. The key stays in session storage only and the actual data request still goes through the admin-only JSON endpoint.</p>
        </div>
        <div class="controls">
          <label>
            Admin API key
            <input id="admin-key" type="password" placeholder="Paste CLIME_ADMIN_KEYS value" autocomplete="off" />
          </label>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <button id="load-button" type="button">Load summary</button>
            <button id="clear-button" type="button" style="background:#201d1a">Clear key</button>
          </div>
          <div class="note">All-time metrics reflect the full database. Retained-window metrics reflect only the latest 20,000 usage events and are labeled explicitly.</div>
          <div id="error" class="error"></div>
        </div>
      </section>
      <section id="results" class="summary-grid hidden"></section>
    </main>
    <script>
      const keyInput = document.getElementById('admin-key');
      const loadButton = document.getElementById('load-button');
      const clearButton = document.getElementById('clear-button');
      const errorNode = document.getElementById('error');
      const resultsNode = document.getElementById('results');
      const storageKey = 'clime-admin-usage-key';

      const renderList = (title, rows, formatter) => {
        if (!rows || rows.length === 0) {
          return '<div class="card"><h3>' + title + '</h3><div class="empty">No data.</div></div>';
        }
        return '<div class="card"><h3>' + title + '</h3><ol>' +
          rows.map((row) => '<li>' + formatter(row) + '</li>').join('') +
          '</ol></div>';
      };

      const renderBucket = (title, bucket, note) => {
        return '<section class="card stack">' +
          '<div class="stack" style="gap:8px"><h2>' + title + '</h2><p>' + note + '</p></div>' +
          '<div class="stats">' +
            '<div class="stat"><span class="stat-label">Requests</span><span class="stat-value">' + bucket.total_requests.toLocaleString() + '</span></div>' +
            '<div class="stat"><span class="stat-label">Distinct keys</span><span class="stat-value">' + bucket.distinct_api_keys.toLocaleString() + '</span></div>' +
            '<div class="stat"><span class="stat-label">Active 24h</span><span class="stat-value">' + bucket.active_api_keys_24h.toLocaleString() + '</span></div>' +
            '<div class="stat"><span class="stat-label">Active 7d</span><span class="stat-value">' + bucket.active_api_keys_7d.toLocaleString() + '</span></div>' +
            '<div class="stat"><span class="stat-label">Active 30d</span><span class="stat-value">' + bucket.active_api_keys_30d.toLocaleString() + '</span></div>' +
            '<div class="stat"><span class="stat-label">Last seen</span><span class="stat-value" style="font-size:18px">' + (bucket.last_seen ? new Date(bucket.last_seen).toLocaleString() : 'n/a') + '</span></div>' +
          '</div>' +
          (bucket.window_limit ? '<div class="meta">Window limit: ' + bucket.window_limit.toLocaleString() + ' events. Truncated: ' + (bucket.truncated ? 'yes' : 'no') + '.</div>' : '') +
          '<div class="lists">' +
            renderList('Top CLIs', bucket.top_clis, (row) => row.cli_slug + ' <strong>(' + row.count + ')</strong>') +
            renderList('Top queries', bucket.top_queries, (row) => row.query + ' <strong>(' + row.count + ')</strong>') +
            renderList('Top endpoints', bucket.top_endpoints, (row) => row.endpoint + ' <strong>(' + row.count + ')</strong>') +
            renderList('Owner types', bucket.owner_types, (row) => row.owner_type + ' <strong>(' + row.count + ')</strong>') +
          '</div>' +
        '</section>';
      };

      async function loadSummary() {
        const key = keyInput.value.trim();
        errorNode.textContent = '';
        resultsNode.classList.add('hidden');
        resultsNode.innerHTML = '';
        if (!key) {
          errorNode.textContent = 'Admin API key is required.';
          return;
        }
        sessionStorage.setItem(storageKey, key);
        loadButton.disabled = true;
        loadButton.textContent = 'Loading...';
        try {
          const response = await fetch('/v1/admin/usage-summary', { headers: { 'x-api-key': key } });
          const payload = await response.json();
          if (!response.ok || !payload.ok) {
            throw new Error(payload?.error?.message || 'Request failed');
          }
          resultsNode.innerHTML =
            renderBucket('All-time', payload.data.all_time, 'Full database aggregate.') +
            renderBucket('Retained window', payload.data.retained_window, 'Latest 20,000 usage events only.');
          resultsNode.classList.remove('hidden');
        } catch (error) {
          errorNode.textContent = error instanceof Error ? error.message : 'Request failed.';
        } finally {
          loadButton.disabled = false;
          loadButton.textContent = 'Load summary';
        }
      }

      loadButton.addEventListener('click', loadSummary);
      clearButton.addEventListener('click', () => {
        sessionStorage.removeItem(storageKey);
        keyInput.value = '';
        resultsNode.classList.add('hidden');
        resultsNode.innerHTML = '';
        errorNode.textContent = '';
      });

      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        keyInput.value = saved;
      }
    </script>
  </body>
</html>`;
}

async function notifyClaimSubmission(input: {
  id: string;
  cli_slug: string;
  publisher_name: string;
  domain: string;
  verification_instructions?: string;
}) {
  const webhook = process.env.CLAIM_NOTIFICATION_WEBHOOK_URL;
  if (webhook) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event: 'publisher_claim_submitted',
          claim: input,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const reviewEmail = process.env.CLAIM_REVIEW_EMAIL;
  if (resendApiKey && reviewEmail) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: process.env.CLAIM_NOTIFICATION_FROM ?? 'clime <noreply@clime.sh>',
          to: [reviewEmail],
          subject: `[clime] New publisher claim for ${input.cli_slug}`,
          text: [
            `Claim ID: ${input.id}`,
            `CLI: ${input.cli_slug}`,
            `Publisher: ${input.publisher_name}`,
            `Domain: ${input.domain}`,
            `Verification: ${input.verification_instructions ?? 'n/a'}`,
          ].join('\n'),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function registerV1Routes(
  app: FastifyInstance,
  store: RegistryStore,
  checksumResolver?: InstallChecksumResolver,
) {
  app.get('/admin/usage-summary', async (_, reply) => {
    reply.header('cache-control', 'no-store');
    reply.type('text/html; charset=utf-8');
    return renderUsageSummaryPage();
  });

  app.get('/v1/openapi', async () => success(buildOpenApiDocument()));

  app.post('/v1/search', async (request) => {
    const input = assertSchema(SearchRequestSchema.safeParse(request.body));
    const results = await store.searchClis(input.query, input.limit);
    (request as { usageQuery?: string }).usageQuery = input.query;
    (request as { usageMetadata?: Record<string, unknown> }).usageMetadata = {
      result_count: results.length,
      result_slugs: results.map((entry) => entry.cli.slug).slice(0, 10),
    };
    return success(results);
  });

  app.post('/v1/discover', async (request) => {
    const input = assertSchema(DiscoverRequestSchema.safeParse(request.body));
    const results = await store.discoverClis(input.query, input.limit);
    (request as { usageQuery?: string }).usageQuery = input.query;
    (request as { usageMetadata?: Record<string, unknown> }).usageMetadata = {
      result_count: results.length,
      result_slugs: results.map((entry) => entry.cli.slug).slice(0, 10),
      endpoint: 'discover',
    };
    return success(results);
  });

  app.get('/v1/clis', async (request) => {
    const query = request.query as { view?: string };
    if (query.view?.toLowerCase() === 'summary') {
      return success(store.listCliSummaries());
    }
    return success(store.listClis());
  });

  app.get('/v1/clis/:slug', async (request) => {
    const params = request.params as { slug: string };
    (request as { usageCliSlug?: string }).usageCliSlug = params.slug;
    const cli = store.getCli(params.slug);
    if (!cli) {
      throw new ApiError('CLI_NOT_FOUND', `CLI '${params.slug}' not found`, 404);
    }
    return success(cli);
  });

  app.get('/v1/clis/:slug/install', async (request) => {
    const params = request.params as { slug: string };
    const query = request.query as { os?: string; package_manager?: string };
    (request as { usageCliSlug?: string }).usageCliSlug = params.slug;
    const instructions = store.getInstallInstructions(params.slug, query.os, query.package_manager);
    if (!instructions) {
      throw new ApiError('CLI_NOT_FOUND', `CLI '${params.slug}' not found`, 404);
    }

    const normalized = instructions.map((instruction) => ({
      ...instruction,
      checksum: instruction.checksum,
    })) as InstallInstruction[];
    if (!checksumResolver) {
      return success(normalized);
    }

    const resolved = await checksumResolver.enrichInstallInstructions(params.slug, normalized);
    await store.persistResolvedInstallChecksums(params.slug, resolved);
    return success(resolved);
  });

  app.get('/v1/clis/:slug/commands', async (request) => {
    const params = request.params as { slug: string };
    const query = request.query as { workflow?: string };
    (request as { usageCliSlug?: string }).usageCliSlug = params.slug;
    (request as { usageMetadata?: Record<string, unknown> }).usageMetadata = query.workflow
      ? { workflow: query.workflow }
      : undefined;
    const commands = store.getCommands(params.slug, query.workflow);
    if (!commands) {
      throw new ApiError('CLI_NOT_FOUND', `CLI '${params.slug}' not found`, 404);
    }

    return success(commands);
  });

  app.get('/v1/clis/:slug/auth', async (request) => {
    const params = request.params as { slug: string };
    (request as { usageCliSlug?: string }).usageCliSlug = params.slug;
    const auth = store.getAuthGuide(params.slug);
    if (!auth) {
      throw new ApiError('CLI_NOT_FOUND', `CLI '${params.slug}' not found`, 404);
    }
    return success(auth);
  });

  app.post('/v1/clis/:slug/report', async (request) => {
    const params = request.params as { slug: string };
    const report = assertSchema(ReportPayloadSchema.safeParse(request.body));
    (request as { usageCliSlug?: string }).usageCliSlug = params.slug;
    (request as { usageMetadata?: Record<string, unknown> }).usageMetadata = {
      status: report.status,
      agent: report.agent_name,
    };
    if (params.slug !== report.cli_slug) {
      throw new ApiError('CLI_MISMATCH', 'Path slug must match report.cli_slug', 400);
    }

    const cli = store.getCli(report.cli_slug);
    if (!cli) {
      throw new ApiError('CLI_NOT_FOUND', `CLI '${params.slug}' not found`, 404);
    }

    const result = await store.addReport(report);
    return success(result);
  });

  app.get('/v1/workflows', async () => {
    return success(store.listWorkflows());
  });

  app.get('/v1/workflows/:id', async (request) => {
    const params = request.params as { id: string };
    const workflow = store.getWorkflow(params.id);
    if (!workflow) {
      throw new ApiError('WORKFLOW_NOT_FOUND', `Workflow '${params.id}' not found`, 404);
    }
    return success(workflow);
  });

  app.post('/v1/workflows/search', async (request) => {
    const input = assertSchema(WorkflowSearchRequestSchema.safeParse(request.body));
    const workflows = store.searchWorkflows(input.query, input.limit);
    return success(workflows);
  });

  app.get('/v1/rankings', async (request) => {
    const query = request.query as { type?: string };
    const parsed = RankingTypeSchema.safeParse(query.type ?? 'used');
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', 'Invalid ranking type', 400, {
        accepted: RankingTypeSchema.options,
      });
    }
    return success(await store.getRanking(parsed.data));
  });

  app.get('/v1/unmet-requests', async (request) => {
    const query = request.query as { limit?: string };
    const parsedLimit = Number.parseInt(query.limit ?? '100', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(parsedLimit, 500) : 100;
    return success(store.listUnmetRequests(limit));
  });

  app.post('/v1/submissions', async (request) => {
    const submission = assertSchema(SubmissionRequestSchema.safeParse(request.body));
    return success(await store.addSubmission(submission));
  });

  app.get('/v1/submissions', async () => {
    return success(store.listSubmissions());
  });

  app.post('/v1/submissions/:id/review', async (request) => {
    ensureAdmin(request);
    const params = request.params as { id: string };
    const payload = assertSchema(SubmissionReviewRequestSchema.safeParse(request.body));
    const reviewed = await store.reviewSubmission(params.id, payload);
    if (!reviewed) {
      throw new ApiError('SUBMISSION_NOT_FOUND', `Submission '${params.id}' not found`, 404);
    }
    return success(reviewed);
  });

  app.post('/v1/publishers/claim', async (request) => {
    const payload = assertSchema(PublisherClaimRequestSchema.safeParse(request.body));
    const cli = store.getCli(payload.cli_slug);
    if (!cli) {
      throw new ApiError('CLI_NOT_FOUND', `CLI '${payload.cli_slug}' not found`, 404);
    }
    const claim = await store.createPublisherClaim(payload);
    try {
      await notifyClaimSubmission({
        id: claim.id,
        cli_slug: claim.cli_slug,
        publisher_name: claim.publisher_name,
        domain: claim.domain,
        verification_instructions: claim.verification_instructions,
      });
    } catch (error) {
      // Best-effort notifier, do not fail claim creation on delivery issues.
      request.log.error(
        {
          error,
          claim_id: claim.id,
          cli_slug: claim.cli_slug,
        },
        'publisher claim notification failed',
      );
    }
    return success(claim);
  });

  app.post('/v1/publishers/claim/:id/verify', async (request) => {
    ensureAdmin(request);
    const params = request.params as { id: string };
    const result = await store.verifyPublisherClaim(params.id);
    if (!result) {
      throw new ApiError('CLAIM_NOT_FOUND', `Claim '${params.id}' not found`, 404);
    }
    return success(result);
  });

  app.post('/v1/publishers/claim/:id/review', async (request) => {
    ensureAdmin(request);
    const params = request.params as { id: string };
    const payload = assertSchema(PublisherClaimReviewRequestSchema.safeParse(request.body));
    const result = await store.reviewPublisherClaim(params.id, payload);
    if (!result) {
      throw new ApiError('CLAIM_NOT_FOUND', `Claim '${params.id}' not found`, 404);
    }
    return success(result);
  });

  app.post('/v1/publishers/listings/:slug/update', async (request) => {
    const params = request.params as { slug: string };
    const payload = assertSchema(PublisherListingUpdateRequestSchema.safeParse(request.body));

    const result = await store.updateListingByPublisher({
      cli_slug: params.slug,
      publisher_name: payload.publisher_name,
      requester_api_key: request.apiKey,
      requester_is_admin: request.isAdmin,
      description: payload.description,
      auth: payload.auth,
      commands: payload.commands,
      install: payload.install,
    });
    if (!result) {
      throw new ApiError('CLI_NOT_FOUND', `CLI '${params.slug}' not found`, 404);
    }
    if (!result.ok) {
      const messageByReason: Record<string, string> = {
        PUBLISHER_NOT_VERIFIED: 'Publisher claim must be approved before listing edits',
        PUBLISHER_KEY_REQUIRED: 'Use a publisher-owned API key to update listings.',
        PUBLISHER_KEY_MISMATCH: 'Publisher API key owner does not match payload.publisher_name.',
      };
      throw new ApiError(
        result.reason,
        messageByReason[result.reason] ?? 'Publisher update is not authorized',
        403,
      );
    }
    return success(result.cli);
  });

  app.get('/v1/publishers/claims', async (request) => {
    const claims = store.listPublisherClaims();
    if (request.isAdmin) {
      return success(claims);
    }

    return success(
      claims.map((claim) => ({
        ...claim,
        verification_token: undefined,
        verification_instructions: undefined,
        repository_url: undefined,
      })),
    );
  });

  app.get('/v1/publishers/analytics', async (request) => {
    const query = request.query as { publisher?: string };
    return success(store.publisherAnalytics(query.publisher));
  });

  app.get('/v1/publishers/analytics/:id', async (request) => {
    const params = request.params as { id: string };
    const rows = store.publisherAnalytics(params.id);
    if (rows.length === 0) {
      throw new ApiError('PUBLISHER_NOT_FOUND', `Publisher '${params.id}' not found`, 404);
    }
    return success(rows[0]);
  });

  app.get('/v1/changes/feed', async (request) => {
    const query = request.query as { since?: string };
    if (query.since && Number.isNaN(Date.parse(query.since))) {
      throw new ApiError('VALIDATION_ERROR', 'Invalid since timestamp', 400);
    }
    return success(store.getChangeFeed(query.since));
  });

  app.get('/v1/usage', async () => {
    return success(store.usageSummary());
  });

  app.get('/v1/admin/usage-summary', async (request) => {
    ensureAdmin(request);
    return success(await store.globalUsageSummary());
  });

  app.post('/v1/api-keys/create', async (request) => {
    const payload = assertSchema(ApiKeyCreateRequestSchema.safeParse(request.body));
    return success(await store.createApiKey(payload));
  });

  app.get('/v1/usage/by-key', async (request) => {
    const query = request.query as { api_key?: string };
    const targetApiKey = query.api_key?.trim() || request.apiKey;
    if (!targetApiKey) {
      throw new ApiError('VALIDATION_ERROR', 'api_key query param is required', 400);
    }

    if (!request.isAdmin && targetApiKey !== request.apiKey) {
      throw new ApiError(
        'FORBIDDEN_API_KEY_SCOPE',
        'You can only query usage for your own API key.',
        403,
      );
    }

    return success(await store.usageSummaryByApiKey(targetApiKey));
  });
}
