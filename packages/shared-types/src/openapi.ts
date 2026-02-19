import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  ApiKeyUsageSummarySchema,
  ApiErrorSchema,
  AuthGuideSchema,
  ChangeFeedEventSchema,
  CliProfileSchema,
  CliSummarySchema,
  CommandEntrySchema,
  CommunitySubmissionSchema,
  InstallInstructionSchema,
  PublisherAnalyticsSchema,
  PublisherClaimRequestSchema,
  PublisherClaimReviewRequestSchema,
  PublisherClaimSchema,
  PublisherListingUpdateRequestSchema,
  RankingSnapshotSchema,
  ReportPayloadSchema,
  SearchRequestSchema,
  SearchResultSchema,
  SubmissionReviewRequestSchema,
  SubmissionRequestSchema,
  UnmetRequestSchema,
  UsageEventSchema,
  WorkflowChainSchema,
  WorkflowSearchRequestSchema,
  createSuccessEnvelope,
  ErrorEnvelopeSchema
} from "./index.js";

export function buildOpenApiDocument() {
  const successSearch = createSuccessEnvelope(SearchResultSchema.array());
  const successProfile = createSuccessEnvelope(CliProfileSchema);
  const successProfiles = createSuccessEnvelope(CliProfileSchema.array());
  const successCliSummaries = createSuccessEnvelope(CliSummarySchema.array());
  const successInstall = createSuccessEnvelope(InstallInstructionSchema.array());
  const successCommands = createSuccessEnvelope(CommandEntrySchema.array());
  const successAuth = createSuccessEnvelope(AuthGuideSchema);
  const successWorkflow = createSuccessEnvelope(WorkflowChainSchema);
  const successWorkflows = createSuccessEnvelope(WorkflowChainSchema.array());
  const successRanking = createSuccessEnvelope(RankingSnapshotSchema);
  const successUnmetRequests = createSuccessEnvelope(UnmetRequestSchema.array());
  const successSubmission = createSuccessEnvelope(CommunitySubmissionSchema);
  const successPublisherClaim = createSuccessEnvelope(PublisherClaimSchema);
  const successPublisherClaims = createSuccessEnvelope(PublisherClaimSchema.array());
  const successPublisherAnalytics = createSuccessEnvelope(PublisherAnalyticsSchema.array());
  const successPublisherAnalyticsSingle = createSuccessEnvelope(PublisherAnalyticsSchema);
  const successChanges = createSuccessEnvelope(ChangeFeedEventSchema.array());
  const successUsage = createSuccessEnvelope(UsageEventSchema.array());
  const successApiKeyUsage = createSuccessEnvelope(ApiKeyUsageSummarySchema);
  const successReport = createSuccessEnvelope(
    z
      .object({
        accepted: z.literal(true),
        duplicate: z.boolean()
      })
      .strict()
  );

  return {
    openapi: "3.0.3",
    info: {
      title: "Clime Registry API",
      version: "1.0.0"
    },
    paths: {
      "/v1/search": {
        post: {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToJsonSchema(SearchRequestSchema, { target: "openApi3" })
              }
            }
          },
          responses: {
            200: {
              description: "Search results",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successSearch, { target: "openApi3" })
                }
              }
            },
            400: {
              description: "Error",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(ErrorEnvelopeSchema, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/clis": {
        get: {
          parameters: [
            {
              in: "query",
              name: "view",
              required: false,
              schema: {
                type: "string",
                enum: ["summary"]
              },
              description: "Set to `summary` for a lightweight list optimized for browse views."
            }
          ],
          responses: {
            200: {
              description: "CLI list",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [
                      zodToJsonSchema(successProfiles, { target: "openApi3" }),
                      zodToJsonSchema(successCliSummaries, { target: "openApi3" })
                    ]
                  }
                }
              }
            }
          }
        }
      },
      "/v1/clis/{slug}": {
        get: {
          responses: {
            200: {
              description: "CLI profile",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successProfile, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/clis/{slug}/install": {
        get: {
          responses: {
            200: {
              description: "Install instructions",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successInstall, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/clis/{slug}/commands": {
        get: {
          responses: {
            200: {
              description: "CLI commands",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successCommands, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/clis/{slug}/auth": {
        get: {
          responses: {
            200: {
              description: "CLI auth guide",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successAuth, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/workflows": {
        get: {
          responses: {
            200: {
              description: "Workflow list",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successWorkflows, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/workflows/{id}": {
        get: {
          responses: {
            200: {
              description: "Workflow detail",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successWorkflow, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/workflows/search": {
        post: {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToJsonSchema(WorkflowSearchRequestSchema, {
                  target: "openApi3"
                })
              }
            }
          },
          responses: {
            200: {
              description: "Workflow search",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successWorkflows, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/rankings": {
        get: {
          responses: {
            200: {
              description: "Rankings",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successRanking, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/unmet-requests": {
        get: {
          responses: {
            200: {
              description: "Unmet request list",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successUnmetRequests, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/submissions": {
        get: {
          responses: {
            200: {
              description: "Submission list",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(
                    createSuccessEnvelope(CommunitySubmissionSchema.array()),
                    { target: "openApi3" }
                  )
                }
              }
            }
          }
        },
        post: {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToJsonSchema(SubmissionRequestSchema, { target: "openApi3" })
              }
            }
          },
          responses: {
            200: {
              description: "Submission created",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successSubmission, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/submissions/{id}/review": {
        post: {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToJsonSchema(SubmissionReviewRequestSchema, {
                  target: "openApi3"
                })
              }
            }
          },
          responses: {
            200: {
              description: "Submission moderation result",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successSubmission, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/publishers/claim": {
        post: {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToJsonSchema(PublisherClaimRequestSchema, { target: "openApi3" })
              }
            }
          },
          responses: {
            200: {
              description: "Publisher claim created",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successPublisherClaim, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/publishers/claim/{id}/review": {
        post: {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToJsonSchema(PublisherClaimReviewRequestSchema, {
                  target: "openApi3"
                })
              }
            }
          },
          responses: {
            200: {
              description: "Publisher claim moderation result",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(
                    createSuccessEnvelope(
                      z.object({
                        claim: PublisherClaimSchema,
                        verified: z.boolean()
                      })
                    ),
                    { target: "openApi3" }
                  )
                }
              }
            }
          }
        }
      },
      "/v1/publishers/claim/{id}/verify": {
        post: {
          responses: {
            200: {
              description: "Publisher claim verification result",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(
                    createSuccessEnvelope(
                      z.object({
                        claim: PublisherClaimSchema,
                        verified: z.boolean()
                      })
                    ),
                    { target: "openApi3" }
                  )
                }
              }
            }
          }
        }
      },
      "/v1/publishers/claims": {
        get: {
          responses: {
            200: {
              description: "Publisher claim list",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successPublisherClaims, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/publishers/analytics": {
        get: {
          responses: {
            200: {
              description: "Publisher analytics summary",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successPublisherAnalytics, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/publishers/analytics/{id}": {
        get: {
          responses: {
            200: {
              description: "Publisher analytics detail",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successPublisherAnalyticsSingle, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/changes/feed": {
        get: {
          responses: {
            200: {
              description: "Change feed",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successChanges, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/usage": {
        get: {
          responses: {
            200: {
              description: "Recent usage events",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successUsage, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/usage/by-key": {
        get: {
          responses: {
            200: {
              description: "Usage summary for an API key",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successApiKeyUsage, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/clis/{slug}/report": {
        post: {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToJsonSchema(ReportPayloadSchema, { target: "openApi3" })
              }
            }
          },
          responses: {
            200: {
              description: "Report accepted",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successReport, { target: "openApi3" })
                }
              }
            }
          }
        }
      },
      "/v1/publishers/listings/{slug}/update": {
        post: {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToJsonSchema(PublisherListingUpdateRequestSchema, {
                  target: "openApi3"
                })
              }
            }
          },
          responses: {
            200: {
              description: "Publisher listing update applied",
              content: {
                "application/json": {
                  schema: zodToJsonSchema(successProfile, { target: "openApi3" })
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        Error: zodToJsonSchema(ApiErrorSchema, { target: "openApi3" })
      }
    }
  };
}
