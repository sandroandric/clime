import type {
  ChangeFeedEvent,
  CliProfile,
  CommunitySubmission,
  ListingVersion,
  PublisherClaim,
  RankingSnapshot,
  ReportPayload,
  UnmetRequest,
  UsageEvent,
  WorkflowChain
} from "@cli-me/shared-types";

export interface RegistryData {
  clis: CliProfile[];
  workflows: WorkflowChain[];
  submissions: CommunitySubmission[];
  publisherClaims: PublisherClaim[];
  reports: ReportPayload[];
  usageEvents: UsageEvent[];
  unmetRequests: UnmetRequest[];
  listingVersions: ListingVersion[];
  changes: ChangeFeedEvent[];
  rankings: RankingSnapshot[];
}

export interface RankingInputs {
  reports: ReportPayload[];
  unmetRequests: UnmetRequest[];
}
