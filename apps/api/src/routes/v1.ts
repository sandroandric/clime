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
