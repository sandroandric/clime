import { nanoid } from 'nanoid';
import { createHash } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import {
  type ApiKeyCreateRequest,
  type ApiKeyCreateResponse,
  type ApiKeyUsageSummary,
  type ChangeFeedEvent,
  type CliSummary,
  type InstallInstruction,
  type ClaimVerificationMethod,
  type CommunitySubmission,
  type ListingVersion,
  type PublisherClaim,
  type PublisherClaimRequest,
  type PublisherClaimReviewRequest,
  type PublisherAnalytics,
  type RankingType,
  type ReportPayload,
  type SubmissionRequest,
  type SubmissionReviewRequest,
  type UnmetRequest,
  type UsageEvent,
  normalizeSha256Checksum,
} from '@cli-me/shared-types';
import { computeRanking } from './ranking.js';
import type { PersistenceAdapter } from './persistence.js';
import { SemanticSearchEngine } from './semantic.js';
import type { RegistryData } from './types.js';

function tokenize(input: string) {
  const stopWords = new Set([
    'a',
    'an',
    'the',
    'for',
    'with',
    'and',
    'or',
    'to',
    'as',
    'of',
    'in',
    'on',
    'at',
    'by',
    'from',
    'into',
    'using',
    'use',
    'app',
    'apps',
  ]);
  const shortAllow = new Set([
    'db',
    'ci',
    'cd',
    'ai',
    'ml',
    'os',
    'api',
    'sql',
    'dns',
    'aws',
    'gcp',
    'js',
  ]);

  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => {
      if (!token || stopWords.has(token)) {
        return false;
      }
      return token.length > 2 || shortAllow.has(token);
    });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const boundaryRegexCache = new Map<string, RegExp>();

function matchesIntentTerm(text: string, tokens: Set<string>, term: string) {
  const normalizedTerm = term.toLowerCase();
  const normalizedToken = normalizeToken(normalizedTerm);
  if (!normalizedToken) {
    return false;
  }

  if (tokens.has(normalizedToken)) {
    return true;
  }

  // Short tokens (for example "pr", "db", "ci") must match whole tokens only.
  if (normalizedToken.length <= 3) {
    return false;
  }

  let boundaryRegex = boundaryRegexCache.get(normalizedTerm);
  if (!boundaryRegex) {
    boundaryRegex = new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedTerm)}([^a-z0-9]|$)`);
    if (boundaryRegexCache.size < 200) {
      boundaryRegexCache.set(normalizedTerm, boundaryRegex);
    }
  }
  return boundaryRegex.test(text);
}

function hashApiKey(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeAgentName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'codex') {
    return 'codex-cli';
  }
  if (normalized === 'openclaw') {
    return 'opencode';
  }
  return normalized;
}

function canonicalPublisherName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'amazon web services' ||
    normalized === 'aws' ||
    normalized === 'aws amplify'
  ) {
    return 'Amazon Web Services';
  }
  if (normalized === 'redis labs' || normalized === 'redis') {
    return 'Redis';
  }
  if (normalized === 'microsoft' || normalized === 'microsoft azure') {
    return 'Microsoft Azure';
  }
  return value.trim();
}

function publisherSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function topMatchingCommands(cli: RegistryData['clis'][number], query: string, limit = 3) {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return cli.commands.slice(0, limit).map((command) => command.command);
  }

  return cli.commands
    .map((command) => {
      const haystack =
        `${command.command} ${command.description} ${command.workflow_context.join(' ')}`.toLowerCase();
      const lexical = terms.reduce((sum, term) => (haystack.includes(term) ? sum + 1 : sum), 0);
      return {
        command: command.command,
        score: lexical + (haystack.includes(cli.identity.slug) ? 0.1 : 0),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.command);
}

function installCommandPreview(cli: RegistryData['clis'][number]) {
  if (cli.install.length === 0) {
    return undefined;
  }

  const priority = [
    'brew',
    'apt',
    'dnf',
    'pacman',
    'npm',
    'pnpm',
    'yarn',
    'bun',
    'curl',
    'winget',
    'scoop',
    'choco',
  ];

  const scored = cli.install
    .map((instruction) => {
      const manager = instruction.package_manager.trim().toLowerCase();
      const managerScore = priority.indexOf(manager);
      const osScore = instruction.os === 'any' ? 0 : 1;
      return {
        instruction,
        rank: managerScore === -1 ? 99 : managerScore,
        osScore,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.osScore - b.osScore);

  return scored[0]?.instruction.command;
}

const CORE_AGENT_NAMES = [
  'claude-code',
  'codex-cli',
  'gemini-cli',
  'cline',
  'aider',
  'opencode',
] as const;

function statusFromRate(rate: number): 'verified' | 'partial' | 'failed' {
  if (rate >= 0.8) {
    return 'verified';
  }
  if (rate >= 0.5) {
    return 'partial';
  }
  return 'failed';
}

function hashFraction(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 10_000) / 10_000;
}

function estimateAgentCompatibility(
  cli: RegistryData['clis'][number],
  agentName: (typeof CORE_AGENT_NAMES)[number],
) {
  const authPenaltyByType: Record<typeof cli.auth.auth_type, number> = {
    none: 0,
    api_key: 0.04,
    config_file: 0.06,
    login_command: 0.08,
    oauth: 0.12,
  };

  const permissionPenalty =
    (cli.identity.permission_scope.includes('network') ? 0.03 : 0) +
    (cli.identity.permission_scope.includes('filesystem') ? 0.035 : 0) +
    (cli.identity.permission_scope.includes('credentials') ? 0.05 : 0) +
    (cli.identity.permission_scope.includes('docker-socket') ? 0.07 : 0) +
    (cli.identity.permission_scope.includes('kubeconfig') ? 0.06 : 0);

  const browserAuthPenalty =
    cli.auth.auth_type === 'oauth' || cli.auth.auth_type === 'login_command' ? 0.04 : 0;
  const complexityPenalty = Math.max(0, cli.commands.length - 8) * 0.004;
  const trustBoost = (cli.identity.trust_score - 75) / 220;
  const popularityBoost = Math.min(0.06, cli.identity.popularity_score / 1500);

  const agentOffset: Record<(typeof CORE_AGENT_NAMES)[number], number> = {
    'claude-code': 0.015,
    'codex-cli': 0.03,
    'gemini-cli': -0.01,
    cline: -0.045,
    aider: -0.03,
    opencode: -0.02,
  };

  const jitter = (hashFraction(`${cli.identity.slug}:${agentName}`) - 0.5) * 0.06;
  return clamp(
    0.86 +
      trustBoost +
      popularityBoost +
      agentOffset[agentName] +
      jitter -
      authPenaltyByType[cli.auth.auth_type] -
      permissionPenalty -
      browserAuthPenalty -
      complexityPenalty,
    0.38,
    0.98,
  );
}

function ensureCompatibilityCoverage(cli: RegistryData['clis'][number]) {
  const existing = new Map(
    cli.identity.compatibility.map((item) => [normalizeAgentName(item.agent_name), item] as const),
  );
  const nowIso = new Date().toISOString();

  cli.identity.compatibility = CORE_AGENT_NAMES.map((agentName) => {
    const current = existing.get(agentName);
    const estimate = estimateAgentCompatibility(cli, agentName);
    const hasMeasuredCompatibility = Boolean(current && current.status !== 'untested');
    const successRate = hasMeasuredCompatibility
      ? clamp((current?.success_rate ?? estimate) * 0.75 + estimate * 0.25, 0, 1)
      : estimate;

    return {
      agent_name: agentName,
      status: hasMeasuredCompatibility ? statusFromRate(successRate) : 'untested',
      success_rate: successRate,
      last_verified: current?.last_verified ?? nowIso,
    };
  });
}

const WORKFLOW_INTENT_TERMS: Record<string, string[]> = {
  deploy: ['deploy', 'release', 'launch', 'ship', 'production', 'hosting'],
  database: ['database', 'db', 'schema', 'migration', 'postgres', 'sql'],
  payments: ['payment', 'payments', 'billing', 'checkout', 'invoice', 'subscription'],
  auth: ['auth', 'authentication', 'identity', 'oauth', 'login'],
  monitoring: ['monitor', 'monitoring', 'observability', 'alerts', 'telemetry', 'error'],
  storage: ['storage', 'cdn', 'asset', 'object', 'bucket'],
};

const WORKFLOW_QUERY_INTENTS: Record<
  string,
  {
    terms: string[];
    categories: string[];
  }
> = {
  deploy: {
    terms: [
      'deploy',
      'deployment',
      'ship',
      'launch',
      'release',
      'host',
      'hosting',
      'static',
      'site',
      'nextjs',
    ],
    categories: ['deployment', 'hosting-infra'],
  },
  database: {
    terms: ['database', 'db', 'postgres', 'postgresql', 'sql', 'schema', 'migration', 'prisma'],
    categories: ['databases'],
  },
  payments: {
    terms: ['payment', 'payments', 'billing', 'checkout', 'stripe', 'invoice', 'subscription'],
    categories: ['payments'],
  },
  auth: {
    terms: ['auth', 'authentication', 'oauth', 'identity', 'login', 'user'],
    categories: ['auth'],
  },
  monitoring: {
    terms: ['monitoring', 'observability', 'alerts', 'error', 'telemetry', 'analytics', 'metrics'],
    categories: ['monitoring'],
  },
  storage: {
    terms: ['storage', 'cdn', 'object', 'bucket', 'asset', 'assets', 'cloudflare', 'minio'],
    categories: ['storage-cdn'],
  },
  infra: {
    terms: [
      'infra',
      'infrastructure',
      'iac',
      'terraform',
      'pulumi',
      'ansible',
      'helm',
      'kubernetes',
      'k8s',
      'kubectl',
      'container',
      'docker',
    ],
    categories: ['hosting-infra', 'additional'],
  },
  developer: {
    terms: ['developer', 'dev', 'tests', 'test', 'pr', 'pull', 'github', 'workflow', 'ci'],
    categories: ['dev-tooling'],
  },
};

const CANONICAL_INTENT_SLUGS: Record<string, string[]> = {
  deploy: ['vercel', 'netlify', 'fly', 'railway', 'render', 'amplify'],
  database: ['supabase', 'neon', 'planetscale', 'turso', 'prisma', 'psql', 'mysql', 'sqlite3'],
  payments: ['stripe'],
  auth: ['auth0'],
  monitoring: ['sentry-cli', 'datadog'],
  storage: ['cloudflare', 'minio'],
  infra: ['aws-cli', 'gcloud', 'az', 'docker', 'kubectl', 'terraform'],
  developer: ['gh', 'git', 'npm', 'pnpm', 'yarn', 'bun'],
};

function canonicalIntentAlignmentBoost(queryIntents: Set<string>, slug: string) {
  if (queryIntents.size === 0) {
    return 0;
  }
  const normalized = slug.toLowerCase();
  let matched = 0;
  for (const intent of queryIntents) {
    const canonical = CANONICAL_INTENT_SLUGS[intent];
    if (!canonical) {
      continue;
    }
    if (canonical.includes(normalized)) {
      matched += 1;
    }
  }
  if (matched === 0) {
    return 0;
  }
  return queryIntents.size >= 2 ? matched * 4.5 : matched * 2.4;
}

function expandWorkflowIntentTerms(input: string) {
  const terms = new Set(tokenize(input));
  for (const token of [...terms]) {
    for (const [intent, aliases] of Object.entries(WORKFLOW_INTENT_TERMS)) {
      if (token === intent || aliases.includes(token)) {
        terms.add(intent);
        for (const alias of aliases) {
          terms.add(alias);
        }
      }
    }
  }
  return terms;
}

function extractQueryIntents(query: string) {
  const lowerQuery = query.toLowerCase();
  const queryTokenSet = new Set(tokenize(lowerQuery));
  const intents = new Set<string>();

  for (const [intent, profile] of Object.entries(WORKFLOW_QUERY_INTENTS)) {
    if (profile.terms.some((term) => matchesIntentTerm(lowerQuery, queryTokenSet, term))) {
      intents.add(intent);
    }
  }

  if (/\bfull[-\s]?stack\b/.test(lowerQuery) || lowerQuery.includes('saas')) {
    intents.add('deploy');
    intents.add('database');
    intents.add('payments');
    intents.add('auth');
  }

  return intents;
}

function buildCliIntentAnalyzer(clis: RegistryData['clis']) {
  const cliTextBySlug = new Map<string, string>();
  const cliTokensBySlug = new Map<string, Set<string>>();
  for (const cli of clis) {
    const text = [
      cli.identity.name,
      cli.identity.slug,
      cli.identity.description,
      cli.identity.category_tags.join(' '),
      ...cli.commands.map(
        (command) =>
          `${command.command} ${command.description} ${command.workflow_context.join(' ')}`,
      ),
      ...cli.auth.environment_variables,
    ]
      .join(' ')
      .toLowerCase();
    cliTextBySlug.set(cli.identity.slug, text);
    cliTokensBySlug.set(cli.identity.slug, new Set(tokenize(text)));
  }

  return {
    matchesIntent(cli: RegistryData['clis'][number], intent: string) {
      const profile = WORKFLOW_QUERY_INTENTS[intent];
      if (!profile) {
        return false;
      }

      const cliText = cliTextBySlug.get(cli.identity.slug) ?? '';
      const cliTokens = cliTokensBySlug.get(cli.identity.slug) ?? new Set<string>();
      const tags = cli.identity.category_tags.map((tag) => tag.toLowerCase());
      const categoryMatch = profile.categories.some((category) =>
        tags.some((tag) => tag.includes(category) || category.includes(tag)),
      );
      const termMatch = profile.terms.some((term) => matchesIntentTerm(cliText, cliTokens, term));
      return categoryMatch || termMatch;
    },
  };
}

function workflowIntentCoverage(
  workflows: RegistryData['workflows'],
  clisBySlug: Map<string, RegistryData['clis'][number]>,
  _query: string,
  queryIntents: Set<string>,
) {
  if (queryIntents.size < 2) {
    return new Map<string, number>();
  }

  const analyzer = buildCliIntentAnalyzer([...clisBySlug.values()]);
  const boostByCli = new Map<string, number>();

  for (const workflow of workflows) {
    const workflowText =
      `${workflow.title} ${workflow.description} ${workflow.tags.join(' ')}`.toLowerCase();
    const workflowTokens = new Set(tokenize(workflowText));

    let matchedIntents = 0;
    for (const intent of queryIntents) {
      const profile = WORKFLOW_QUERY_INTENTS[intent];
      if (!profile) {
        continue;
      }

      const textMatch = profile.terms.some((term) =>
        matchesIntentTerm(workflowText, workflowTokens, term),
      );
      const stepMatch = workflow.steps.some((step) => {
        const cli = clisBySlug.get(step.cli_slug);
        return cli ? analyzer.matchesIntent(cli, intent) : false;
      });
      if (textMatch || stepMatch) {
        matchedIntents += 1;
      }
    }

    const minimumMatched = Math.max(2, Math.min(3, queryIntents.size));
    if (matchedIntents < minimumMatched) {
      continue;
    }

    const coverageRatio = matchedIntents / queryIntents.size;
    const chainStrength =
      coverageRatio * 1.8 +
      matchedIntents * 0.7 +
      (workflow.steps.length >= 4 ? 0.55 : 0) +
      (queryIntents.size >= 3 && matchedIntents >= 3 ? 0.9 : 0);

    workflow.steps.forEach((step, index) => {
      const stepWeight = Math.max(0.45, 1 - index * 0.09);
      const existing = boostByCli.get(step.cli_slug) ?? 0;
      const next = Math.max(existing, chainStrength * stepWeight);
      boostByCli.set(step.cli_slug, next);
    });
  }

  return boostByCli;
}

function enforceIntentCoverageRanking<T extends { cli: { slug: string }; score: number }>(
  entries: T[],
  queryIntents: Set<string>,
  intentAnalyzer: ReturnType<typeof buildCliIntentAnalyzer>,
  clisBySlug: Map<string, RegistryData['clis'][number]>,
  limit: number,
) {
  const top = entries.slice(0, limit);
  if (queryIntents.size < 2 || top.length === 0) {
    return top;
  }

  const coverageByIntent = (candidates: T[]) => {
    const covered = new Set<string>();
    for (const entry of candidates) {
      const cli = clisBySlug.get(entry.cli.slug);
      if (!cli) {
        continue;
      }
      for (const intent of queryIntents) {
        if (intentAnalyzer.matchesIntent(cli, intent)) {
          covered.add(intent);
        }
      }
    }
    return covered;
  };

  const matchedIntentsForEntry = (entry: T) => {
    const cli = clisBySlug.get(entry.cli.slug);
    if (!cli) {
      return [] as string[];
    }
    return [...queryIntents].filter((intent) => intentAnalyzer.matchesIntent(cli, intent));
  };

  const baselineCoverage = coverageByIntent(top);
  const missingIntents = [...queryIntents].filter((intent) => !baselineCoverage.has(intent));
  if (missingIntents.length === 0) {
    return top;
  }

  const intentBoostBySlug = new Map<string, number>();
  for (const intent of missingIntents) {
    const canonicalSet = new Set(CANONICAL_INTENT_SLUGS[intent] ?? []);
    const candidate =
      entries.find((entry) => {
        if (!canonicalSet.has(entry.cli.slug)) {
          return false;
        }
        const cli = clisBySlug.get(entry.cli.slug);
        return cli ? intentAnalyzer.matchesIntent(cli, intent) : false;
      }) ??
      entries.find((entry) => {
        const cli = clisBySlug.get(entry.cli.slug);
        return cli ? intentAnalyzer.matchesIntent(cli, intent) : false;
      });
    if (!candidate) {
      continue;
    }
    intentBoostBySlug.set(
      candidate.cli.slug,
      (intentBoostBySlug.get(candidate.cli.slug) ?? 0) + 4.5,
    );
  }

  const ranked = entries.slice().sort((a, b) => {
    const scoreA = a.score + (intentBoostBySlug.get(a.cli.slug) ?? 0);
    const scoreB = b.score + (intentBoostBySlug.get(b.cli.slug) ?? 0);
    return scoreB - scoreA;
  });

  const ensured = ranked.slice(0, limit);
  if (ensured.length === 0) {
    return ensured;
  }

  let covered = coverageByIntent(ensured);
  let missing = [...queryIntents].filter((intent) => !covered.has(intent));
  while (missing.length > 0) {
    let progressed = false;
    for (const intent of missing) {
      if (covered.has(intent)) {
        continue;
      }

      const candidate =
        ranked.find((entry) => {
          if (ensured.some((item) => item.cli.slug === entry.cli.slug)) {
            return false;
          }
          const canonicalSet = new Set(CANONICAL_INTENT_SLUGS[intent] ?? []);
          if (canonicalSet.size > 0 && !canonicalSet.has(entry.cli.slug)) {
            return false;
          }
          const cli = clisBySlug.get(entry.cli.slug);
          return cli ? intentAnalyzer.matchesIntent(cli, intent) : false;
        }) ??
        ranked.find((entry) => {
          if (ensured.some((item) => item.cli.slug === entry.cli.slug)) {
            return false;
          }
          const cli = clisBySlug.get(entry.cli.slug);
          return cli ? intentAnalyzer.matchesIntent(cli, intent) : false;
        });
      if (!candidate) {
        continue;
      }

      const coverageCounts = new Map<string, number>();
      for (const current of ensured) {
        for (const matchedIntent of matchedIntentsForEntry(current)) {
          coverageCounts.set(matchedIntent, (coverageCounts.get(matchedIntent) ?? 0) + 1);
        }
      }

      let replaceIndex = ensured.length - 1;
      for (let index = ensured.length - 1; index >= 0; index -= 1) {
        const canReplace = matchedIntentsForEntry(ensured[index]).every(
          (matchedIntent) =>
            matchedIntent === intent || (coverageCounts.get(matchedIntent) ?? 0) > 1,
        );
        if (canReplace) {
          replaceIndex = index;
          break;
        }
      }

      ensured[replaceIndex] = candidate;
      ensured.sort((a, b) => b.score - a.score);
      covered = coverageByIntent(ensured);
      progressed = true;
    }

    if (!progressed) {
      break;
    }
    missing = [...queryIntents].filter((intent) => !covered.has(intent));
  }

  return ensured;
}

function infrastructureIntentBoost(
  query: string,
  queryIntents: Set<string>,
  cli: RegistryData['clis'][number],
) {
  if (!queryIntents.has('infra')) {
    return 0;
  }

  const lowerQuery = query.toLowerCase();
  const mentionsIac = lowerQuery.includes('infrastructure as code') || lowerQuery.includes('iac');
  if (!mentionsIac) {
    return 0;
  }

  const categoryTags = cli.identity.category_tags.map((tag) => tag.toLowerCase());
  const categoryBoost = categoryTags.some(
    (tag) => tag.includes('iac') || tag.includes('infrastructure'),
  )
    ? 1.6
    : 0;

  const slugBoost =
    cli.identity.slug === 'terraform'
      ? 2.8
      : cli.identity.slug === 'pulumi'
        ? 1.9
        : cli.identity.slug === 'ansible'
          ? 1.4
          : 0;

  return categoryBoost + slugBoost;
}

function directCliMentionBoost(queryTokens: Set<string>, slug: string) {
  const normalizedSlug = slug.toLowerCase();
  const compactSlug = normalizedSlug.replace(/[^a-z0-9]/g, '');
  const slugParts = normalizedSlug.split(/[^a-z0-9]+/).filter(Boolean);
  const candidates = new Set<string>([normalizedSlug, compactSlug, ...slugParts]);

  const strippedCli = normalizedSlug.replace(/-?cli$/, '');
  if (strippedCli && strippedCli.length >= 3) {
    candidates.add(strippedCli);
  }

  for (const candidate of candidates) {
    if (candidate.length >= 3 && queryTokens.has(candidate)) {
      return SHARED_RANKING_CONFIG.directMentionBoost;
    }
  }

  return 0;
}

type IntentScoreConfig = {
  matchedWeight: number;
  coverageWeight: number;
  multiIntentBonus: number;
  noIntentPenalty: number;
  partialIntentPenalty: number;
  singleIntentPenalty: number;
  noCoverageMultiIntentPenalty?: number;
};

type SharedRankingConfig = {
  trustScoreDivisor: number;
  directMentionBoost: number;
};

type SearchRankingConfig = {
  workflowMatchWeight: number;
  lexicalWeight: number;
  semanticWeight: number;
  semanticThresholdNoLexicalIntent: number;
  semanticThresholdDefault: number;
  chainSignalThreshold: number;
  infraSignalThreshold: number;
  noIntentMinimumRelevance: number;
  defaultMinimumRelevance: number;
  multiIntentMinimumRelevance: number;
  scoreFloor: number;
  multiIntentReasonChainThreshold: number;
  strongSemanticReasonThreshold: number;
  weakEvidenceAutoIndexedPenalty: number;
  shortSlugNoisePenalty: number;
};

type DiscoverRankingConfig = {
  semanticCandidateMultiplier: number;
  semanticCandidateMinimum: number;
  semanticMatchCutoff: number;
  chainSignalThreshold: number;
  infraSignalThreshold: number;
  semanticScoreWeight: number;
  multiIntentReasonChainThreshold: number;
  strongSemanticReasonThreshold: number;
  semanticLowConfidenceCutoff: number;
  lexicalFallbackMultiplier: number;
  weakEvidenceAutoIndexedPenalty: number;
  shortSlugNoisePenalty: number;
};

const SHARED_RANKING_CONFIG: SharedRankingConfig = {
  trustScoreDivisor: 100,
  directMentionBoost: 3.2,
};

const SEARCH_INTENT_SCORE_CONFIG: IntentScoreConfig = {
  matchedWeight: 1.2,
  coverageWeight: 2.4,
  multiIntentBonus: 1.5,
  noIntentPenalty: 2.8,
  partialIntentPenalty: 0.85,
  singleIntentPenalty: 1.2,
  noCoverageMultiIntentPenalty: 1.1,
};

const DISCOVER_INTENT_SCORE_CONFIG: IntentScoreConfig = {
  matchedWeight: 1.1,
  coverageWeight: 2.1,
  multiIntentBonus: 1.3,
  noIntentPenalty: 3.2,
  partialIntentPenalty: 1.6,
  singleIntentPenalty: 1.2,
};

const SEARCH_RANKING_CONFIG: SearchRankingConfig = {
  workflowMatchWeight: 0.8,
  lexicalWeight: 1.2,
  semanticWeight: 3.0,
  semanticThresholdNoLexicalIntent: 0.45,
  semanticThresholdDefault: 0.24,
  chainSignalThreshold: 0.75,
  infraSignalThreshold: 0.4,
  noIntentMinimumRelevance: 1.05,
  defaultMinimumRelevance: 0.75,
  multiIntentMinimumRelevance: 0.2,
  scoreFloor: 0.2,
  multiIntentReasonChainThreshold: 1.8,
  strongSemanticReasonThreshold: 0.35,
  weakEvidenceAutoIndexedPenalty: 1.25,
  shortSlugNoisePenalty: 0.5,
};

const DISCOVER_RANKING_CONFIG: DiscoverRankingConfig = {
  semanticCandidateMultiplier: 2,
  semanticCandidateMinimum: 15,
  semanticMatchCutoff: 0.16,
  chainSignalThreshold: 0.2,
  infraSignalThreshold: 0.2,
  semanticScoreWeight: 8,
  multiIntentReasonChainThreshold: 2,
  strongSemanticReasonThreshold: 0.35,
  semanticLowConfidenceCutoff: 0.24,
  lexicalFallbackMultiplier: 2,
  weakEvidenceAutoIndexedPenalty: 1.25,
  shortSlugNoisePenalty: 0.5,
};

function computeIntentScore(
  queryIntents: Set<string>,
  matchedCliIntents: number,
  config: IntentScoreConfig,
) {
  const queryIntentCount = queryIntents.size;
  const intentCoverage = queryIntentCount > 0 ? matchedCliIntents / queryIntentCount : 0;
  const queryBreadthPenalty =
    queryIntentCount >= 3 && matchedCliIntents === 0
      ? (config.noCoverageMultiIntentPenalty ?? 0)
      : 0;
  const missingIntentPenalty =
    queryIntentCount >= 2 && matchedCliIntents === 0
      ? config.noIntentPenalty
      : queryIntentCount >= 3 && matchedCliIntents === 1
        ? config.partialIntentPenalty
        : queryIntentCount >= 1 && matchedCliIntents === 0
          ? config.singleIntentPenalty
          : 0;
  const intentBoost =
    matchedCliIntents * config.matchedWeight +
    intentCoverage * config.coverageWeight +
    (queryIntentCount >= 2 && matchedCliIntents >= 2 ? config.multiIntentBonus : 0) -
    queryBreadthPenalty;

  return {
    intentCoverage,
    missingIntentPenalty,
    intentBoost,
  };
}

export class RegistryStore {
  private readonly data: RegistryData;
  private readonly persistence?: PersistenceAdapter;
  private semantic: SemanticSearchEngine;
  private readonly processedRequests = new Set<string>();
  private readonly issuedApiKeys = new Map<string, { owner_type: string; owner_id?: string }>();

  private constructor(seed: RegistryData, persistence?: PersistenceAdapter) {
    this.data = seed;
    this.persistence = persistence;
    for (const claim of this.data.publisherClaims) {
      claim.publisher_name = canonicalPublisherName(claim.publisher_name);
    }

    this.enforceClaimGatedVerificationStatuses();

    for (const cli of this.data.clis) {
      cli.identity.publisher = canonicalPublisherName(cli.identity.publisher);
      cli.install = cli.install.map((instruction) => ({
        ...instruction,
        checksum: normalizeSha256Checksum(instruction.checksum),
      }));
      ensureCompatibilityCoverage(cli);
    }
    this.semantic = new SemanticSearchEngine(this.data.clis, this.data.workflows);
    for (const report of this.data.reports) {
      this.processedRequests.add(report.request_id);
    }
  }

  private enforceClaimGatedVerificationStatuses() {
    const approvedByCliSlug = new Map<string, Set<string>>();
    for (const claim of this.data.publisherClaims) {
      if (claim.status !== 'approved') {
        continue;
      }
      const publisher = canonicalPublisherName(claim.publisher_name);
      const bucket = approvedByCliSlug.get(claim.cli_slug) ?? new Set<string>();
      bucket.add(publisher);
      approvedByCliSlug.set(claim.cli_slug, bucket);
    }

    for (const cli of this.data.clis) {
      cli.identity.publisher = canonicalPublisherName(cli.identity.publisher);
      if (cli.identity.verification_status !== 'publisher-verified') {
        continue;
      }

      const approvedPublishers = approvedByCliSlug.get(cli.identity.slug);
      const isClaimVerified =
        approvedPublishers?.has(canonicalPublisherName(cli.identity.publisher)) ?? false;
      if (isClaimVerified) {
        continue;
      }

      // Publisher verification is claim-based only; downgrade seeded/unclaimed statuses.
      cli.identity.verification_status = 'community-curated';
      cli.identity.trust_score = Math.min(cli.identity.trust_score, 84);
    }
  }

  static async create(seed: RegistryData, persistence?: PersistenceAdapter) {
    const source = persistence ? await persistence.loadOrSeed(seed) : seed;
    return new RegistryStore(source, persistence);
  }

  listClis() {
    return this.data.clis;
  }

  listCliSummaries(): CliSummary[] {
    return this.data.clis.map((cli) => {
      const compatibilityScore =
        cli.identity.compatibility.length === 0
          ? 0
          : cli.identity.compatibility.reduce((sum, item) => sum + item.success_rate, 0) /
            cli.identity.compatibility.length;

      return {
        slug: cli.identity.slug,
        name: cli.identity.name,
        publisher: cli.identity.publisher,
        description: cli.identity.description,
        verification_status: cli.identity.verification_status,
        latest_version: cli.identity.latest_version,
        last_updated: cli.identity.last_updated,
        popularity_score: cli.identity.popularity_score,
        trust_score: cli.identity.trust_score,
        category_tags: cli.identity.category_tags,
        compatibility_score: compatibilityScore,
        auth_type: cli.auth.auth_type,
        install_methods: [
          ...new Set(cli.install.map((instruction) => instruction.package_manager)),
        ],
        command_signals: cli.commands.slice(0, 12).map((command) => command.command),
      };
    });
  }

  listSubmissions() {
    return this.data.submissions.slice(0, 200);
  }

  getCli(slug: string) {
    return this.data.clis.find((cli) => cli.identity.slug === slug);
  }

  async searchClis(query: string, limit: number) {
    const terms = tokenize(query);
    const termSet = new Set(terms);
    const queryIntents = extractQueryIntents(query);
    const clisBySlug = new Map(this.data.clis.map((cli) => [cli.identity.slug, cli] as const));
    const intentAnalyzer = buildCliIntentAnalyzer(this.data.clis);
    const workflowBoostByCli = workflowIntentCoverage(
      this.data.workflows,
      clisBySlug,
      query,
      queryIntents,
    );

    const ranked = this.data.clis
      .map((cli) => {
        const haystack = [
          cli.identity.name,
          cli.identity.slug,
          cli.identity.description,
          ...cli.identity.category_tags,
          ...cli.commands.map((command) => `${command.command} ${command.description}`),
        ]
          .join(' ')
          .toLowerCase();

        const lexical = terms.reduce((sum, term) => (haystack.includes(term) ? sum + 1 : sum), 0);
        const semantic = this.semantic.scoreCli(query, cli.identity.slug);

        const workflowMatches = Array.from(
          new Set([
            ...semantic.matchedWorkflows,
            ...this.data.workflows
              .filter((workflow) => {
                if (!workflow.steps.some((step) => step.cli_slug === cli.identity.slug)) {
                  return false;
                }
                const workflowText =
                  `${workflow.title} ${workflow.description} ${workflow.tags.join(' ')}`.toLowerCase();
                return terms.some((term) => workflowText.includes(term));
              })
              .map((workflow) => workflow.slug),
          ]),
        );

        const workflowBoost = workflowMatches.length * SEARCH_RANKING_CONFIG.workflowMatchWeight;
        const trustBoost = cli.identity.trust_score / SHARED_RANKING_CONFIG.trustScoreDivisor;
        const compatibilityBoost =
          cli.identity.compatibility.reduce((sum, item) => sum + item.success_rate, 0) /
          Math.max(1, cli.identity.compatibility.length);
        const matchedCliIntents =
          queryIntents.size > 0
            ? [...queryIntents].filter((intent) => intentAnalyzer.matchesIntent(cli, intent)).length
            : 0;
        const { missingIntentPenalty, intentBoost } = computeIntentScore(
          queryIntents,
          matchedCliIntents,
          SEARCH_INTENT_SCORE_CONFIG,
        );
        const chainBoost = workflowBoostByCli.get(cli.identity.slug) ?? 0;
        const infraBoost = infrastructureIntentBoost(query, queryIntents, cli);
        const mentionBoost = directCliMentionBoost(termSet, cli.identity.slug);
        const canonicalBoost = canonicalIntentAlignmentBoost(queryIntents, cli.identity.slug);
        const isWeakEvidenceAutoIndexed =
          cli.identity.verification_status === 'auto-indexed' &&
          matchedCliIntents === 0 &&
          canonicalBoost === 0 &&
          mentionBoost === 0 &&
          chainBoost <= SEARCH_RANKING_CONFIG.chainSignalThreshold &&
          infraBoost <= SEARCH_RANKING_CONFIG.infraSignalThreshold &&
          semantic.semanticScore < SEARCH_RANKING_CONFIG.strongSemanticReasonThreshold;
        const shortSlugPenalty =
          isWeakEvidenceAutoIndexed && cli.identity.slug.length <= 3
            ? SEARCH_RANKING_CONFIG.shortSlugNoisePenalty
            : 0;
        const autoIndexedPenalty = isWeakEvidenceAutoIndexed
          ? SEARCH_RANKING_CONFIG.weakEvidenceAutoIndexedPenalty
          : 0;
        const suppressShortSlugNoise =
          queryIntents.size > 0 &&
          cli.identity.verification_status === 'auto-indexed' &&
          cli.identity.slug.length <= 2 &&
          mentionBoost === 0 &&
          canonicalBoost === 0;

        // Require a stronger semantic signal when no lexical or intent evidence exists.
        // This avoids random/vector-noise matches for truly unknown queries.
        const semanticSignalThreshold =
          queryIntents.size === 0 && lexical === 0
            ? SEARCH_RANKING_CONFIG.semanticThresholdNoLexicalIntent
            : SEARCH_RANKING_CONFIG.semanticThresholdDefault;
        const hasRelevanceSignal =
          !suppressShortSlugNoise &&
          (lexical > 0 ||
            semantic.semanticScore >= semanticSignalThreshold ||
            matchedCliIntents > 0 ||
            mentionBoost > 0 ||
            canonicalBoost > 0 ||
            chainBoost > SEARCH_RANKING_CONFIG.chainSignalThreshold ||
            infraBoost > SEARCH_RANKING_CONFIG.infraSignalThreshold);

        const relevanceScore =
          lexical * SEARCH_RANKING_CONFIG.lexicalWeight +
          semantic.semanticScore * SEARCH_RANKING_CONFIG.semanticWeight +
          workflowBoost +
          intentBoost +
          canonicalBoost +
          infraBoost +
          mentionBoost +
          chainBoost -
          autoIndexedPenalty -
          shortSlugPenalty -
          missingIntentPenalty;
        const minimumRelevance =
          queryIntents.size === 0
            ? SEARCH_RANKING_CONFIG.noIntentMinimumRelevance
            : SEARCH_RANKING_CONFIG.defaultMinimumRelevance;
        const intentAwareMinimumRelevance =
          queryIntents.size >= 3 && matchedCliIntents > 0
            ? SEARCH_RANKING_CONFIG.multiIntentMinimumRelevance
            : minimumRelevance;

        const score = relevanceScore + (hasRelevanceSignal ? trustBoost + compatibilityBoost : 0);

        const multiIntentReason =
          queryIntents.size >= 2 &&
          (chainBoost > SEARCH_RANKING_CONFIG.multiIntentReasonChainThreshold ||
            matchedCliIntents >= 2)
            ? 'Strong multi-intent workflow coverage match'
            : null;

        return {
          cli: cli.identity,
          score,
          hasRelevanceSignal,
          relevanceScore,
          minimumRelevance,
          intentAwareMinimumRelevance,
          reason:
            multiIntentReason ??
            (canonicalBoost > 0 ? 'Canonical CLI selected for detected task intent' : null) ??
            (semantic.semanticScore >= SEARCH_RANKING_CONFIG.strongSemanticReasonThreshold
              ? 'Strong semantic and workflow similarity match'
              : lexical > 0
                ? 'Matched tags/description and command contexts'
                : 'Recommended by trust and compatibility'),
          install_command: installCommandPreview(cli),
          matched_workflows: workflowMatches,
          top_matching_commands: topMatchingCommands(cli, query),
        };
      })
      .filter(
        (result) =>
          result.hasRelevanceSignal &&
          result.relevanceScore >= result.intentAwareMinimumRelevance &&
          result.score > SEARCH_RANKING_CONFIG.scoreFloor,
      )
      .map(
        ({
          hasRelevanceSignal: _hasRelevanceSignal,
          relevanceScore: _relevanceScore,
          minimumRelevance: _minimumRelevance,
          intentAwareMinimumRelevance: _intentAwareMinimumRelevance,
          ...result
        }) => result,
      )
      .sort((a, b) => b.score - a.score);

    const scored = enforceIntentCoverageRanking(
      ranked,
      queryIntents,
      intentAnalyzer,
      clisBySlug,
      limit,
    );

    if (scored.length === 0) {
      await this.recordUnmetRequest(query);
    }

    return scored;
  }

  async discoverClis(query: string, limit: number) {
    if (!this.persistence) {
      return this.searchClis(query, limit);
    }

    const queryIntents = extractQueryIntents(query);
    const queryTokens = new Set(tokenize(query));
    const clisBySlug = new Map(this.data.clis.map((cli) => [cli.identity.slug, cli] as const));
    const intentAnalyzer = buildCliIntentAnalyzer(this.data.clis);
    const workflowBoostByCli = workflowIntentCoverage(
      this.data.workflows,
      clisBySlug,
      query,
      queryIntents,
    );

    const semanticMatches = await this.persistence.semanticDiscover(
      query,
      Math.max(
        limit * DISCOVER_RANKING_CONFIG.semanticCandidateMultiplier,
        DISCOVER_RANKING_CONFIG.semanticCandidateMinimum,
      ),
    );
    const topSimilarity = semanticMatches[0]?.similarity ?? 0;

    if (
      semanticMatches.length === 0 ||
      topSimilarity < DISCOVER_RANKING_CONFIG.semanticMatchCutoff
    ) {
      return this.searchClis(query, limit);
    }

    const bySlug = new Map(this.data.clis.map((cli) => [cli.identity.slug, cli] as const));

    const semanticResults = semanticMatches
      .map((match) => {
        const cli = bySlug.get(match.cli_slug);
        if (!cli) {
          return null;
        }

        const matchedCliIntents =
          queryIntents.size > 0
            ? [...queryIntents].filter((intent) => intentAnalyzer.matchesIntent(cli, intent)).length
            : 0;
        const { missingIntentPenalty, intentBoost } = computeIntentScore(
          queryIntents,
          matchedCliIntents,
          DISCOVER_INTENT_SCORE_CONFIG,
        );
        const chainBoost = workflowBoostByCli.get(cli.identity.slug) ?? 0;
        const infraBoost = infrastructureIntentBoost(query, queryIntents, cli);
        const mentionBoost = directCliMentionBoost(queryTokens, cli.identity.slug);
        const canonicalBoost = canonicalIntentAlignmentBoost(queryIntents, cli.identity.slug);
        const isWeakEvidenceAutoIndexed =
          cli.identity.verification_status === 'auto-indexed' &&
          matchedCliIntents === 0 &&
          canonicalBoost === 0 &&
          mentionBoost === 0 &&
          chainBoost <= DISCOVER_RANKING_CONFIG.chainSignalThreshold &&
          infraBoost <= DISCOVER_RANKING_CONFIG.infraSignalThreshold &&
          match.similarity < DISCOVER_RANKING_CONFIG.strongSemanticReasonThreshold;
        const shortSlugPenalty =
          isWeakEvidenceAutoIndexed && cli.identity.slug.length <= 3
            ? DISCOVER_RANKING_CONFIG.shortSlugNoisePenalty
            : 0;
        const autoIndexedPenalty = isWeakEvidenceAutoIndexed
          ? DISCOVER_RANKING_CONFIG.weakEvidenceAutoIndexedPenalty
          : 0;
        const suppressShortSlugNoise =
          queryIntents.size > 0 &&
          cli.identity.verification_status === 'auto-indexed' &&
          cli.identity.slug.length <= 2 &&
          mentionBoost === 0 &&
          canonicalBoost === 0;
        const hasRelevanceSignal =
          !suppressShortSlugNoise &&
          (match.similarity >= DISCOVER_RANKING_CONFIG.semanticMatchCutoff ||
            matchedCliIntents > 0 ||
            canonicalBoost > 0 ||
            chainBoost > DISCOVER_RANKING_CONFIG.chainSignalThreshold ||
            infraBoost > DISCOVER_RANKING_CONFIG.infraSignalThreshold ||
            mentionBoost > 0);

        return {
          cli: cli.identity,
          score:
            match.similarity * DISCOVER_RANKING_CONFIG.semanticScoreWeight +
            (hasRelevanceSignal
              ? cli.identity.trust_score / SHARED_RANKING_CONFIG.trustScoreDivisor
              : 0) +
            intentBoost +
            canonicalBoost +
            infraBoost +
            mentionBoost +
            chainBoost -
            autoIndexedPenalty -
            shortSlugPenalty -
            missingIntentPenalty,
          reason:
            queryIntents.size >= 2 &&
            (workflowBoostByCli.get(cli.identity.slug) ?? 0) >
              DISCOVER_RANKING_CONFIG.multiIntentReasonChainThreshold
              ? 'Embedding and multi-intent workflow coverage match'
              : match.similarity >= DISCOVER_RANKING_CONFIG.strongSemanticReasonThreshold
                ? 'Embedding similarity match'
                : 'Semantic fallback match',
          install_command: installCommandPreview(cli),
          hasRelevanceSignal,
          matched_workflows: this.data.workflows
            .filter((workflow) =>
              workflow.steps.some((step) => step.cli_slug === cli.identity.slug),
            )
            .slice(0, 4)
            .map((workflow) => workflow.slug),
          top_matching_commands:
            match.top_commands.length > 0
              ? match.top_commands.slice(0, 3)
              : topMatchingCommands(cli, query),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .filter((entry) => entry.hasRelevanceSignal)
      .map(({ hasRelevanceSignal: _hasRelevanceSignal, ...entry }) => entry)
      .sort((a, b) => b.score - a.score);

    const lowConfidence =
      topSimilarity < DISCOVER_RANKING_CONFIG.semanticLowConfidenceCutoff ||
      semanticResults.length < limit;
    if (!lowConfidence) {
      return enforceIntentCoverageRanking(
        semanticResults,
        queryIntents,
        intentAnalyzer,
        clisBySlug,
        limit,
      );
    }

    const lexical = await this.searchClis(
      query,
      limit * DISCOVER_RANKING_CONFIG.lexicalFallbackMultiplier,
    );
    const merged = [...semanticResults];
    for (const entry of lexical) {
      if (merged.some((candidate) => candidate.cli.slug === entry.cli.slug)) {
        continue;
      }
      merged.push(entry);
    }

    return enforceIntentCoverageRanking(
      merged.sort((a, b) => b.score - a.score),
      queryIntents,
      intentAnalyzer,
      clisBySlug,
      limit,
    );
  }

  getInstallInstructions(slug: string, os?: string, packageManager?: string) {
    const cli = this.getCli(slug);
    if (!cli) {
      return null;
    }

    const filteredByOs = os
      ? cli.install.filter((item) => item.os === os || item.os === 'any')
      : cli.install;

    const filteredByManager = packageManager
      ? filteredByOs.filter((item) => item.package_manager === packageManager)
      : filteredByOs;

    return filteredByManager.length > 0 ? filteredByManager : filteredByOs;
  }

  async persistResolvedInstallChecksums(slug: string, instructions: InstallInstruction[]) {
    const cli = this.getCli(slug);
    if (!cli) {
      return;
    }

    const updates = instructions
      .map((instruction) => ({
        ...instruction,
        checksum: normalizeSha256Checksum(instruction.checksum),
      }))
      .filter((instruction): instruction is InstallInstruction & { checksum: string } =>
        Boolean(instruction.checksum),
      );

    if (updates.length === 0) {
      return;
    }

    for (const update of updates) {
      const existing = cli.install.find(
        (instruction) =>
          instruction.os === update.os &&
          instruction.package_manager === update.package_manager &&
          instruction.command === update.command,
      );
      if (!existing) {
        continue;
      }
      if (existing.checksum === update.checksum) {
        continue;
      }
      existing.checksum = update.checksum;
      if (this.persistence) {
        await this.persistence.updateInstallChecksum(
          cli.identity.slug,
          existing.os,
          existing.package_manager,
          existing.command,
          update.checksum,
        );
      }
    }
  }

  getCommands(slug: string, workflow?: string) {
    const cli = this.getCli(slug);
    if (!cli) {
      return null;
    }

    if (!workflow) {
      return cli.commands;
    }

    const normalizedWorkflow = workflow.trim().toLowerCase();
    const exact = cli.commands.filter((command) =>
      command.workflow_context.some((context) => context.toLowerCase() === normalizedWorkflow),
    );
    if (exact.length > 0) {
      return exact;
    }

    const intentTerms = expandWorkflowIntentTerms(normalizedWorkflow);
    return cli.commands.filter((command) =>
      command.workflow_context.some((context) => {
        const normalizedContext = context.toLowerCase();
        if (
          normalizedContext.includes(normalizedWorkflow) ||
          normalizedWorkflow.includes(normalizedContext)
        ) {
          return true;
        }
        for (const term of intentTerms) {
          if (normalizedContext.includes(term)) {
            return true;
          }
        }
        return false;
      }),
    );
  }

  getAuthGuide(slug: string) {
    return this.getCli(slug)?.auth ?? null;
  }

  listWorkflows() {
    return this.data.workflows;
  }

  getWorkflow(idOrSlug: string) {
    return this.data.workflows.find(
      (workflow) => workflow.id === idOrSlug || workflow.slug === idOrSlug,
    );
  }

  searchWorkflows(query: string, limit: number) {
    const terms = tokenize(query);
    const queryIntents = extractQueryIntents(query);

    return this.data.workflows
      .map((workflow) => {
        const text =
          `${workflow.title} ${workflow.description} ${workflow.tags.join(' ')} ${workflow.steps
            .map((step) => `${step.cli_slug} ${step.purpose}`)
            .join(' ')}`.toLowerCase();
        const lexical = terms.reduce((sum, term) => (text.includes(term) ? sum + 1 : sum), 0);
        const semantic = this.semantic.scoreWorkflow(query, workflow.slug).semanticScore;

        const workflowCategories = new Set(
          workflow.steps
            .map((step) => this.getCli(step.cli_slug)?.identity.category_tags[0])
            .filter((category): category is string => Boolean(category)),
        );

        let matchedIntents = 0;
        for (const intent of queryIntents) {
          const profile = WORKFLOW_QUERY_INTENTS[intent];
          if (!profile) {
            continue;
          }

          const textMatch = profile.terms.some((term) => text.includes(term));
          const categoryMatch = profile.categories.some((category) =>
            workflowCategories.has(category),
          );

          if (textMatch || categoryMatch) {
            matchedIntents += 1;
          }
        }

        const coverageRatio = queryIntents.size > 0 ? matchedIntents / queryIntents.size : 0;
        const coverageBoost = matchedIntents * 3.5 + coverageRatio * 4;
        const coveragePenalty = Math.max(0, queryIntents.size - matchedIntents) * 2.5;
        const breadthBoost = queryIntents.size >= 3 && matchedIntents >= 3 ? 5 : 0;
        const stepBoost = Math.min(2, workflow.steps.length * 0.2);

        const score =
          lexical * 1.2 + semantic * 4 + coverageBoost + breadthBoost + stepBoost - coveragePenalty;

        return { workflow, score };
      })
      .filter((item) => item.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.workflow);
  }

  async getRanking(type: RankingType) {
    const snapshot = computeRanking(
      type,
      this.data.clis,
      this.data.reports,
      this.data.unmetRequests,
    );

    const change: ChangeFeedEvent = {
      id: `chg_${nanoid(10)}`,
      kind: 'ranking_generated',
      entity_id: type,
      occurred_at: snapshot.generated_at,
      payload: {
        type,
        entry_count: snapshot.entries.length,
      },
    };

    if (this.persistence) {
      await this.persistence.persistRanking(snapshot, change);
    }

    this.data.rankings = this.data.rankings.filter((entry) => entry.type !== type);
    this.data.rankings.push(snapshot);
    this.data.changes.unshift(change);

    return snapshot;
  }

  async addSubmission(payload: SubmissionRequest): Promise<CommunitySubmission> {
    const submission: CommunitySubmission = {
      id: `sub_${nanoid(10)}`,
      type: payload.type,
      submitter: payload.submitter,
      target_cli_slug: payload.target_cli_slug,
      content: payload.content,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    const change: ChangeFeedEvent = {
      id: `chg_${nanoid(10)}`,
      kind: 'submission_created',
      entity_id: submission.id,
      occurred_at: submission.created_at,
      payload: {
        status: submission.status,
        type: submission.type,
      },
    };

    if (this.persistence) {
      await this.persistence.persistSubmission(submission, change);
    }

    this.data.submissions.unshift(submission);
    this.data.changes.unshift(change);

    return submission;
  }

  async reviewSubmission(
    submissionId: string,
    payload: SubmissionReviewRequest,
  ): Promise<CommunitySubmission | null> {
    const submission = this.data.submissions.find((entry) => entry.id === submissionId);
    if (!submission) {
      return null;
    }

    const reviewedAt = new Date().toISOString();
    submission.status = payload.status;
    submission.reviewed_at = reviewedAt;
    submission.reviewer = payload.reviewer?.trim() || undefined;
    submission.review_notes = payload.review_notes?.trim() || undefined;

    const change: ChangeFeedEvent = {
      id: `chg_${nanoid(10)}`,
      kind: payload.status === 'approved' ? 'submission_approved' : 'submission_rejected',
      entity_id: submission.id,
      occurred_at: reviewedAt,
      payload: {
        type: submission.type,
        reviewer: submission.reviewer ?? 'admin',
      },
    };

    if (this.persistence) {
      await this.persistence.persistSubmission(submission, change);
    }

    this.data.changes.unshift(change);
    return submission;
  }

  async createPublisherClaim(payload: PublisherClaimRequest): Promise<PublisherClaim> {
    const verificationMethod: ClaimVerificationMethod = payload.verification_method ?? 'dns_txt';
    const verificationToken = `clime-verify=${nanoid(32)}`;
    const verificationInstructions =
      verificationMethod === 'repo_file'
        ? `Create .well-known/clime-verify.txt in ${payload.repository_url ?? 'your repository'} with value: ${verificationToken}`
        : `Create DNS TXT record _clime-verify.${payload.domain} with value: ${verificationToken}`;

    const claim: PublisherClaim = {
      id: `claim_${nanoid(10)}`,
      cli_slug: payload.cli_slug,
      publisher_name: payload.publisher_name,
      domain: payload.domain,
      evidence: payload.evidence,
      verification_method: verificationMethod,
      verification_token: verificationToken,
      verification_instructions: verificationInstructions,
      repository_url: payload.repository_url,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    const change: ChangeFeedEvent = {
      id: `chg_${nanoid(10)}`,
      kind: 'submission_created',
      entity_id: claim.id,
      occurred_at: claim.created_at,
      payload: {
        type: 'publisher_claim',
        cli_slug: claim.cli_slug,
        verification_method: claim.verification_method,
      },
    };

    const persistedClaim = this.persistence
      ? await this.persistence.persistPublisherClaim(claim, change)
      : claim;

    this.data.publisherClaims.unshift(persistedClaim);
    this.data.changes.unshift({
      ...change,
      entity_id: persistedClaim.id,
      occurred_at: persistedClaim.created_at,
    });

    return persistedClaim;
  }

  listPublisherClaims() {
    return this.data.publisherClaims;
  }

  async verifyPublisherClaim(claimId: string) {
    const claim = this.data.publisherClaims.find((entry) => entry.id === claimId);
    if (!claim) {
      return null;
    }

    const token = claim.verification_token ?? '';
    let verified = false;

    if (claim.verification_method === 'repo_file') {
      verified = await this.verifyRepoToken(claim.repository_url, token);
    } else {
      verified = await this.verifyDnsToken(claim.domain, token);
    }

    return this.applyPublisherClaimReview(claim, verified ? 'approved' : 'rejected', {
      source: 'verification',
    });
  }

  async reviewPublisherClaim(claimId: string, payload: PublisherClaimReviewRequest) {
    const claim = this.data.publisherClaims.find((entry) => entry.id === claimId);
    if (!claim) {
      return null;
    }

    return this.applyPublisherClaimReview(claim, payload.status, {
      reviewer: payload.reviewer?.trim() || undefined,
      reviewNotes: payload.review_notes?.trim() || undefined,
      source: 'manual',
    });
  }

  async updateListingByPublisher(payload: {
    cli_slug: string;
    publisher_name: string;
    requester_api_key?: string;
    requester_is_admin?: boolean;
    description?: string;
    auth?: NonNullable<RegistryData['clis'][number]['auth']>;
    commands?: RegistryData['clis'][number]['commands'];
    install?: RegistryData['clis'][number]['install'];
  }) {
    const cli = this.getCli(payload.cli_slug);
    if (!cli) {
      return null;
    }

    const canonicalPublisher = canonicalPublisherName(payload.publisher_name);
    const approved = this.data.publisherClaims.find(
      (claim) =>
        claim.cli_slug === payload.cli_slug &&
        canonicalPublisherName(claim.publisher_name) === canonicalPublisher &&
        claim.status === 'approved',
    );
    if (!approved) {
      return { ok: false as const, reason: 'PUBLISHER_NOT_VERIFIED' };
    }

    if (!payload.requester_is_admin) {
      if (!payload.requester_api_key) {
        return { ok: false as const, reason: 'PUBLISHER_KEY_REQUIRED' };
      }

      const owner = await this.apiKeyOwner(payload.requester_api_key);
      if (!owner || owner.owner_type !== 'publisher') {
        return { ok: false as const, reason: 'PUBLISHER_KEY_REQUIRED' };
      }

      const ownerPublisher = owner.owner_id ? canonicalPublisherName(owner.owner_id) : '';
      if (!ownerPublisher || ownerPublisher !== canonicalPublisher) {
        return { ok: false as const, reason: 'PUBLISHER_KEY_MISMATCH' };
      }
    }

    if (payload.description) {
      cli.identity.description = payload.description;
    }
    if (payload.auth) {
      cli.auth = payload.auth;
    }
    if (payload.commands && payload.commands.length > 0) {
      cli.commands = payload.commands;
    }
    if (payload.install && payload.install.length > 0) {
      cli.install = payload.install.map((instruction) => ({
        ...instruction,
        checksum: normalizeSha256Checksum(instruction.checksum),
      }));
    }
    cli.identity.last_updated = new Date().toISOString();
    cli.identity.publisher = canonicalPublisher;

    if (this.persistence) {
      await this.persistence.updateCliProfile(cli);
    }

    const change: ChangeFeedEvent = {
      id: `chg_${nanoid(10)}`,
      kind: 'listing_updated',
      entity_id: cli.identity.slug,
      occurred_at: cli.identity.last_updated,
      payload: {
        source: 'publisher',
        publisher: payload.publisher_name,
      },
    };
    this.data.changes.unshift(change);

    return { ok: true as const, cli };
  }

  async recordUsage(event: Omit<UsageEvent, 'id' | 'created_at'>) {
    const rawApiKey = event.api_key;
    const usageEvent: UsageEvent = {
      id: `use_${nanoid(10)}`,
      created_at: new Date().toISOString(),
      ...event,
      api_key: hashApiKey(rawApiKey),
    };

    if (this.persistence) {
      await this.persistence.persistUsage({
        ...usageEvent,
        api_key: rawApiKey,
      });
    }

    this.data.usageEvents.push(usageEvent);
    if (this.data.usageEvents.length > 5000) {
      this.data.usageEvents.splice(0, this.data.usageEvents.length - 5000);
    }
  }

  usageSummary() {
    return this.data.usageEvents.slice(0, 100);
  }

  publisherAnalytics(publisher?: string): PublisherAnalytics[] {
    const clisBySlug = new Map(this.data.clis.map((cli) => [cli.identity.slug, cli] as const));
    const byPublisher = new Map<
      string,
      {
        publisher: string;
        publisher_slug: string;
        cli_slugs: Set<string>;
        search_impressions: number;
        install_attempts: number;
        command_requests: number;
        report_count: number;
        report_failures: number;
        success_reports: number;
        last_event_at?: string;
        query_counts: Map<string, number>;
        cli_counts: Map<string, number>;
      }
    >();

    const ensurePublisher = (name: string) => {
      const canonical = canonicalPublisherName(name);
      const existing = byPublisher.get(canonical);
      if (existing) {
        return existing;
      }

      const created = {
        publisher: canonical,
        publisher_slug: publisherSlug(canonical),
        cli_slugs: new Set<string>(),
        search_impressions: 0,
        install_attempts: 0,
        command_requests: 0,
        report_count: 0,
        report_failures: 0,
        success_reports: 0,
        last_event_at: undefined as string | undefined,
        query_counts: new Map<string, number>(),
        cli_counts: new Map<string, number>(),
      };
      byPublisher.set(canonical, created);
      return created;
    };

    const bumpLastSeen = (entry: { last_event_at?: string }, timestamp?: string) => {
      if (!timestamp) {
        return;
      }
      if (!entry.last_event_at || Date.parse(timestamp) > Date.parse(entry.last_event_at)) {
        entry.last_event_at = timestamp;
      }
    };

    for (const cli of this.data.clis) {
      const entry = ensurePublisher(cli.identity.publisher);
      entry.cli_slugs.add(cli.identity.slug);
    }

    for (const event of this.data.usageEvents) {
      const endpoint = event.endpoint.toLowerCase();
      const impactedByResult = new Map<string, number>();
      const resultSlugs = Array.isArray(event.metadata?.result_slugs)
        ? event.metadata?.result_slugs.map((item) => String(item))
        : [];

      if (endpoint.includes('/search') || endpoint.includes('/discover')) {
        for (const slug of resultSlugs) {
          const cli = clisBySlug.get(slug);
          if (!cli) {
            continue;
          }
          const key = canonicalPublisherName(cli.identity.publisher);
          impactedByResult.set(key, (impactedByResult.get(key) ?? 0) + 1);
        }
      }

      for (const [publisherName, impressions] of impactedByResult.entries()) {
        const entry = ensurePublisher(publisherName);
        entry.search_impressions += impressions;
        if (event.query?.trim()) {
          const query = event.query.trim().toLowerCase();
          entry.query_counts.set(query, (entry.query_counts.get(query) ?? 0) + 1);
        }
        bumpLastSeen(entry, event.created_at);
      }

      if (event.cli_slug) {
        const cli = clisBySlug.get(event.cli_slug);
        if (!cli) {
          continue;
        }
        const entry = ensurePublisher(cli.identity.publisher);
        entry.cli_counts.set(event.cli_slug, (entry.cli_counts.get(event.cli_slug) ?? 0) + 1);

        if (endpoint.includes('/install')) {
          entry.install_attempts += 1;
        }
        if (endpoint.includes('/commands')) {
          entry.command_requests += 1;
        }
        bumpLastSeen(entry, event.created_at);
      }
    }

    for (const report of this.data.reports) {
      const cli = clisBySlug.get(report.cli_slug);
      if (!cli) {
        continue;
      }
      const entry = ensurePublisher(cli.identity.publisher);
      entry.report_count += 1;
      if (report.status === 'fail') {
        entry.report_failures += 1;
      } else {
        entry.success_reports += 1;
      }
      entry.cli_counts.set(report.cli_slug, (entry.cli_counts.get(report.cli_slug) ?? 0) + 1);
      bumpLastSeen(entry, report.timestamp);
    }

    const rows = [...byPublisher.values()]
      .map((entry) => ({
        publisher: entry.publisher,
        publisher_slug: entry.publisher_slug,
        cli_count: entry.cli_slugs.size,
        search_impressions: entry.search_impressions,
        install_attempts: entry.install_attempts,
        command_requests: entry.command_requests,
        report_count: entry.report_count,
        report_failures: entry.report_failures,
        success_reports: entry.success_reports,
        last_event_at: entry.last_event_at,
        top_queries: [...entry.query_counts.entries()]
          .map(([query, count]) => ({ query, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        top_clis: [...entry.cli_counts.entries()]
          .map(([cli_slug, count]) => ({ cli_slug, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
      }))
      .sort((a, b) => {
        if (b.search_impressions !== a.search_impressions) {
          return b.search_impressions - a.search_impressions;
        }
        if (b.install_attempts !== a.install_attempts) {
          return b.install_attempts - a.install_attempts;
        }
        return a.publisher.localeCompare(b.publisher);
      });

    if (!publisher) {
      return rows;
    }

    const target = publisher.trim().toLowerCase();
    return rows.filter(
      (entry) =>
        entry.publisher.toLowerCase() === target || entry.publisher_slug.toLowerCase() === target,
    );
  }

  async createApiKey(payload: ApiKeyCreateRequest): Promise<ApiKeyCreateResponse> {
    if (this.persistence) {
      return this.persistence.createApiKey(payload);
    }

    const apiKey = `clime_${nanoid(28)}`;
    this.issuedApiKeys.set(apiKey, {
      owner_type: payload.owner_type,
      owner_id: payload.owner_id,
    });

    return {
      api_key: apiKey,
      key_id: `key_${nanoid(10)}`,
      owner_type: payload.owner_type,
      owner_id: payload.owner_id,
      created_at: new Date().toISOString(),
    };
  }

  async apiKeyOwner(apiKey: string): Promise<{ owner_type: string; owner_id?: string } | null> {
    if (this.persistence) {
      return this.persistence.apiKeyOwner(apiKey);
    }
    return this.issuedApiKeys.get(apiKey) ?? null;
  }

  async usageSummaryByApiKey(apiKey: string): Promise<ApiKeyUsageSummary> {
    if (this.persistence) {
      return this.persistence.apiKeyUsageSummary(apiKey);
    }

    const hashed = hashApiKey(apiKey);
    const scoped = this.data.usageEvents.filter((event) => event.api_key === hashed);
    const endpoints = new Map<string, number>();
    const clis = new Map<string, number>();
    const queries = new Map<string, number>();

    for (const event of scoped) {
      endpoints.set(event.endpoint, (endpoints.get(event.endpoint) ?? 0) + 1);
      if (event.cli_slug) {
        clis.set(event.cli_slug, (clis.get(event.cli_slug) ?? 0) + 1);
      }
      if (event.query) {
        const normalized = event.query.toLowerCase();
        queries.set(normalized, (queries.get(normalized) ?? 0) + 1);
      }
    }

    const lastSeen = scoped.length > 0 ? scoped[0]?.created_at : undefined;
    return {
      api_key_hash: hashed,
      total_requests: scoped.length,
      endpoints: [...endpoints.entries()]
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      top_clis: [...clis.entries()]
        .map(([cli_slug, count]) => ({ cli_slug, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      top_queries: [...queries.entries()]
        .map(([query, count]) => ({ query, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      last_seen: lastSeen,
    };
  }

  async addReport(report: ReportPayload) {
    if (this.processedRequests.has(report.request_id)) {
      return { accepted: true as const, duplicate: true as const };
    }

    if (this.persistence) {
      const inserted = await this.persistence.persistReport(report);
      if (!inserted) {
        this.processedRequests.add(report.request_id);
        return { accepted: true as const, duplicate: true as const };
      }
    }

    const cli = this.getCli(report.cli_slug);
    if (!cli) {
      this.processedRequests.add(report.request_id);
      this.data.reports.unshift(report);
      return { accepted: true as const, duplicate: false as const };
    }

    const nextCli = structuredClone(cli);
    this.recomputeSignals(nextCli, report);

    const existingVersion = this.data.listingVersions.find(
      (version) => version.cli_slug === report.cli_slug,
    );
    const versionNumber = (existingVersion?.version_number ?? 0) + 1;
    const listingVersion: ListingVersion = {
      id: `lv_${report.cli_slug}_${versionNumber}`,
      cli_slug: report.cli_slug,
      version_number: versionNumber,
      changed_fields: ['trust_score', 'compatibility'],
      changelog: `Telemetry update from ${report.agent_name}`,
      updated_at: report.timestamp,
    };

    const change: ChangeFeedEvent = {
      id: `chg_${nanoid(10)}`,
      kind: 'listing_updated',
      entity_id: report.cli_slug,
      occurred_at: report.timestamp,
      payload: {
        version_number: versionNumber,
        source: 'report',
      },
    };

    if (this.persistence) {
      await this.persistence.persistCliTelemetry(nextCli, listingVersion, change);
    }

    this.processedRequests.add(report.request_id);
    this.data.reports.unshift(report);

    cli.identity = nextCli.identity;
    cli.listing_version = listingVersion;

    this.data.listingVersions = this.data.listingVersions.filter(
      (version) => version.cli_slug !== report.cli_slug,
    );
    this.data.listingVersions.push(listingVersion);
    this.data.changes.unshift(change);

    return { accepted: true as const, duplicate: false as const };
  }

  getChangeFeed(since?: string): ChangeFeedEvent[] {
    if (!since) {
      return this.data.changes.slice(0, 100);
    }

    const sinceValue = new Date(since).getTime();
    return this.data.changes
      .filter((event) => new Date(event.occurred_at).getTime() > sinceValue)
      .slice(0, 100);
  }

  listUnmetRequests(limit = 100): UnmetRequest[] {
    const normalizedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(500, Math.floor(limit)))
      : 100;

    return this.data.unmetRequests
      .slice()
      .sort((a, b) => b.count - a.count || Date.parse(b.last_seen) - Date.parse(a.last_seen))
      .slice(0, normalizedLimit);
  }

  private async recordUnmetRequest(query: string) {
    const existing = this.data.unmetRequests.find(
      (item) => item.query.toLowerCase() === query.toLowerCase(),
    );
    if (existing) {
      const next: UnmetRequest = {
        ...existing,
        count: existing.count + 1,
        last_seen: new Date().toISOString(),
      };
      if (this.persistence) {
        next.id = await this.persistence.persistUnmetRequest(next);
      }
      existing.count = next.count;
      existing.last_seen = next.last_seen;
      existing.id = next.id;
      return;
    }

    const next: UnmetRequest = {
      id: `unmet_${nanoid(8)}`,
      query,
      count: 1,
      last_seen: new Date().toISOString(),
    };

    if (this.persistence) {
      next.id = await this.persistence.persistUnmetRequest(next);
    }

    this.data.unmetRequests.unshift(next);
  }

  private async verifyDnsToken(domain: string, token: string) {
    if (!domain || !token) {
      return false;
    }

    try {
      const records = await resolveTxt(`_clime-verify.${domain}`);
      return records.some((entry) => entry.join('').trim() === token);
    } catch {
      return false;
    }
  }

  private async applyPublisherClaimReview(
    claim: PublisherClaim,
    status: 'approved' | 'rejected',
    context: {
      reviewer?: string;
      reviewNotes?: string;
      source: 'verification' | 'manual';
    },
  ) {
    const reviewedAt = new Date().toISOString();
    claim.status = status;
    claim.verified_at = status === 'approved' ? reviewedAt : undefined;

    const cli = this.getCli(claim.cli_slug);
    if (cli) {
      if (status === 'approved') {
        cli.identity.verification_status = 'publisher-verified';
        cli.identity.publisher = canonicalPublisherName(claim.publisher_name);
        cli.identity.last_verified = reviewedAt;
        cli.identity.last_updated = reviewedAt;
      } else {
        const hasOtherApprovedClaims = this.data.publisherClaims.some(
          (candidate) =>
            candidate.id !== claim.id &&
            candidate.cli_slug === claim.cli_slug &&
            canonicalPublisherName(candidate.publisher_name) ===
              canonicalPublisherName(claim.publisher_name) &&
            candidate.status === 'approved',
        );
        if (!hasOtherApprovedClaims) {
          cli.identity.verification_status = 'community-curated';
          cli.identity.trust_score = Math.min(cli.identity.trust_score, 84);
          cli.identity.last_updated = reviewedAt;
        }
      }

      if (this.persistence) {
        await this.persistence.updateCliProfile(cli);
      }
    }

    if (this.persistence) {
      await this.persistence.updatePublisherClaim(claim);
    }

    const change: ChangeFeedEvent = {
      id: `chg_${nanoid(10)}`,
      kind: status === 'approved' ? 'submission_approved' : 'submission_rejected',
      entity_id: claim.id,
      occurred_at: reviewedAt,
      payload: {
        type: 'publisher_claim',
        cli_slug: claim.cli_slug,
        publisher: claim.publisher_name,
        source: context.source,
        reviewer: context.reviewer ?? 'admin',
        review_notes: context.reviewNotes,
      },
    };
    this.data.changes.unshift(change);

    return {
      claim,
      verified: status === 'approved',
    };
  }

  private async verifyRepoToken(repositoryUrl: string | undefined, token: string) {
    if (!repositoryUrl || !token) {
      return false;
    }

    try {
      const url = new URL(repositoryUrl);
      if (!url.hostname.includes('github.com')) {
        return false;
      }

      const segments = url.pathname
        .replace(/\.git$/i, '')
        .split('/')
        .filter(Boolean);
      if (segments.length < 2) {
        return false;
      }

      const [owner, repo] = segments;
      const raw = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/.well-known/clime-verify.txt`;
      const response = await fetch(raw);
      if (!response.ok) {
        return false;
      }
      const body = await response.text();
      return body.trim() === token;
    } catch {
      return false;
    }
  }

  private recomputeSignals(
    nextCli: NonNullable<ReturnType<RegistryStore['getCli']>>,
    report: ReportPayload,
  ) {
    const historical = this.data.reports.filter((item) => item.cli_slug === report.cli_slug);
    const combined = [...historical, report];
    const successCount = combined.filter((item) => item.status === 'success').length;
    const failCount = combined.length - successCount;
    const total = combined.length;

    const empiricalRate = (successCount + 1) / (total + 2);
    const volumeConfidence = clamp(Math.log10(total + 1) / 2, 0, 1);
    const verificationBase =
      nextCli.identity.verification_status === 'publisher-verified'
        ? 1
        : nextCli.identity.verification_status === 'community-curated'
          ? 0.75
          : 0.55;
    const ageDays = Math.max(
      0,
      (Date.now() - Date.parse(report.timestamp)) / (1000 * 60 * 60 * 24),
    );
    const freshness = clamp(Math.exp(-ageDays / 30), 0, 1);

    nextCli.identity.trust_score = clamp(
      (verificationBase * 0.25 + empiricalRate * 0.5 + volumeConfidence * 0.15 + freshness * 0.1) *
        100,
      0,
      100,
    );

    nextCli.identity.popularity_score = clamp(
      nextCli.identity.popularity_score * 0.85 + successCount * 1.5 + failCount * 0.2 + total * 0.1,
      0,
      1000,
    );

    const byAgent = new Map<string, { success: number; total: number; lastVerified: string }>();
    for (const item of combined) {
      const agentName = normalizeAgentName(item.agent_name);
      const bucket = byAgent.get(agentName) ?? {
        success: 0,
        total: 0,
        lastVerified: item.timestamp,
      };

      bucket.total += 1;
      if (item.status === 'success') {
        bucket.success += 1;
      }
      if (Date.parse(item.timestamp) >= Date.parse(bucket.lastVerified)) {
        bucket.lastVerified = item.timestamp;
      }
      byAgent.set(agentName, bucket);
    }

    const existingCompatibility = new Map(
      nextCli.identity.compatibility.map(
        (item) => [normalizeAgentName(item.agent_name), item] as const,
      ),
    );
    const mergedCompatibility = new Map(existingCompatibility);

    for (const [agentName, bucket] of byAgent.entries()) {
      const baseline = existingCompatibility.get(agentName);
      const empiricalRate = (bucket.success + 1) / (bucket.total + 2);
      const successRate = baseline
        ? clamp(empiricalRate * 0.7 + baseline.success_rate * 0.3, 0, 1)
        : empiricalRate;
      const status = successRate >= 0.9 ? 'verified' : successRate >= 0.7 ? 'partial' : 'failed';
      mergedCompatibility.set(agentName, {
        agent_name: agentName,
        status,
        success_rate: successRate,
        last_verified: bucket.lastVerified,
      });
    }

    nextCli.identity.compatibility = Array.from(mergedCompatibility.values()).sort((a, b) =>
      a.agent_name.localeCompare(b.agent_name),
    );
    ensureCompatibilityCoverage(nextCli);
  }
}
