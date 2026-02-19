import type { CliProfile, WorkflowChain } from "@cli-me/shared-types";

const VECTOR_DIMENSION = 384;

const SYNONYM_MAP: Record<string, string[]> = {
  deploy: ["ship", "release", "publish", "host"],
  database: ["db", "postgres", "mysql", "sql"],
  payment: ["billing", "checkout", "invoice", "stripe"],
  email: ["mailer", "notification", "smtp", "resend"],
  auth: ["login", "oauth", "token", "credential"],
  workflow: ["pipeline", "flow", "sequence", "chain"],
  fullstack: ["full-stack", "saas", "backend", "frontend"],
  nextjs: ["next", "next.js", "react", "vercel"]
};

function tokenize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s.-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function expandTokens(tokens: string[]) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const synonyms = SYNONYM_MAP[token];
    if (!synonyms) {
      continue;
    }
    for (const synonym of synonyms) {
      expanded.add(synonym);
    }
  }
  return [...expanded];
}

function hashToken(token: string) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function trigrams(text: string) {
  const normalized = `  ${text.toLowerCase()}  `;
  const grams: string[] = [];
  for (let index = 0; index < normalized.length - 2; index += 1) {
    grams.push(normalized.slice(index, index + 3));
  }
  return grams;
}

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < VECTOR_DIMENSION; index += 1) {
    dot += a[index] * b[index];
    aNorm += a[index] ** 2;
    bNorm += b[index] ** 2;
  }

  if (aNorm === 0 || bNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export function embedText(text: string) {
  const vector = new Array<number>(VECTOR_DIMENSION).fill(0);
  const tokens = expandTokens(tokenize(text));

  for (const token of tokens) {
    const bucket = hashToken(token) % VECTOR_DIMENSION;
    vector[bucket] += 1;
  }

  for (const gram of trigrams(text)) {
    const bucket = hashToken(`g:${gram}`) % VECTOR_DIMENSION;
    vector[bucket] += 0.25;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
  if (magnitude > 0) {
    for (let index = 0; index < vector.length; index += 1) {
      vector[index] /= magnitude;
    }
  }

  return vector;
}

interface CliDocument {
  slug: string;
  vector: number[];
}

interface WorkflowDocument {
  slug: string;
  vector: number[];
  cliSlugs: string[];
}

export class SemanticSearchEngine {
  private readonly cliDocs: CliDocument[];
  private readonly workflowDocs: WorkflowDocument[];

  constructor(clis: CliProfile[], workflows: WorkflowChain[]) {
    this.cliDocs = clis.map((cli) => {
      const text = [
        cli.identity.name,
        cli.identity.slug,
        cli.identity.description,
        cli.identity.category_tags.join(" "),
        ...cli.commands.map((command) => `${command.command} ${command.description}`),
        cli.auth.auth_type,
        cli.auth.setup_steps.map((step) => step.instruction).join(" ")
      ].join(" ");

      return {
        slug: cli.identity.slug,
        vector: embedText(text)
      };
    });

    this.workflowDocs = workflows.map((workflow) => {
      const text = [
        workflow.title,
        workflow.slug,
        workflow.description,
        workflow.tags.join(" "),
        workflow.steps.map((step) => `${step.cli_slug} ${step.purpose}`).join(" ")
      ].join(" ");

      return {
        slug: workflow.slug,
        vector: embedText(text),
        cliSlugs: workflow.steps.map((step) => step.cli_slug)
      };
    });
  }

  scoreCli(query: string, cliSlug: string) {
    const queryVector = embedText(query);
    const cliDoc = this.cliDocs.find((doc) => doc.slug === cliSlug);
    if (!cliDoc) {
      return { semanticScore: 0, matchedWorkflows: [] as string[] };
    }

    const semanticScore = cosineSimilarity(queryVector, cliDoc.vector);
    const matchedWorkflows = this.workflowDocs
      .map((workflow) => ({
        slug: workflow.slug,
        score: workflow.cliSlugs.includes(cliSlug) ? cosineSimilarity(queryVector, workflow.vector) : 0
      }))
      .filter((workflow) => workflow.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((workflow) => workflow.slug);

    return { semanticScore, matchedWorkflows };
  }

  scoreWorkflow(query: string, workflowSlug: string) {
    const queryVector = embedText(query);
    const workflowDoc = this.workflowDocs.find((doc) => doc.slug === workflowSlug);
    if (!workflowDoc) {
      return { semanticScore: 0 };
    }

    return {
      semanticScore: cosineSimilarity(queryVector, workflowDoc.vector)
    };
  }
}
