#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { arch, platform } from 'node:os';
import { Command } from 'commander';
import {
  normalizeSha256Checksum,
  ReportPayloadSchema,
  RankingTypeSchema,
} from '@cli-me/shared-types';
import { ClimeApiClient } from './client.js';
import { getConfigPath, resolveRuntimeConfig, writeConfig } from './config.js';
import { CliError, errorEnvelope } from './errors.js';
import { renderOutput, type OutputMode } from './output.js';
import { completionScript } from './completions.js';

const ALLOWED_INSTALL_COMMANDS = new Set([
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'bun',
  'brew',
  'apt',
  'apt-get',
  'pip',
  'pip3',
  'cargo',
  'go',
  'gem',
  'winget',
  'choco',
  'scoop',
  'snap',
  'pacman',
  'dnf',
  'yum',
]);

const ALLOWED_VERSION_FLAGS = new Set(['--version', '-v', '-V', 'version', '--ver']);

const NPM_INSTALL_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const NPM_VERIFY_TIMEOUT_MS = 15_000;
const MAX_NPM_TARBALL_BYTES = 100 * 1024 * 1024;

function parsePackageSpecifier(raw: string): { packageName: string; version?: string } | null {
  const value = raw.replace(/^['"]|['"]$/g, '');
  if (!value) {
    return null;
  }
  if (
    value.includes('://') ||
    value.startsWith('git+') ||
    value.startsWith('file:') ||
    value.startsWith('./') ||
    value.startsWith('../')
  ) {
    return null;
  }

  if (value.startsWith('@')) {
    const slashIndex = value.indexOf('/');
    const versionSeparator = value.lastIndexOf('@');
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

  const versionSeparator = value.lastIndexOf('@');
  if (versionSeparator > 0) {
    const packageName = value.slice(0, versionSeparator);
    const version = value.slice(versionSeparator + 1);
    return packageName ? { packageName, version: version || undefined } : null;
  }

  return { packageName: value };
}

function extractNpmInstallSpecifier(parsed: { executable: string; args: string[] }) {
  const manager = parsed.executable.toLowerCase();
  if (!NPM_INSTALL_MANAGERS.has(manager)) {
    return null;
  }

  const args = parsed.args;
  const lower = args.map((entry) => entry.toLowerCase());
  const installIndex = lower.findIndex(
    (token) => token === 'install' || token === 'add' || token === 'i',
  );
  if (installIndex === -1) {
    return null;
  }

  let specifier: string | undefined;
  for (let index = installIndex + 1; index < args.length; index += 1) {
    const token = args[index];
    const normalized = lower[index];
    if (
      normalized === '-g' ||
      normalized === '--global' ||
      normalized === 'global' ||
      normalized === '--location=global'
    ) {
      continue;
    }
    if (token.startsWith('-')) {
      continue;
    }
    specifier = token;
    break;
  }

  if (!specifier) {
    return null;
  }

  const parsedSpecifier = parsePackageSpecifier(specifier);
  if (!parsedSpecifier) {
    return null;
  }

  return {
    manager,
    packageName: parsedSpecifier.packageName,
    version: parsedSpecifier.version,
  };
}

async function fetchJsonWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NPM_VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'clime-cli/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSha256ForTarball(tarballUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NPM_VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(tarballUrl, {
      headers: {
        accept: 'application/octet-stream',
        'user-agent': 'clime-cli/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > MAX_NPM_TARBALL_BYTES) {
        return null;
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_NPM_TARBALL_BYTES) {
      return null;
    }

    return createHash('sha256').update(buffer).digest('hex');
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyNpmInstallBinding(
  parsedInstallCommand: { executable: string; args: string[] },
  expectedSha256: string,
): Promise<boolean> {
  const specifier = extractNpmInstallSpecifier(parsedInstallCommand);
  if (!specifier) {
    return false;
  }

  const packagePath = encodeURIComponent(specifier.packageName);
  const versionSegment = encodeURIComponent(specifier.version ?? 'latest');
  const metadata = await fetchJsonWithTimeout(
    `https://registry.npmjs.org/${packagePath}/${versionSegment}`,
  );
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }

  const dist = metadata.dist;
  if (!dist || typeof dist !== 'object') {
    return false;
  }
  const tarball = (dist as Record<string, unknown>).tarball;
  if (typeof tarball !== 'string' || !tarball.startsWith('http')) {
    return false;
  }

  const registrySha256 = await fetchSha256ForTarball(tarball);
  if (!registrySha256) {
    return false;
  }

  return registrySha256.toLowerCase() === expectedSha256.toLowerCase();
}

function parseInstallCommand(command: string): { executable: string; args: string[] } | null {
  const normalized = command.trim();
  if (!normalized) {
    return null;
  }

  // Allow only plain command + args invocations; no shell operators/control characters.
  if (/[\r\n;&|`$(){}<>]/.test(normalized)) {
    return null;
  }

  const parts = normalized.split(/\s+/);
  const executable = parts[0];
  if (!executable || !ALLOWED_INSTALL_COMMANDS.has(executable)) {
    return null;
  }

  return {
    executable,
    args: parts.slice(1),
  };
}

function isBinaryInstalled(binary: string): boolean {
  const locator = process.platform === 'win32' ? 'where' : 'which';
  const lookup = spawnSync(locator, [binary], { stdio: 'ignore' });
  return lookup.status === 0;
}

interface GlobalOptions {
  apiKey?: string;
  key?: string;
  baseUrl?: string;
  apiUrl?: string;
  format?: string;
  noCache?: boolean;
  json?: boolean;
  human?: boolean;
  markdown?: boolean;
}

function systemPromptText() {
  return [
    'When you need to find, install, or authenticate a CLI tool, use clime first.',
    '1) Run: clime search "<task>" --json',
    '2) Choose top result, then run: clime install <slug>',
    '3) Run: clime auth <slug>',
    '4) Run: clime commands <slug> --workflow=<intent>',
    '5) After execution, report result: clime report <slug> --status=<success|fail> ...',
  ].join('\n');
}

function normalizeOs(input: string): 'macos' | 'linux' | 'windows' | 'any' {
  if (input === 'darwin') {
    return 'macos';
  }
  if (input === 'win32') {
    return 'windows';
  }
  if (input === 'linux') {
    return 'linux';
  }
  return 'any';
}

function pickOutputMode(options: GlobalOptions): OutputMode {
  if (options.markdown) {
    return 'markdown';
  }
  if (options.human) {
    return 'human';
  }
  if (options.json) {
    return 'json';
  }
  if (!process.stdout.isTTY) {
    return 'json';
  }
  return 'human';
}

function ensureRuntimeConfig(options: GlobalOptions, notifyOnGenerate = true) {
  const config = resolveRuntimeConfig({
    apiKey: options.apiKey ?? options.key,
    baseUrl: options.baseUrl ?? options.apiUrl,
  });
  let apiKey = config.apiKey;
  let apiKeyGenerated = false;

  if (!apiKey) {
    apiKey = `clime_${randomBytes(18).toString('hex')}`;
    apiKeyGenerated = true;
    writeConfig({
      apiKey,
      baseUrl: config.baseUrl,
    });
    if (notifyOnGenerate) {
      process.stderr.write(`[clime] Generated local API key at ${getConfigPath()}\n`);
      process.stderr.write('[clime] Agent setup: clime init --agent --json\n');
    }
  }

  return {
    apiKey,
    baseUrl: config.baseUrl,
    apiKeyGenerated,
  };
}

function resolveClient(options: GlobalOptions) {
  const runtime = ensureRuntimeConfig(options);

  return new ClimeApiClient(runtime.baseUrl, runtime.apiKey, {
    disableCache: options.noCache,
    cacheTtlSeconds: Number(process.env.CLIME_CACHE_TTL_SECONDS ?? 180),
  });
}

function maskedApiKey(apiKey: string) {
  if (apiKey.length <= 12) {
    return `${apiKey.slice(0, 4)}...`;
  }

  return `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
}

function applyFormat(command: string, data: unknown, format: string | undefined): unknown {
  if (!format) {
    return data;
  }

  const normalized = format.trim().toLowerCase();
  if (!normalized) {
    return data;
  }

  if ((command === 'search' || command === 'which') && Array.isArray(data)) {
    if (normalized === 'slug') {
      return data.map((entry) => (entry as { cli?: { slug?: string } }).cli?.slug).filter(Boolean);
    }
    if (normalized === 'name') {
      return data.map((entry) => (entry as { cli?: { name?: string } }).cli?.name).filter(Boolean);
    }
    if (normalized === 'install-command') {
      return data
        .map((entry) => (entry as { install_command?: string }).install_command)
        .filter(Boolean);
    }
  }

  if (command === 'which' && typeof data === 'object' && data !== null) {
    const typed = data as {
      slug?: string;
      install_command?: string;
      score?: number;
    };
    if (normalized === 'slug' && typed.slug) {
      return typed.slug;
    }
    if (normalized === 'install-command' && typed.install_command) {
      return typed.install_command;
    }
    if (normalized === 'score' && typeof typed.score === 'number') {
      return typed.score;
    }
  }

  return data;
}

function printData(command: string, data: unknown, mode: OutputMode, format?: string) {
  const formatted = applyFormat(command, data, format);
  if (
    mode === 'human' &&
    Array.isArray(formatted) &&
    formatted.every((entry) => typeof entry === 'string')
  ) {
    console.log(formatted.join('\n'));
    return;
  }
  if (mode === 'human' && typeof formatted === 'string') {
    console.log(formatted);
    return;
  }
  console.log(renderOutput(command, formatted, mode));
}

function resolveCompletionShell(input?: string) {
  const normalized = (input ?? 'zsh').toLowerCase();
  if (normalized === 'bash' || normalized === 'zsh' || normalized === 'fish') {
    return normalized;
  }
  throw new CliError('VALIDATION_ERROR', 'Shell must be one of: bash, zsh, fish', 1);
}

function completionCommands(program: Command) {
  return [
    ...new Set(
      program.commands.flatMap((registered) => [registered.name(), ...registered.aliases()]),
    ),
  ];
}

async function run() {
  const program = new Command();

  program
    .name('clime')
    .description('Universal CLI registry for AI agents')
    .version(process.env.npm_package_version ?? '0.1.0')
    .option('--api-key <key>', 'Override API key')
    .option('--key <key>', 'Alias for --api-key')
    .option('--base-url <url>', 'Override API base URL')
    .option('--api-url <url>', 'Alias for --base-url')
    .option('--format <field>', 'Select output field (slug|name|install-command|score)')
    .option('--no-cache', 'Disable local response cache for this command')
    .option('--json', 'Render machine-parseable JSON output')
    .option('--human', 'Render human-readable output')
    .option('--markdown', 'Render markdown output');

  program.addHelpText(
    'after',
    '\nOn first run, clime generates and stores a local API key automatically.\nFor agent bootstrap, run: `clime init --agent --json`.\nDefault output is human-readable in TTY and JSON when piped/non-interactive.\nUse `clime configure --api-key <key> --base-url <url>` to override.\nEnv overrides: `CLIME_API_KEY`, `CLIME_BASE_URL`.',
  );

  program
    .command('init')
    .description('Bootstrap clime for agent or human sessions')
    .option('--agent', 'Return agent-first setup payload')
    .addHelpText(
      'after',
      '\nRecommended for agents: `clime init --agent --json`.\nThis command ensures local API key setup and returns deterministic next-step commands.',
    )
    .action((options: { agent?: boolean }, command: Command) => {
      const global = command.parent?.opts<GlobalOptions>() ?? {};
      const mode = pickOutputMode(global);
      const runtime = ensureRuntimeConfig(global, mode !== 'json');
      const payload = {
        mode: options.agent ? 'agent' : 'human',
        ready: true,
        base_url: runtime.baseUrl,
        api_key: {
          configured: true,
          source: runtime.apiKeyGenerated ? 'generated' : 'existing',
          path: getConfigPath(),
          preview: maskedApiKey(runtime.apiKey),
        },
        next_steps: options.agent
          ? [
              'clime search "<task>" --json',
              'clime install <slug> --json',
              'clime auth <slug> --json',
              'clime commands <slug> --workflow=<intent> --json',
              'clime report <slug> --status=<success|fail> --json',
            ]
          : ['clime search "<task>"', 'clime workflow <goal>', 'clime info <slug>'],
        system_prompt: options.agent ? systemPromptText() : undefined,
      };
      printData('init', payload, mode, global.format);
    });

  program
    .command('configure')
    .description('Store API key/base URL for future commands')
    .option('--api-key <key>', 'API key')
    .option('--key <key>', 'Alias for --api-key')
    .option('--base-url <url>', 'API base URL')
    .option('--api-url <url>', 'Alias for --base-url')
    .option('--url <url>', 'Deprecated alias for --base-url')
    .addHelpText(
      'after',
      '\nWrites config to ~/.clime/config.json.\nThis command is optional when using env vars (`CLIME_API_KEY`, `CLIME_BASE_URL`).',
    )
    .action(
      (
        options: { key?: string; apiKey?: string; url?: string; baseUrl?: string; apiUrl?: string },
        command: Command,
      ) => {
        const global = command.parent?.opts<GlobalOptions>() ?? {};
        const key = options.key ?? options.apiKey ?? global.key ?? global.apiKey;
        if (!key) {
          throw new CliError('VALIDATION_ERROR', 'API key is required', 1);
        }
        const current = resolveRuntimeConfig({});
        writeConfig({
          apiKey: key,
          baseUrl:
            options.baseUrl ??
            options.apiUrl ??
            options.url ??
            global.baseUrl ??
            global.apiUrl ??
            current.baseUrl,
        });
        printData(
          'configure',
          {
            configured: true,
            path: getConfigPath(),
          },
          pickOutputMode(global),
          global.format,
        );
      },
    );

  program
    .command('search <query>')
    .description('Discover CLIs by natural language task')
    .option('--limit <n>', 'Max results', '10')
    .action(async (query: string, options: { limit: string }, command: Command) => {
      const global = command.parent?.opts<GlobalOptions>() ?? {};
      const client = resolveClient(global);
      const data = await client.search(query, Number(options.limit));
      printData('search', data, pickOutputMode(global), global.format);
    });

  program
    .command('list')
    .description('List CLI registry entries')
    .option('--category <tag>', 'Filter by category tag')
    .option('--publisher <name>', 'Filter by publisher name')
    .option('--status <status>', 'publisher-verified|community-curated|auto-indexed')
    .option('--limit <n>', 'Maximum results', '200')
    .action(
      async (
        options: {
          category?: string;
          publisher?: string;
          status?: 'publisher-verified' | 'community-curated' | 'auto-indexed';
          limit: string;
        },
        command: Command,
      ) => {
        const global = command.parent?.opts<GlobalOptions>() ?? {};
        const client = resolveClient(global);
        const all = await client.list();
        const limit = Math.max(1, Number(options.limit) || 200);
        const filtered = all
          .filter((entry) =>
            options.category
              ? entry.identity.category_tags.some(
                  (tag) => tag.toLowerCase() === options.category?.toLowerCase(),
                )
              : true,
          )
          .filter((entry) =>
            options.publisher
              ? entry.identity.publisher.toLowerCase().includes(options.publisher.toLowerCase())
              : true,
          )
          .filter((entry) =>
            options.status ? entry.identity.verification_status === options.status : true,
          )
          .slice(0, limit);
        printData('list', filtered, pickOutputMode(global), global.format);
      },
    );

  program
    .command('which <query>')
    .description('Return the best single CLI match for a task')
    .option('--limit <n>', 'Candidate search window', '6')
    .action(async (query: string, options: { limit: string }, command: Command) => {
      const global = command.parent?.opts<GlobalOptions>() ?? {};
      const client = resolveClient(global);
      const results = await client.search(query, Number(options.limit));
      const best = results[0];
      if (!best) {
        throw new CliError('CLI_NOT_FOUND', 'No matching CLI found for query', 1, {
          query,
        });
      }
      printData(
        'which',
        {
          slug: best.cli.slug,
          name: best.cli.name,
          score: best.score,
          install_command: best.install_command,
        },
        pickOutputMode(global),
        global.format,
      );
    });

  program
    .command('signup')
    .description('Create a server-issued API key and store it locally')
    .option('--owner-type <type>', 'developer|agent|publisher', 'developer')
    .option('--owner-id <id>', 'Optional owner identifier')
    .option('--label <label>', 'Optional API key label')
    .action(
      async (
        options: {
          ownerType: 'developer' | 'agent' | 'publisher';
          ownerId?: string;
          label?: string;
        },
        command: Command,
      ) => {
        const global = command.parent?.opts<GlobalOptions>() ?? {};
        const client = resolveClient(global);
        const issued = await client.createApiKey({
          owner_type: options.ownerType,
          owner_id: options.ownerId,
          label: options.label,
        });

        const current = resolveRuntimeConfig({});
        writeConfig({
          apiKey: issued.api_key,
          baseUrl: current.baseUrl,
        });

        printData(
          'signup',
          {
            key_id: issued.key_id,
            owner_type: issued.owner_type,
            owner_id: issued.owner_id,
            created_at: issued.created_at,
            path: getConfigPath(),
          },
          pickOutputMode(global),
        );
      },
    );

  program
    .command('install <slug>')
    .description('Return install command by OS/package manager')
    .option('--os <os>', 'Override operating system')
    .option('--package-manager <manager>', 'Package manager')
    .option('--hash', 'Print verification hash/checksum details only')
    .option('--run', 'Execute recommended install command')
    .addHelpText(
      'after',
      '\n`clime install <slug>` prints install instructions and checksum metadata.\n`--run` executes the first recommended command after showing checksum details.\n`--hash` prints only checksum metadata for verification pipelines.',
    )
    .action(
      async (
        slug: string,
        options: { os?: string; packageManager?: string; hash?: boolean; run?: boolean },
        command: Command,
      ) => {
        const global = command.parent?.opts<GlobalOptions>() ?? {};
        const client = resolveClient(global);
        const detectedOs = options.os ?? normalizeOs(platform());
        const data = (await client.install(slug, {
          os: detectedOs,
          packageManager: options.packageManager,
        })) as Array<{
          os?: string;
          package_manager?: string;
          command: string;
          checksum?: string;
        }>;

        if (options.hash) {
          printData(
            'install',
            data.map((entry) => ({
              os: entry.os,
              package_manager: entry.package_manager,
              command: entry.command,
              checksum: normalizeSha256Checksum(entry.checksum),
              checksum_status: normalizeSha256Checksum(entry.checksum)
                ? 'available'
                : 'unavailable',
            })),
            pickOutputMode(global),
            global.format,
          );
          return;
        }

        if (options.run && data.length > 0) {
          const primary = data[0];
          const normalizedChecksum = normalizeSha256Checksum(primary.checksum);
          if (!normalizedChecksum) {
            throw new CliError(
              'HASH_MISSING',
              'Cannot execute install automatically because a cryptographic SHA-256 checksum is unavailable.',
              1,
            );
          }
          const parsedInstallCommand = parseInstallCommand(primary.command);
          if (!parsedInstallCommand) {
            throw new CliError(
              'UNSAFE_COMMAND',
              'Install command rejected: executable is not in the allowed package manager list or arguments contain shell metacharacters.',
              1,
              { command: primary.command, allowed: [...ALLOWED_INSTALL_COMMANDS] },
            );
          }

          if (NPM_INSTALL_MANAGERS.has(parsedInstallCommand.executable.toLowerCase())) {
            const bindingVerified = await verifyNpmInstallBinding(
              parsedInstallCommand,
              normalizedChecksum,
            );
            if (!bindingVerified) {
              throw new CliError(
                'CHECKSUM_BINDING_FAILED',
                'Install command checksum could not be independently bound to the npm package artifact.',
                1,
                { command: primary.command },
              );
            }
          }

          const checksumLabel = normalizedChecksum;
          console.log(
            `[clime] Installing ${slug} via: ${primary.command}\n[clime] checksum: ${checksumLabel}`,
          );
          const installRun = spawnSync(parsedInstallCommand.executable, parsedInstallCommand.args, {
            stdio: 'inherit',
          });
          if (installRun.error) {
            throw new CliError(
              'INSTALL_FAILED',
              `Install command failed to start: ${installRun.error.message}`,
              1,
              { command: primary.command },
            );
          }
          if (installRun.status !== 0) {
            throw new CliError(
              'INSTALL_FAILED',
              `Install command exited with status ${installRun.status ?? 1}.`,
              1,
              { command: primary.command, status: installRun.status ?? 1 },
            );
          }

          const binaryCandidate = slug.replace(/-cli$/i, '').replace(/[^a-z0-9._-]/gi, '');
          const binaryDetected = isBinaryInstalled(binaryCandidate);

          printData(
            'install',
            {
              executed: true,
              binary_candidate: binaryCandidate,
              binary_detected: binaryDetected,
              instructions: data,
            },
            pickOutputMode(global),
            global.format,
          );
          return;
        }

        printData('install', data, pickOutputMode(global), global.format);
      },
    );

  program
    .command('commands <slug>')
    .description('Get command map for a CLI')
    .option('--workflow <slug>', 'Filter by workflow slug')
    .action(async (slug: string, options: { workflow?: string }, command: Command) => {
      const global = command.parent?.opts<GlobalOptions>() ?? {};
      const client = resolveClient(global);
      const data = await client.commands(slug, options.workflow);
      printData('commands', data, pickOutputMode(global), global.format);
    });

  program
    .command('auth <slug>')
    .description('Get auth flow for a CLI')
    .action(async (slug: string, _options: unknown, command: Command) => {
      const global = command.parent?.opts<GlobalOptions>() ?? {};
      const client = resolveClient(global);
      const data = await client.auth(slug);
      printData('auth', data, pickOutputMode(global), global.format);
    });

  program
    .command('info <slug>')
    .description('Get full CLI profile')
    .action(async (slug: string, _options: unknown, command: Command) => {
      const global = command.parent?.opts<GlobalOptions>() ?? {};
      const client = resolveClient(global);
      const data = await client.info(slug);
      printData('info', data, pickOutputMode(global), global.format);
    });

  program
    .command('check <slug>')
    .description('Verify whether a CLI binary is installed and readable')
    .option('--binary <name>', 'Override binary name to check')
    .option('--version-flag <flag>', 'Version flag to probe', '--version')
    .action(
      async (slug: string, options: { binary?: string; versionFlag: string }, command: Command) => {
        const global = command.parent?.opts<GlobalOptions>() ?? {};
        const client = resolveClient(global);
        await client.info(slug);

        const fallbackBinary = slug.replace(/-cli$/i, '').replace(/[^a-z0-9._-]/gi, '');
        const requestedBinary = options.binary?.trim() || fallbackBinary;
        if (!/^[a-zA-Z0-9._-]+$/.test(requestedBinary)) {
          throw new CliError(
            'VALIDATION_ERROR',
            'Binary name can contain only letters, numbers, ., _, and -',
            1,
          );
        }

        if (!ALLOWED_VERSION_FLAGS.has(options.versionFlag)) {
          throw new CliError(
            'VALIDATION_ERROR',
            `Version flag "${options.versionFlag}" is not allowed. Accepted flags: ${[...ALLOWED_VERSION_FLAGS].join(', ')}`,
            1,
          );
        }

        const binary = requestedBinary;
        const installed = isBinaryInstalled(binary);

        let versionOutput: string | undefined;
        if (installed) {
          const versionProbe = spawnSync(binary, [options.versionFlag], {
            encoding: 'utf-8',
          });
          if (versionProbe.status === 0) {
            versionOutput = versionProbe.stdout.trim() || versionProbe.stderr.trim() || undefined;
          }
        }

        printData(
          'check',
          {
            slug,
            binary,
            installed,
            version_output: versionOutput,
          },
          pickOutputMode(global),
          global.format,
        );
      },
    );

  program
    .command('workflow <goal>')
    .description('Get multi-CLI workflow chains for a goal')
    .option('--limit <n>', 'Max results', '10')
    .option('--slug', 'Treat goal as workflow slug/id and fetch exact workflow')
    .action(async (goal: string, options: { limit: string; slug?: boolean }, command: Command) => {
      const global = command.parent?.opts<GlobalOptions>() ?? {};
      const client = resolveClient(global);
      const data = options.slug
        ? await client.workflowById(goal)
        : await client.workflowSearch(goal, Number(options.limit));
      printData('workflow', data, pickOutputMode(global), global.format);
    });

  program
    .command('rankings')
    .description('Get leaderboard rankings')
    .option('--type <type>', 'used|rising|compat|requested', 'used')
    .action(async (options: { type: string }, command: Command) => {
      const global = command.parent?.opts<GlobalOptions>() ?? {};
      const parsed = RankingTypeSchema.safeParse(options.type);
      if (!parsed.success) {
        throw new CliError('VALIDATION_ERROR', 'Invalid ranking type', 1, {
          accepted: RankingTypeSchema.options,
        });
      }
      const client = resolveClient(global);
      const data = await client.rankings(parsed.data);
      printData('rankings', data, pickOutputMode(global), global.format);
    });

  program
    .command('usage')
    .description('Show usage summary for the active API key')
    .action(async (_options: unknown, command: Command) => {
      const global = command.parent?.opts<GlobalOptions>() ?? {};
      const config = resolveRuntimeConfig({
        apiKey: global.apiKey ?? global.key,
        baseUrl: global.baseUrl ?? global.apiUrl,
      });
      if (!config.apiKey) {
        throw new CliError('VALIDATION_ERROR', 'No API key configured', 1);
      }
      const client = new ClimeApiClient(config.baseUrl, config.apiKey, {
        disableCache: true,
      });
      const data = await client.usageByKey(config.apiKey);
      printData('usage', data, pickOutputMode(global), global.format);
    });

  program
    .command('report <slug>')
    .aliases(['feedback', 'telemetry'])
    .description('Send telemetry feedback for a CLI execution (not for retrieval)')
    .addHelpText(
      'after',
      '\nIf you want listing details, use `clime info <slug>`.\nIf you run `clime report <slug>` without telemetry flags, clime returns `clime info <slug>` output.',
    )
    .option('--status <status>', 'success|fail')
    .option('--cli-version <version>', 'CLI version used')
    .option('--workflow-id <id>', 'Workflow ID')
    .option('--command-id <id>', 'Command ID')
    .option('--duration-ms <ms>', 'Duration in milliseconds')
    .option('--exit-code <code>', 'Command exit code')
    .option('--agent-name <name>', 'Agent name')
    .option('--agent-version <version>', 'Agent version')
    .option('--os <os>', 'OS override')
    .option('--arch <arch>', 'Arch override')
    .option('--error-code <code>', 'Error code')
    .option('--stderr-hash <hash>', 'Hash of stderr for privacy-preserving diagnostics')
    .option('--request-id <id>', 'Unique request id')
    .action(
      async (
        slug: string,
        options: {
          status: 'success' | 'fail';
          cliVersion: string;
          workflowId?: string;
          commandId?: string;
          durationMs: string;
          exitCode: string;
          agentName: string;
          agentVersion: string;
          os?: string;
          arch?: string;
          errorCode?: string;
          stderrHash?: string;
          requestId?: string;
        },
        command: Command,
      ) => {
        const global = command.parent?.opts<GlobalOptions>() ?? {};
        const client = resolveClient(global);

        const telemetryFlagsProvided = Boolean(
          options.status ||
            options.cliVersion ||
            options.workflowId ||
            options.commandId ||
            options.durationMs ||
            options.exitCode ||
            options.agentName ||
            options.agentVersion ||
            options.errorCode ||
            options.stderrHash ||
            options.requestId,
        );

        // Agent-friendly alias: `clime report <slug>` without telemetry flags behaves like `clime info <slug>`.
        if (!telemetryFlagsProvided) {
          const data = await client.info(slug);
          printData('info', data, pickOutputMode(global), global.format);
          return;
        }

        if (!options.status) {
          throw new CliError(
            'REPORT_USAGE_ERROR',
            'Missing --status. `clime report` sends telemetry; use `clime info <slug>` to retrieve listing data.',
            1,
          );
        }

        const missingRequired: string[] = [];
        if (!options.cliVersion) {
          missingRequired.push('--cli-version');
        }
        if (!options.durationMs) {
          missingRequired.push('--duration-ms');
        }
        if (!options.exitCode) {
          missingRequired.push('--exit-code');
        }
        if (!options.agentName) {
          missingRequired.push('--agent-name');
        }
        if (!options.agentVersion) {
          missingRequired.push('--agent-version');
        }
        if (!options.workflowId && !options.commandId) {
          missingRequired.push('--workflow-id or --command-id');
        }

        if (missingRequired.length > 0) {
          throw new CliError(
            'REPORT_USAGE_ERROR',
            `Missing telemetry fields: ${missingRequired.join(', ')}`,
            1,
          );
        }

        const payload = {
          status: options.status,
          cli_slug: slug,
          cli_version: options.cliVersion,
          workflow_id: options.workflowId,
          command_id: options.commandId,
          duration_ms: Number(options.durationMs),
          exit_code: Number(options.exitCode),
          agent_name: options.agentName,
          agent_version: options.agentVersion,
          os: normalizeOs(options.os ?? platform()),
          arch: options.arch ?? arch(),
          error_code: options.errorCode,
          stderr_hash: options.stderrHash,
          request_id: options.requestId ?? `rep_${Date.now()}`,
          timestamp: new Date().toISOString(),
        };

        const parsed = ReportPayloadSchema.safeParse(payload);
        if (!parsed.success) {
          throw new CliError('VALIDATION_ERROR', 'Invalid report payload', 1, {
            issues: parsed.error.flatten(),
          });
        }

        const data = await client.report(slug, parsed.data);
        printData('report', data, pickOutputMode(global), global.format);
      },
    );

  program
    .command('submit')
    .description('Submit a new CLI or listing edit proposal')
    .option('--name <name>', 'CLI name (simple submit mode)')
    .option('--repo <url>', 'Repository URL (simple submit mode)')
    .option('--description <text>', 'CLI description (simple submit mode)')
    .option('--website <url>', 'Project website (simple submit mode)')
    .option('--publisher <name>', 'Publisher/org name (simple submit mode)')
    .option('--install <command>', 'Primary install command (simple submit mode)')
    .option(
      '--auth-type <type>',
      'none|api_key|oauth|login_command|config_file (simple submit mode)',
    )
    .option('--categories <csv>', 'Comma-separated category tags (simple submit mode)')
    .option('--type <type>', 'new_cli|edit_listing')
    .option('--submitter <id>', 'submitter identifier')
    .option('--target <slug>', 'target CLI slug')
    .option('--content <json>', 'Raw JSON payload for advanced mode')
    .addHelpText(
      'after',
      "\nSimple mode: provide `--name --repo --description`.\nAdvanced mode: provide `--content '{...}'` with optional `--type/--target` for edit proposals.",
    )
    .action(
      async (
        options: {
          name?: string;
          repo?: string;
          description?: string;
          website?: string;
          publisher?: string;
          install?: string;
          authType?: string;
          categories?: string;
          type?: 'new_cli' | 'edit_listing';
          submitter?: string;
          target?: string;
          content?: string;
        },
        command: Command,
      ) => {
        const global = command.parent?.opts<GlobalOptions>() ?? {};
        const client = resolveClient(global);
        let type: 'new_cli' | 'edit_listing' = options.type ?? 'new_cli';
        const submitter = options.submitter ?? 'clime-cli';
        let targetSlug = options.target;
        let parsedContent: Record<string, unknown>;

        if (options.content) {
          try {
            parsedContent = JSON.parse(options.content) as Record<string, unknown>;
          } catch {
            throw new CliError('VALIDATION_ERROR', 'Invalid JSON provided to --content', 1);
          }
        } else {
          if (!options.name || !options.repo || !options.description) {
            throw new CliError(
              'VALIDATION_ERROR',
              'For simple submit mode provide --name, --repo, and --description (or use --content JSON for advanced mode).',
              1,
            );
          }
          type = 'new_cli';
          targetSlug = undefined;
          parsedContent = {
            name: options.name,
            repository: options.repo,
            description: options.description,
            website: options.website,
            publisher: options.publisher,
            install: options.install,
            auth_type: options.authType,
            categories: options.categories
              ? options.categories
                  .split(',')
                  .map((entry) => entry.trim())
                  .filter(Boolean)
              : [],
          };
        }

        const data = await client.submit({
          type,
          submitter,
          target_cli_slug: targetSlug,
          content: parsedContent,
        });
        printData('submit', data, pickOutputMode(global), global.format);
      },
    );

  program
    .command('claim')
    .description('Submit publisher ownership claim for a CLI listing')
    .requiredOption('--cli <slug>', 'CLI slug')
    .requiredOption('--publisher <name>', 'Publisher/org name')
    .requiredOption('--domain <domain>', 'Publisher domain')
    .requiredOption('--evidence <text>', 'Claim evidence note')
    .option('--method <method>', 'dns_txt|repo_file', 'dns_txt')
    .option('--repository-url <url>', 'Repository URL for repo_file verification')
    .action(
      async (
        options: {
          cli: string;
          publisher: string;
          domain: string;
          evidence: string;
          method?: 'dns_txt' | 'repo_file';
          repositoryUrl?: string;
        },
        command: Command,
      ) => {
        const global = command.parent?.opts<GlobalOptions>() ?? {};
        const client = resolveClient(global);
        const data = await client.claim({
          cli_slug: options.cli,
          publisher_name: options.publisher,
          domain: options.domain,
          evidence: options.evidence,
          verification_method: options.method,
          repository_url: options.repositoryUrl,
        });
        printData('claim', data, pickOutputMode(global), global.format);
      },
    );

  program
    .command('system-prompt')
    .description('Print a ready-to-paste prompt block for agent sessions')
    .action((_options: unknown, command: Command) => {
      const global = command.parent?.opts<GlobalOptions>() ?? {};
      printData(
        'system-prompt',
        {
          prompt: systemPromptText(),
        },
        pickOutputMode(global),
        global.format,
      );
    });

  program
    .command('completion [shell]')
    .alias('completions')
    .description('Print shell completion script')
    .option('--shell <shell>', 'bash|zsh|fish')
    .action((shellArg: string | undefined, options: { shell?: string }, command: Command) => {
      const global = command.parent?.opts<GlobalOptions>() ?? {};
      const shell = resolveCompletionShell(options.shell ?? shellArg ?? 'zsh');
      const script = completionScript(shell, completionCommands(program));
      const mode = pickOutputMode(global);

      if (mode === 'json') {
        printData(
          'completion',
          {
            shell,
            script,
          },
          mode,
          global.format,
        );
        return;
      }

      console.log(script);
    });

  await program.parseAsync(process.argv);
}

run().catch((error: unknown) => {
  if (error instanceof CliError) {
    console.error(JSON.stringify(errorEnvelope(error.code, error.message, error.details), null, 2));
    process.exit(error.exitCode);
  }

  const message = error instanceof Error ? error.message : 'Unknown CLI error';
  console.error(JSON.stringify(errorEnvelope('UNEXPECTED_ERROR', message), null, 2));
  process.exit(1);
});
