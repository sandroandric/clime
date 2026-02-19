import { createHash } from "node:crypto";
import {
  normalizeSha256Checksum,
  type InstallInstruction
} from "@cli-me/shared-types";

interface InstallChecksumResolverOptions {
  cacheTtlSeconds?: number;
  maxCacheEntries?: number;
  requestTimeoutMs?: number;
  maxDownloadBytes?: number;
}

interface CacheEntry {
  checksum?: string;
  expiresAt: number;
}

interface TimedCacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface BrewFormulaIndexEntry {
  name: string;
  full_name?: string;
  aliases?: string[];
  oldnames?: string[];
}

interface BrewCaskIndexEntry {
  token: string;
  full_token?: string;
  old_tokens?: string[];
}

const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 12;
const DEFAULT_MAX_CACHE_ENTRIES = 2000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;
const BREW_FORMULA_INDEX_URL = "https://formulae.brew.sh/api/formula.json";
const BREW_CASK_INDEX_URL = "https://formulae.brew.sh/api/cask.json";

const REQUEST_HEADERS = {
  "user-agent": "clime-checksum-resolver/1.0",
  accept: "application/json"
};

const NPM_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);

function splitCommandSegments(command: string) {
  return command
    .split(/&&|\|\||;/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function toTokens(segment: string) {
  return segment
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parsePackageSpecifier(raw: string): { packageName: string; version?: string } | null {
  const value = raw.replace(/^['"]|['"]$/g, "");
  if (!value) {
    return null;
  }
  if (
    value.includes("://") ||
    value.startsWith("git+") ||
    value.startsWith("file:") ||
    value.startsWith("./") ||
    value.startsWith("../")
  ) {
    return null;
  }

  if (value.startsWith("@")) {
    const slashIndex = value.indexOf("/");
    const versionSeparator = value.lastIndexOf("@");
    if (slashIndex === -1) {
      return null;
    }
    if (versionSeparator > slashIndex) {
      const packageName = value.slice(0, versionSeparator);
      const version = value.slice(versionSeparator + 1);
      return packageName ? { packageName, version: version || undefined } : null;
    }
    return { packageName: value };
  }

  const versionSeparator = value.lastIndexOf("@");
  if (versionSeparator > 0) {
    const packageName = value.slice(0, versionSeparator);
    const version = value.slice(versionSeparator + 1);
    return packageName ? { packageName, version: version || undefined } : null;
  }

  return { packageName: value };
}

function normalizeBrewToken(value: string) {
  return value.replace(/^['"]|['"]$/g, "").trim().toLowerCase();
}

function parseVersionSegments(value: string) {
  const [, version] = value.split("@");
  if (!version) {
    return [];
  }
  return version
    .split(".")
    .map((segment) => Number(segment))
    .filter((segment) => Number.isFinite(segment));
}

function compareVersionedNamesDescending(a: string, b: string) {
  const aSegments = parseVersionSegments(a);
  const bSegments = parseVersionSegments(b);
  const maxLength = Math.max(aSegments.length, bSegments.length);
  for (let index = 0; index < maxLength; index += 1) {
    const left = aSegments[index] ?? 0;
    const right = bSegments[index] ?? 0;
    if (left !== right) {
      return right - left;
    }
  }
  return 0;
}

export class InstallChecksumResolver {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly requestTimeoutMs: number;
  private readonly maxDownloadBytes: number;
  private formulaIndexCache?: TimedCacheEntry<BrewFormulaIndexEntry[]>;
  private caskIndexCache?: TimedCacheEntry<BrewCaskIndexEntry[]>;

  constructor(options: InstallChecksumResolverOptions = {}) {
    this.cacheTtlMs = Math.max(
      60_000,
      Number(options.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS) * 1000
    );
    this.maxCacheEntries = Math.max(100, Number(options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES));
    this.requestTimeoutMs = Math.max(1500, Number(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS));
    this.maxDownloadBytes = Math.max(
      1_000_000,
      Number(options.maxDownloadBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES)
    );
  }

  async enrichInstallInstructions(
    slug: string,
    instructions: InstallInstruction[]
  ): Promise<InstallInstruction[]> {
    const resolved: InstallInstruction[] = [];
    for (const instruction of instructions) {
      const checksum = await this.resolveChecksum(slug, instruction);
      resolved.push({
        ...instruction,
        checksum
      });
    }
    return resolved;
  }

  private buildCacheKey(slug: string, instruction: InstallInstruction) {
    return [
      slug,
      instruction.os,
      instruction.package_manager.toLowerCase(),
      instruction.command.trim().toLowerCase()
    ].join("::");
  }

  private getCache(cacheKey: string) {
    const existing = this.cache.get(cacheKey);
    if (!existing) {
      return undefined;
    }
    if (Date.now() >= existing.expiresAt) {
      this.cache.delete(cacheKey);
      return undefined;
    }
    return existing.checksum;
  }

  private setCache(cacheKey: string, checksum?: string) {
    if (!this.cache.has(cacheKey) && this.cache.size >= this.maxCacheEntries) {
      const firstKey = this.cache.keys().next().value;
      if (typeof firstKey === "string") {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(cacheKey, {
      checksum,
      expiresAt: Date.now() + this.cacheTtlMs
    });
  }

  private async resolveChecksum(slug: string, instruction: InstallInstruction) {
    const existing = normalizeSha256Checksum(instruction.checksum);
    if (existing) {
      return existing;
    }

    const cacheKey = this.buildCacheKey(slug, instruction);
    const cached = this.getCache(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    let resolved: string | undefined;
    for (const segment of splitCommandSegments(instruction.command)) {
      resolved =
        (await this.resolveBrewChecksum(segment)) ??
        (await this.resolveNpmChecksum(segment)) ??
        (await this.resolvePipChecksum(segment)) ??
        (await this.resolveCargoChecksum(segment));
      if (resolved) {
        break;
      }
    }

    this.setCache(cacheKey, resolved);
    return resolved;
  }

  private async resolveBrewChecksum(segment: string) {
    const tokens = toTokens(segment);
    if (tokens[0] !== "brew") {
      return undefined;
    }
    const installIndex = tokens.findIndex((token) => token === "install");
    if (installIndex === -1) {
      return undefined;
    }

    let isCask = false;
    let target: string | undefined;
    for (let index = installIndex + 1; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token === "--cask") {
        isCask = true;
        continue;
      }
      if (token.startsWith("-")) {
        continue;
      }
      target = token;
      break;
    }

    if (!target) {
      return undefined;
    }

    const candidate = target.includes("/") ? target.split("/").pop() : target;
    if (!candidate) {
      return undefined;
    }

    if (isCask) {
      return this.resolveBrewCaskChecksum(candidate, target);
    }
    return this.resolveBrewFormulaChecksum(candidate, target);
  }

  private async resolveBrewFormulaChecksum(formula: string, target?: string) {
    const candidates = await this.buildBrewFormulaCandidates(formula, target);
    for (const candidate of candidates) {
      const payload = await this.fetchJson(
        `https://formulae.brew.sh/api/formula/${encodeURIComponent(candidate)}.json`
      );
      const checksum = this.extractBrewFormulaChecksum(payload);
      if (checksum) {
        return checksum;
      }
    }

    if (target && target.includes("/")) {
      return this.resolveBrewTapFormulaChecksum(target);
    }
    return undefined;
  }

  private async resolveBrewCaskChecksum(cask: string, target?: string) {
    const candidates = await this.buildBrewCaskCandidates(cask, target);
    for (const candidate of candidates) {
      const payload = await this.fetchJson(
        `https://formulae.brew.sh/api/cask/${encodeURIComponent(candidate)}.json`
      );
      if (!payload || typeof payload !== "object") {
        continue;
      }
      const record = payload as Record<string, unknown>;
      const normalized = normalizeSha256Checksum(
        typeof record.sha256 === "string" ? record.sha256 : undefined
      );
      if (normalized) {
        return normalized;
      }
      const rubySourceChecksum = record.ruby_source_checksum as Record<string, unknown> | undefined;
      const ruby = normalizeSha256Checksum(
        typeof rubySourceChecksum?.sha256 === "string" ? rubySourceChecksum.sha256 : undefined
      );
      if (ruby) {
        return ruby;
      }
    }
    return undefined;
  }

  private extractBrewFormulaChecksum(payload: unknown) {
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    const candidates: Array<string | undefined> = [];

    const urls = record.urls as Record<string, unknown> | undefined;
    const stable = urls?.stable as Record<string, unknown> | undefined;
    candidates.push(typeof stable?.checksum === "string" ? stable.checksum : undefined);

    const rubySourceChecksum = record.ruby_source_checksum as Record<string, unknown> | undefined;
    candidates.push(
      typeof rubySourceChecksum?.sha256 === "string" ? rubySourceChecksum.sha256 : undefined
    );

    const bottle = record.bottle as Record<string, unknown> | undefined;
    const stableBottle = bottle?.stable as Record<string, unknown> | undefined;
    const files = stableBottle?.files as Record<string, unknown> | undefined;
    if (files) {
      for (const value of Object.values(files)) {
        if (!value || typeof value !== "object") {
          continue;
        }
        const fileRecord = value as Record<string, unknown>;
        candidates.push(typeof fileRecord.sha256 === "string" ? fileRecord.sha256 : undefined);
      }
    }

    for (const candidate of candidates) {
      const normalized = normalizeSha256Checksum(candidate);
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  private async buildBrewFormulaCandidates(formula: string, target?: string) {
    const candidateSet = new Set<string>();
    const normalizedFormula = normalizeBrewToken(formula);
    if (normalizedFormula) {
      candidateSet.add(normalizedFormula);
    }

    const normalizedTarget = target ? normalizeBrewToken(target) : undefined;
    if (normalizedTarget && normalizedTarget.includes("/")) {
      const targetTail = normalizedTarget.split("/").pop();
      if (targetTail) {
        candidateSet.add(targetTail);
      }
    }

    const index = await this.getBrewFormulaIndex();
    if (index.length > 0) {
      const lookupTokens = new Set<string>();
      if (normalizedFormula) {
        lookupTokens.add(normalizedFormula);
      }
      if (normalizedTarget) {
        lookupTokens.add(normalizedTarget);
        const targetTail = normalizedTarget.split("/").pop();
        if (targetTail) {
          lookupTokens.add(targetTail);
        }
      }

      const versionedMatches: string[] = [];
      for (const token of lookupTokens) {
        for (const entry of index) {
          if (!entry || typeof entry !== "object" || typeof entry.name !== "string") {
            continue;
          }
          const name = entry.name.toLowerCase();
          const fullName = typeof entry.full_name === "string" ? entry.full_name.toLowerCase() : "";
          const aliases = Array.isArray(entry.aliases)
            ? entry.aliases.map((alias) => String(alias).toLowerCase())
            : [];
          const oldNames = Array.isArray(entry.oldnames)
            ? entry.oldnames.map((oldName) => String(oldName).toLowerCase())
            : [];

          if (
            name === token ||
            fullName === token ||
            aliases.includes(token) ||
            oldNames.includes(token)
          ) {
            candidateSet.add(name);
          }
          if (token && name.startsWith(`${token}@`)) {
            versionedMatches.push(name);
          }
        }
      }
      if (versionedMatches.length > 0) {
        const bestVersion = versionedMatches.sort(compareVersionedNamesDescending)[0];
        if (bestVersion) {
          candidateSet.add(bestVersion);
        }
      }
    }

    return Array.from(candidateSet);
  }

  private async buildBrewCaskCandidates(cask: string, target?: string) {
    const candidateSet = new Set<string>();
    const normalized = normalizeBrewToken(cask);
    if (normalized) {
      candidateSet.add(normalized);
    }

    const normalizedTarget = target ? normalizeBrewToken(target) : undefined;
    if (normalizedTarget) {
      candidateSet.add(normalizedTarget);
      if (normalizedTarget.includes("/")) {
        const tail = normalizedTarget.split("/").pop();
        if (tail) {
          candidateSet.add(tail);
        }
      }
    }

    const index = await this.getBrewCaskIndex();
    if (index.length > 0) {
      const lookupTokens = new Set<string>(candidateSet);
      for (const token of lookupTokens) {
        for (const entry of index) {
          if (!entry || typeof entry !== "object" || typeof entry.token !== "string") {
            continue;
          }
          const entryToken = entry.token.toLowerCase();
          const fullToken =
            typeof entry.full_token === "string" ? entry.full_token.toLowerCase() : "";
          const oldTokens = Array.isArray(entry.old_tokens)
            ? entry.old_tokens.map((oldToken) => String(oldToken).toLowerCase())
            : [];
          if (entryToken === token || fullToken === token || oldTokens.includes(token)) {
            candidateSet.add(entryToken);
          }
        }
      }
    }

    return Array.from(candidateSet);
  }

  private async resolveBrewTapFormulaChecksum(target: string) {
    const normalizedTarget = normalizeBrewToken(target);
    const segments = normalizedTarget.split("/").filter(Boolean);
    if (segments.length < 3) {
      return undefined;
    }

    const owner = segments[0];
    const repoToken = segments[1];
    const formula = segments[2];
    const repoName = repoToken.startsWith("homebrew-") ? repoToken : `homebrew-${repoToken}`;

    const repositoryMeta = await this.fetchJson(`https://api.github.com/repos/${owner}/${repoName}`);
    if (!repositoryMeta || typeof repositoryMeta !== "object") {
      return undefined;
    }
    const defaultBranch =
      typeof (repositoryMeta as Record<string, unknown>).default_branch === "string"
        ? String((repositoryMeta as Record<string, unknown>).default_branch)
        : "main";

    const pathCandidates = [`${formula}.rb`, `Formula/${formula}.rb`, `Casks/${formula}.rb`];
    for (const path of pathCandidates) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repoName}/${encodeURIComponent(defaultBranch)}/${path}`;
      const source = await this.fetchText(rawUrl);
      if (!source) {
        continue;
      }
      const matches = source.match(/sha256\s+["']([a-f0-9]{64})["']/gi);
      if (!matches || matches.length === 0) {
        continue;
      }
      for (const match of matches) {
        const digestMatch = match.match(/([a-f0-9]{64})/i);
        const digest = digestMatch?.[1];
        const normalized = normalizeSha256Checksum(digest);
        if (normalized) {
          return normalized;
        }
      }
    }

    return undefined;
  }

  private async getBrewFormulaIndex() {
    if (this.formulaIndexCache && Date.now() < this.formulaIndexCache.expiresAt) {
      return this.formulaIndexCache.value;
    }
    const payload = await this.fetchJson(BREW_FORMULA_INDEX_URL);
    if (!Array.isArray(payload)) {
      return this.formulaIndexCache?.value ?? [];
    }
    const entries = payload.filter((entry): entry is BrewFormulaIndexEntry => {
      return Boolean(entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).name === "string");
    });
    this.formulaIndexCache = {
      value: entries,
      expiresAt: Date.now() + this.cacheTtlMs
    };
    return entries;
  }

  private async getBrewCaskIndex() {
    if (this.caskIndexCache && Date.now() < this.caskIndexCache.expiresAt) {
      return this.caskIndexCache.value;
    }
    const payload = await this.fetchJson(BREW_CASK_INDEX_URL);
    if (!Array.isArray(payload)) {
      return this.caskIndexCache?.value ?? [];
    }
    const entries = payload.filter((entry): entry is BrewCaskIndexEntry => {
      return Boolean(entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).token === "string");
    });
    this.caskIndexCache = {
      value: entries,
      expiresAt: Date.now() + this.cacheTtlMs
    };
    return entries;
  }

  private async resolveNpmChecksum(segment: string) {
    const tokens = toTokens(segment);
    if (!NPM_MANAGERS.has(tokens[0]?.toLowerCase() ?? "")) {
      return undefined;
    }

    const lowerTokens = tokens.map((token) => token.toLowerCase());
    const installIndex = lowerTokens.findIndex((token) =>
      token === "install" || token === "add" || token === "i"
    );
    if (installIndex === -1) {
      return undefined;
    }

    let specifier: string | undefined;
    for (let index = installIndex + 1; index < tokens.length; index += 1) {
      const token = tokens[index];
      const lower = lowerTokens[index];
      if (
        lower === "-g" ||
        lower === "--global" ||
        lower === "global" ||
        lower === "--location=global"
      ) {
        continue;
      }
      if (token.startsWith("-")) {
        continue;
      }
      specifier = token;
      break;
    }

    if (!specifier) {
      return undefined;
    }

    const parsed = parsePackageSpecifier(specifier);
    if (!parsed) {
      return undefined;
    }

    const packagePath = encodeURIComponent(parsed.packageName);
    const versionSegment = encodeURIComponent(parsed.version ?? "latest");
    const payload = await this.fetchJson(
      `https://registry.npmjs.org/${packagePath}/${versionSegment}`
    );
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    const dist = (payload as Record<string, unknown>).dist as Record<string, unknown> | undefined;
    const tarball = dist?.tarball;
    if (typeof tarball !== "string" || !tarball.startsWith("http")) {
      return undefined;
    }

    return this.sha256ForUrl(tarball);
  }

  private async resolvePipChecksum(segment: string) {
    const tokens = toTokens(segment);
    const command = tokens[0]?.toLowerCase();
    if (command !== "pip" && command !== "pip3") {
      return undefined;
    }
    const installIndex = tokens.findIndex((token) => token.toLowerCase() === "install");
    if (installIndex === -1) {
      return undefined;
    }

    let specifier: string | undefined;
    for (let index = installIndex + 1; index < tokens.length; index += 1) {
      const token = tokens[index];
      const lower = token.toLowerCase();
      if (lower === "-r" || lower === "--requirement") {
        return undefined;
      }
      if (token.startsWith("-")) {
        continue;
      }
      specifier = token;
      break;
    }

    if (!specifier) {
      return undefined;
    }

    const cleaned = specifier.replace(/^['"]|['"]$/g, "");
    const versionMatch = cleaned.match(/==([^=]+)$/);
    const namePart = cleaned
      .split(/[<>=!~]/)[0]
      .replace(/\[.*\]$/, "")
      .trim();
    if (!namePart) {
      return undefined;
    }

    const payload = await this.fetchJson(
      `https://pypi.org/pypi/${encodeURIComponent(namePart)}/json`
    );
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    const root = payload as Record<string, unknown>;
    const info = root.info as Record<string, unknown> | undefined;
    const version = versionMatch?.[1] ?? (typeof info?.version === "string" ? info.version : undefined);
    if (!version) {
      return undefined;
    }

    const releases = root.releases as Record<string, unknown> | undefined;
    const files = releases?.[version];
    if (!Array.isArray(files)) {
      return undefined;
    }

    const preferred = files.find((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const record = entry as Record<string, unknown>;
      return record.packagetype === "sdist" &&
        typeof (record.digests as Record<string, unknown> | undefined)?.sha256 === "string";
    }) ?? files.find((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const record = entry as Record<string, unknown>;
      return typeof (record.digests as Record<string, unknown> | undefined)?.sha256 === "string";
    });

    if (!preferred || typeof preferred !== "object") {
      return undefined;
    }

    const digest = ((preferred as Record<string, unknown>).digests as Record<string, unknown> | undefined)?.sha256;
    if (typeof digest !== "string") {
      return undefined;
    }
    return normalizeSha256Checksum(digest);
  }

  private async resolveCargoChecksum(segment: string) {
    const tokens = toTokens(segment);
    if (tokens[0]?.toLowerCase() !== "cargo") {
      return undefined;
    }
    const installIndex = tokens.findIndex((token) => token.toLowerCase() === "install");
    if (installIndex === -1) {
      return undefined;
    }

    let crateName: string | undefined;
    let version: string | undefined;
    for (let index = installIndex + 1; index < tokens.length; index += 1) {
      const token = tokens[index];
      const lower = token.toLowerCase();
      if (lower === "--version" && typeof tokens[index + 1] === "string") {
        version = tokens[index + 1];
        index += 1;
        continue;
      }
      if (token.startsWith("-")) {
        continue;
      }
      if (!crateName) {
        crateName = token;
      }
    }

    if (!crateName) {
      return undefined;
    }

    const payload = await this.fetchJson(
      `https://crates.io/api/v1/crates/${encodeURIComponent(crateName)}/versions?page=1&per_page=100`
    );
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    const versions = (payload as Record<string, unknown>).versions;
    if (!Array.isArray(versions)) {
      return undefined;
    }

    const selected = version
      ? versions.find((entry) => {
          if (!entry || typeof entry !== "object") {
            return false;
          }
          return (entry as Record<string, unknown>).num === version;
        })
      : versions.find((entry) => {
          if (!entry || typeof entry !== "object") {
            return false;
          }
          const record = entry as Record<string, unknown>;
          return record.yanked === false;
        }) ?? versions[0];

    if (!selected || typeof selected !== "object") {
      return undefined;
    }

    const checksum = (selected as Record<string, unknown>).checksum;
    if (typeof checksum !== "string") {
      return undefined;
    }
    return normalizeSha256Checksum(checksum);
  }

  private async fetchJson(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await fetch(url, {
        headers: REQUEST_HEADERS,
        signal: controller.signal
      });
      if (!response.ok) {
        return undefined;
      }
      return await response.json();
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchText(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": REQUEST_HEADERS["user-agent"]
        },
        signal: controller.signal
      });
      if (!response.ok) {
        return undefined;
      }
      return await response.text();
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async sha256ForUrl(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": REQUEST_HEADERS["user-agent"]
        },
        signal: controller.signal
      });
      if (!response.ok) {
        return undefined;
      }
      const contentLengthHeader = response.headers.get("content-length");
      if (contentLengthHeader) {
        const size = Number(contentLengthHeader);
        if (Number.isFinite(size) && size > this.maxDownloadBytes) {
          return undefined;
        }
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > this.maxDownloadBytes) {
        return undefined;
      }

      return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }
}
