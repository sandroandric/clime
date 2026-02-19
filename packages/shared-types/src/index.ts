import { z } from "zod";

export const TimestampSchema = z.string().datetime();
export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const SHA256_DIGEST_PATTERN = /^[a-f0-9]{64}$/i;

export function normalizeSha256Checksum(
  value: string | undefined | null
): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("...")) {
    return undefined;
  }

  const digest = trimmed.toLowerCase().startsWith("sha256:")
    ? trimmed.slice(7).trim()
    : trimmed;

  if (!SHA256_DIGEST_PATTERN.test(digest)) {
    return undefined;
  }

  return `sha256:${digest.toLowerCase()}`;
}

export function hasCryptographicChecksum(
  value: string | undefined | null
): boolean {
  return Boolean(normalizeSha256Checksum(value));
}

export function checksumDigest(value: string | undefined | null): string | undefined {
  const normalized = normalizeSha256Checksum(value);
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(7);
}

export const VerificationStatusSchema = z.enum([
  "auto-indexed",
  "community-curated",
  "publisher-verified"
]);

export const PlatformSchema = z.enum(["macos", "linux", "windows", "any"]);

export const AuthTypeSchema = z.enum([
  "api_key",
  "oauth",
  "login_command",
  "config_file",
  "none"
]);

export const RankingTypeSchema = z.enum(["used", "rising", "compat", "requested"]);
export const ClaimVerificationMethodSchema = z.enum(["dns_txt", "repo_file"]);

export const AgentCompatibilitySchema = z.object({
  agent_name: z.string().min(1),
  status: z.enum(["verified", "partial", "failed", "untested"]),
  success_rate: z.number().min(0).max(1),
  last_verified: TimestampSchema
});

export const CliIdentitySchema = z.object({
  slug: SlugSchema,
  name: z.string().min(1),
  publisher: z.string().min(1),
  description: z.string().min(1),
  category_tags: z.array(z.string().min(1)).min(1),
  website: z.string().url(),
  repository: z.string().url(),
  verification_status: VerificationStatusSchema,
  latest_version: z.string().min(1),
  last_updated: TimestampSchema,
  last_verified: TimestampSchema.optional(),
  popularity_score: z.number().min(0),
  trust_score: z.number().min(0).max(100),
  permission_scope: z.array(z.string().min(1)).default([]),
  compatibility: z.array(AgentCompatibilitySchema).default([])
});

export const InstallInstructionSchema = z.object({
  os: PlatformSchema,
  package_manager: z.string().min(1),
  command: z.string().min(1),
  checksum: z.string().optional(),
  signature: z.string().optional(),
  dependencies: z.array(z.string().min(1)).default([])
});

export const AuthStepSchema = z.object({
  order: z.number().int().min(1),
  instruction: z.string().min(1),
  command: z.string().optional()
});

export const AuthGuideSchema = z.object({
  auth_type: AuthTypeSchema,
  setup_steps: z.array(AuthStepSchema),
  environment_variables: z.array(z.string().min(1)).default([]),
  token_refresh: z.string().min(1),
  scopes: z.array(z.string().min(1)).default([])
});

export const CommandParameterSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
  default_value: z.string().optional()
});

export const CommandEntrySchema = z.object({
  id: z.string().min(1),
  cli_slug: SlugSchema,
  command: z.string().min(1),
  description: z.string().min(1),
  required_parameters: z.array(CommandParameterSchema).default([]),
  optional_parameters: z.array(CommandParameterSchema).default([]),
  examples: z.array(z.string().min(1)).min(1),
  expected_output: z.string().min(1),
  common_errors: z.array(z.string().min(1)).default([]),
  workflow_context: z.array(z.string().min(1)).default([])
});

export const WorkflowStepSchema = z.object({
  step_number: z.number().int().min(1),
  cli_slug: SlugSchema,
  purpose: z.string().min(1),
  command_ids: z.array(z.string().min(1)).min(1),
  auth_prerequisite: z.boolean().default(false)
});

export const WorkflowChainSchema = z.object({
  id: z.string().min(1),
  slug: SlugSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  estimated_minutes: z.number().int().positive(),
  steps: z.array(WorkflowStepSchema).min(1),
  created_at: TimestampSchema,
  updated_at: TimestampSchema
});

export const StackRecommendationSchema = z.object({
  id: z.string().min(1),
  use_case: z.string().min(1),
  workflow_id: z.string().min(1),
  rationale: z.string().min(1)
});

export const RankingEntrySchema = z.object({
  rank: z.number().int().positive(),
  id: z.string().min(1),
  label: z.string().min(1),
  score: z.number(),
  delta: z.number().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).default({})
});

export const RankingSnapshotSchema = z.object({
  type: RankingTypeSchema,
  generated_at: TimestampSchema,
  entries: z.array(RankingEntrySchema)
});

export const UnmetRequestSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  count: z.number().int().nonnegative(),
  last_seen: TimestampSchema
});

export const UsageEventSchema = z.object({
  id: z.string().min(1),
  api_key: z.string().min(1),
  endpoint: z.string().min(1),
  method: z.string().min(1),
  status_code: z.number().int(),
  latency_ms: z.number().int().nonnegative(),
  cli_slug: SlugSchema.optional(),
  query: z.string().optional(),
  metadata: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    .optional(),
  created_at: TimestampSchema
});

export const ListingVersionSchema = z.object({
  id: z.string().min(1),
  cli_slug: SlugSchema,
  version_number: z.number().int().positive(),
  changed_fields: z.array(z.string().min(1)).default([]),
  changelog: z.string().min(1),
  updated_at: TimestampSchema
});

export const ChangeFeedEventSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "listing_updated",
    "workflow_updated",
    "ranking_generated",
    "submission_created",
    "submission_approved",
    "submission_rejected"
  ]),
  entity_id: z.string().min(1),
  occurred_at: TimestampSchema,
  payload: z.record(z.any()).default({})
});

export const SubmissionStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const CommunitySubmissionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["new_cli", "edit_listing"]),
  submitter: z.string().min(1),
  target_cli_slug: SlugSchema.optional(),
  content: z.record(z.any()),
  status: SubmissionStatusSchema,
  created_at: TimestampSchema,
  reviewed_at: TimestampSchema.optional(),
  reviewer: z.string().optional(),
  review_notes: z.string().optional()
});

export const PublisherClaimRequestSchema = z.object({
  cli_slug: SlugSchema,
  publisher_name: z.string().min(1),
  domain: z.string().min(1),
  evidence: z.string().min(1),
  verification_method: ClaimVerificationMethodSchema.optional(),
  repository_url: z.string().url().optional()
});

export const PublisherClaimSchema = z.object({
  id: z.string().min(1),
  cli_slug: SlugSchema,
  publisher_name: z.string().min(1),
  domain: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected"]),
  evidence: z.string().min(1),
  verification_method: ClaimVerificationMethodSchema.default("dns_txt"),
  verification_token: z.string().min(1).optional(),
  verification_instructions: z.string().min(1).optional(),
  repository_url: z.string().url().optional(),
  verified_at: TimestampSchema.optional(),
  created_at: TimestampSchema
});

export const ReportStatusSchema = z.enum(["success", "fail"]);

export const ReportPayloadSchema = z
  .object({
    status: ReportStatusSchema,
    cli_slug: SlugSchema,
    cli_version: z.string().min(1),
    workflow_id: z.string().optional(),
    command_id: z.string().optional(),
    duration_ms: z.number().int().nonnegative(),
    exit_code: z.number().int(),
    agent_name: z.string().min(1),
    agent_version: z.string().min(1),
    os: PlatformSchema,
    arch: z.string().min(1),
    error_code: z.string().optional(),
    stderr_hash: z.string().optional(),
    request_id: z.string().min(1),
    timestamp: TimestampSchema
  })
  .superRefine((value, ctx) => {
    if (!value.workflow_id && !value.command_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either workflow_id or command_id is required"
      });
    }
  });

export const SearchRequestSchema = z.object({
  query: z.string().min(3),
  limit: z.number().int().positive().max(25).default(10),
  agent_name: z.string().optional()
});
export const DiscoverRequestSchema = SearchRequestSchema;

export const SearchResultSchema = z.object({
  cli: CliIdentitySchema,
  score: z.number(),
  reason: z.string().min(1),
  install_command: z.string().min(1).optional(),
  matched_workflows: z.array(z.string().min(1)).default([]),
  top_matching_commands: z.array(z.string().min(1)).default([])
});

export const ApiKeyCreateRequestSchema = z.object({
  owner_type: z.enum(["developer", "agent", "publisher"]).default("developer"),
  owner_id: z.string().min(1).optional(),
  label: z.string().min(1).max(80).optional()
});

export const ApiKeyCreateResponseSchema = z.object({
  api_key: z.string().min(1),
  key_id: z.string().min(1),
  owner_type: z.string().min(1),
  owner_id: z.string().optional(),
  created_at: TimestampSchema
});

export const ApiKeyUsageSummarySchema = z.object({
  api_key_hash: z.string().min(1),
  total_requests: z.number().int().nonnegative(),
  endpoints: z.array(
    z.object({
      endpoint: z.string().min(1),
      count: z.number().int().nonnegative()
    })
  ),
  top_clis: z.array(
    z.object({
      cli_slug: z.string().min(1),
      count: z.number().int().nonnegative()
    })
  ),
  top_queries: z.array(
    z.object({
      query: z.string().min(1),
      count: z.number().int().nonnegative()
    })
  ),
  last_seen: TimestampSchema.optional()
});

export const PublisherTopQuerySchema = z.object({
  query: z.string().min(1),
  count: z.number().int().nonnegative()
});

export const PublisherTopCliSchema = z.object({
  cli_slug: SlugSchema,
  count: z.number().int().nonnegative()
});

export const PublisherAnalyticsSchema = z.object({
  publisher: z.string().min(1),
  publisher_slug: z.string().min(1),
  cli_count: z.number().int().nonnegative(),
  search_impressions: z.number().int().nonnegative(),
  install_attempts: z.number().int().nonnegative(),
  command_requests: z.number().int().nonnegative(),
  report_count: z.number().int().nonnegative(),
  report_failures: z.number().int().nonnegative(),
  success_reports: z.number().int().nonnegative(),
  last_event_at: TimestampSchema.optional(),
  top_queries: z.array(PublisherTopQuerySchema).default([]),
  top_clis: z.array(PublisherTopCliSchema).default([])
});

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.any()).optional(),
  request_id: z.string().min(1)
});

export const createSuccessEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ ok: z.literal(true), data });

export const ErrorEnvelopeSchema = z.object({ ok: z.literal(false), error: ApiErrorSchema });

export const CliProfileSchema = z.object({
  identity: CliIdentitySchema,
  install: z.array(InstallInstructionSchema),
  auth: AuthGuideSchema,
  commands: z.array(CommandEntrySchema),
  listing_version: ListingVersionSchema.optional()
});

export const CliSummarySchema = z.object({
  slug: SlugSchema,
  name: z.string().min(1),
  publisher: z.string().min(1),
  description: z.string().min(1),
  verification_status: VerificationStatusSchema,
  latest_version: z.string().min(1),
  last_updated: TimestampSchema,
  popularity_score: z.number().min(0),
  trust_score: z.number().min(0).max(100),
  category_tags: z.array(z.string().min(1)).min(1),
  compatibility_score: z.number().min(0).max(1),
  auth_type: AuthTypeSchema,
  install_methods: z.array(z.string().min(1)).default([]),
  command_signals: z.array(z.string().min(1)).default([])
});

export const WorkflowSearchRequestSchema = z.object({
  query: z.string().min(3),
  limit: z.number().int().positive().max(25).default(10)
});

export const SubmissionRequestSchema = z.object({
  type: z.enum(["new_cli", "edit_listing"]),
  submitter: z.string().min(1),
  target_cli_slug: SlugSchema.optional(),
  content: z.record(z.any())
});

export const SubmissionReviewRequestSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewer: z.string().min(1).max(120).optional(),
  review_notes: z.string().max(2000).optional()
});

export const PublisherListingUpdateRequestSchema = z
  .object({
    publisher_name: z.string().min(1),
    description: z.string().min(1).optional(),
    auth: AuthGuideSchema.optional(),
    commands: z.array(CommandEntrySchema).min(1).optional(),
    install: z.array(InstallInstructionSchema).min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.description && !value.auth && !value.commands && !value.install) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "At least one update field is required: description, auth, commands, or install"
      });
    }
  });

export const PublisherClaimReviewRequestSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewer: z.string().min(1).max(120).optional(),
  review_notes: z.string().max(2000).optional()
});

export type CliIdentity = z.infer<typeof CliIdentitySchema>;
export type InstallInstruction = z.infer<typeof InstallInstructionSchema>;
export type AuthType = z.infer<typeof AuthTypeSchema>;
export type AuthGuide = z.infer<typeof AuthGuideSchema>;
export type CommandEntry = z.infer<typeof CommandEntrySchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type WorkflowChain = z.infer<typeof WorkflowChainSchema>;
export type StackRecommendation = z.infer<typeof StackRecommendationSchema>;
export type RankingType = z.infer<typeof RankingTypeSchema>;
export type RankingSnapshot = z.infer<typeof RankingSnapshotSchema>;
export type UnmetRequest = z.infer<typeof UnmetRequestSchema>;
export type UsageEvent = z.infer<typeof UsageEventSchema>;
export type ListingVersion = z.infer<typeof ListingVersionSchema>;
export type ChangeFeedEvent = z.infer<typeof ChangeFeedEventSchema>;
export type CommunitySubmission = z.infer<typeof CommunitySubmissionSchema>;
export type PublisherClaimRequest = z.infer<typeof PublisherClaimRequestSchema>;
export type PublisherClaim = z.infer<typeof PublisherClaimSchema>;
export type ReportPayload = z.infer<typeof ReportPayloadSchema>;
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
export type DiscoverRequest = z.infer<typeof DiscoverRequestSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type CliProfile = z.infer<typeof CliProfileSchema>;
export type CliSummary = z.infer<typeof CliSummarySchema>;
export type SubmissionRequest = z.infer<typeof SubmissionRequestSchema>;
export type SubmissionReviewRequest = z.infer<typeof SubmissionReviewRequestSchema>;
export type PublisherListingUpdateRequest = z.infer<typeof PublisherListingUpdateRequestSchema>;
export type PublisherClaimReviewRequest = z.infer<typeof PublisherClaimReviewRequestSchema>;
export type ClaimVerificationMethod = z.infer<typeof ClaimVerificationMethodSchema>;
export type ApiKeyCreateRequest = z.infer<typeof ApiKeyCreateRequestSchema>;
export type ApiKeyCreateResponse = z.infer<typeof ApiKeyCreateResponseSchema>;
export type ApiKeyUsageSummary = z.infer<typeof ApiKeyUsageSummarySchema>;
export type PublisherAnalytics = z.infer<typeof PublisherAnalyticsSchema>;
