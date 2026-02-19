import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliIdentitySchema } from "@cli-me/shared-types";

interface NpmSearchResult {
  package: {
    name: string;
    description: string;
    links: {
      npm?: string;
      repository?: string;
      homepage?: string;
    };
    version: string;
  };
}

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(THIS_DIR, "../../..");

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchNpmCliPackages(size: number) {
  const url = `https://registry.npmjs.org/-/v1/search?text=keywords:cli&size=${size}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch npm index: ${response.status}`);
  }

  const json = (await response.json()) as { objects?: NpmSearchResult[] };
  if (!json || !Array.isArray(json.objects)) {
    throw new Error(`Unexpected NPM response structure`);
  }
  return json.objects.map((item) => item.package);
}

export async function run() {
  const raw = await fetchNpmCliPackages(120);

  const indexed = raw
    .map((pkg) => {
      const slug = slugify(pkg.name.replace(/^@/, "").replace("/", "-"));

      return {
        slug,
        name: pkg.name,
        publisher: pkg.name.startsWith("@") ? pkg.name.split("/")[0] : "community",
        description: pkg.description || "CLI package",
        category_tags: ["auto-indexed", "cli"],
        website: pkg.links.homepage ?? pkg.links.npm ?? "https://www.npmjs.com",
        repository: pkg.links.repository ?? pkg.links.npm ?? "https://www.npmjs.com",
        verification_status: "auto-indexed" as const,
        latest_version: pkg.version,
        last_updated: new Date().toISOString(),
        popularity_score: 10,
        trust_score: 20,
        permission_scope: [],
        compatibility: []
      };
    })
    .filter((entry) => CliIdentitySchema.safeParse(entry).success);

  const outputPath = resolve(ROOT_DIR, "infra/generated/indexer-output.json");
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: "npm-search",
        count: indexed.length,
        records: indexed
      },
      null,
      2
    )
  );

  console.log(`Indexed ${indexed.length} CLI candidates -> ${outputPath}`);
}

const isEntrypoint =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isEntrypoint) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
