import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { DEFAULT_API_BASE_URL } from "./client.js";

export interface CliConfig {
  apiKey?: string;
  baseUrl?: string;
}

const CONFIG_PATH = join(homedir(), ".clime", "config.json");

function normalize(value?: string) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getConfigPath() {
  return CONFIG_PATH;
}

export function readConfig(): CliConfig {
  try {
    const content = readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(content) as CliConfig;
  } catch {
    return {};
  }
}

export function writeConfig(config: CliConfig) {
  const dir = dirname(CONFIG_PATH);
  mkdirSync(dir, { recursive: true });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // Best-effort on platforms that don't support chmod.
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  try {
    chmodSync(CONFIG_PATH, 0o600);
  } catch {
    // Best-effort on platforms that don't support chmod.
  }
}

export function resolveRuntimeConfig(overrides: { apiKey?: string; baseUrl?: string }) {
  const fileConfig = readConfig();

  const apiKey =
    normalize(overrides.apiKey) ?? normalize(process.env.CLIME_API_KEY) ?? normalize(fileConfig.apiKey);
  const baseUrl =
    normalize(overrides.baseUrl) ??
    normalize(process.env.CLIME_BASE_URL) ??
    normalize(fileConfig.baseUrl) ??
    DEFAULT_API_BASE_URL;

  return { apiKey, baseUrl };
}
