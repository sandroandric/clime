import { checksumDigest } from '@cli-me/shared-types';

export type OutputMode = 'json' | 'human' | 'markdown';
const OUTPUT_SCHEMA_VERSION = '1.1.0';

function bulletList(items: string[]) {
  return items.map((item) => `- ${item}`).join('\n');
}

function normalizeChecksumDisplay(value: string | undefined) {
  return checksumDigest(value) ?? 'unavailable';
}

export function renderOutput(command: string, data: unknown, mode: OutputMode) {
  if (mode === 'json') {
    return JSON.stringify(
      {
        ok: true,
        schema_version: OUTPUT_SCHEMA_VERSION,
        command,
        data,
      },
      null,
      2,
    );
  }

  if (mode === 'markdown') {
    return renderMarkdown(command, data);
  }

  return renderHuman(command, data);
}

function renderHuman(command: string, data: unknown): string {
  if (command === 'info' && typeof data === 'object' && data !== null) {
    return renderInfoHuman(data as Record<string, unknown>);
  }

  if (command === 'search' && Array.isArray(data)) {
    return renderSearchHuman(data);
  }

  if (command === 'list' && Array.isArray(data)) {
    return renderListHuman(data);
  }

  if (command === 'which' && typeof data === 'object' && data !== null) {
    const typed = data as {
      slug?: string;
      name?: string;
      score?: number;
      install_command?: string;
    };
    return [
      `slug: ${typed.slug ?? 'unknown'}`,
      `name: ${typed.name ?? 'unknown'}`,
      `score: ${typeof typed.score === 'number' ? typed.score.toFixed(2) : '--'}`,
      `install: ${typed.install_command ?? 'unavailable'}`,
    ].join('\n');
  }

  if (command === 'install') {
    if (Array.isArray(data)) {
      return renderInstallHuman(data);
    }

    if (typeof data === 'object' && data !== null) {
      const typed = data as {
        executed?: boolean;
        binary_candidate?: string;
        binary_detected?: boolean;
        instructions?: unknown[];
      };
      const header = typed.executed
        ? `Executed install. Binary ${typed.binary_candidate ?? 'target'} ${
            typed.binary_detected ? 'detected' : 'not detected'
          }.`
        : '';
      const details = typed.instructions ? renderInstallHuman(typed.instructions) : '';
      return [header, details].filter(Boolean).join('\n\n');
    }
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return 'No results.';
    }

    const rows = data.map((entry, index) => {
      if (typeof entry === 'object' && entry !== null) {
        const named = entry as Record<string, unknown>;
        const name =
          (named.cli as { name?: string } | undefined)?.name ??
          (named.identity as { name?: string } | undefined)?.name ??
          (named.title as string | undefined) ??
          (named.label as string | undefined) ??
          (named.id as string | undefined) ??
          `item-${index + 1}`;
        const description =
          (named.reason as string | undefined) ??
          (named.description as string | undefined) ??
          JSON.stringify(entry);
        return `${index + 1}. ${name} - ${description}`;
      }
      return `${index + 1}. ${String(entry)}`;
    });

    return rows.join('\n');
  }

  if (typeof data === 'object' && data !== null) {
    const objectData = data as Record<string, unknown>;
    const lines = Object.entries(objectData).map(
      ([key, value]) => `${key}: ${JSON.stringify(value)}`,
    );
    return lines.join('\n');
  }

  return String(data);
}

function renderMarkdown(command: string, data: unknown): string {
  if (command === 'info' && typeof data === 'object' && data !== null) {
    return renderInfoMarkdown(data as Record<string, unknown>);
  }

  if (command === 'search' && Array.isArray(data)) {
    return renderSearchMarkdown(data);
  }

  if (command === 'list' && Array.isArray(data)) {
    return renderListMarkdown(data);
  }

  if (command === 'install') {
    if (Array.isArray(data)) {
      return `## install\n\n${renderInstallMarkdown(data)}`;
    }

    if (typeof data === 'object' && data !== null) {
      const typed = data as {
        executed?: boolean;
        binary_candidate?: string;
        binary_detected?: boolean;
        instructions?: unknown[];
      };
      const statusLine = typed.executed
        ? `**Executed:** \`${typed.binary_candidate ?? 'binary'}\` ${
            typed.binary_detected ? 'detected' : 'not detected'
          }.`
        : '';
      const details = typed.instructions ? renderInstallMarkdown(typed.instructions) : '';
      return `## install\n\n${[statusLine, details].filter(Boolean).join('\n\n')}`;
    }
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return `## ${command}\n\nNo results.`;
    }

    const entries = data.map((entry, index) => {
      if (typeof entry === 'object' && entry !== null) {
        const named = entry as Record<string, unknown>;
        const title =
          (named.cli as { name?: string } | undefined)?.name ??
          (named.identity as { name?: string } | undefined)?.name ??
          (named.title as string | undefined) ??
          (named.label as string | undefined) ??
          (named.id as string | undefined) ??
          `Item ${index + 1}`;
        return `### ${index + 1}. ${title}\n\n\`\`\`json\n${JSON.stringify(entry, null, 2)}\n\`\`\``;
      }
      return `- ${String(entry)}`;
    });

    return `## ${command}\n\n${entries.join('\n\n')}`;
  }

  if (typeof data === 'object' && data !== null) {
    const objectData = data as Record<string, unknown>;
    return `## ${command}\n\n${bulletList(
      Object.entries(objectData).map(([key, value]) => `**${key}**: ${JSON.stringify(value)}`),
    )}`;
  }

  return `## ${command}\n\n${String(data)}`;
}

function renderInstallHuman(data: unknown[]) {
  if (data.length === 0) {
    return 'No install instructions available.';
  }

  return data
    .map((entry, index) => {
      const item = (typeof entry === 'object' && entry !== null ? entry : {}) as {
        os?: string;
        package_manager?: string;
        command?: string;
        checksum?: string;
      };
      const checksum = normalizeChecksumDisplay(item.checksum);
      return [
        `${index + 1}. ${item.os ?? 'any'} · ${item.package_manager ?? 'unknown'}`,
        `${item.command ?? 'unknown command'}`,
        checksum === 'unavailable' ? 'hash: unavailable' : `sha256: ${checksum}`,
      ].join('\n');
    })
    .join('\n\n');
}

function renderInstallMarkdown(data: unknown[]) {
  if (data.length === 0) {
    return 'No install instructions available.';
  }

  return data
    .map((entry, index) => {
      const item = (typeof entry === 'object' && entry !== null ? entry : {}) as {
        os?: string;
        package_manager?: string;
        command?: string;
        checksum?: string;
      };
      const checksum = normalizeChecksumDisplay(item.checksum);
      return [
        `### ${index + 1}. ${item.os ?? 'any'} · ${item.package_manager ?? 'unknown'}`,
        '```bash',
        item.command ?? 'unknown command',
        '```',
        checksum === 'unavailable' ? 'hash: `unavailable`' : `sha256: \`${checksum}\``,
      ].join('\n');
    })
    .join('\n\n');
}

function renderSearchHuman(data: unknown[]) {
  if (data.length === 0) {
    return 'No results.';
  }

  const rows = data.map((entry) => {
    const item = (typeof entry === 'object' && entry !== null ? entry : {}) as {
      cli?: { name?: string; slug?: string; trust_score?: number };
      score?: number;
      install_command?: string;
      top_matching_commands?: string[];
    };
    const name = item.cli?.name ?? item.cli?.slug ?? 'unknown';
    const score = typeof item.score === 'number' ? item.score.toFixed(2) : '--';
    const trust =
      typeof item.cli?.trust_score === 'number' ? item.cli.trust_score.toFixed(1) : '--';
    const install = item.install_command ?? 'install command unavailable';
    const topCommands = Array.isArray(item.top_matching_commands)
      ? item.top_matching_commands.slice(0, 3).join(', ')
      : '';
    return [
      `${name} | score ${score} | trust ${trust}`,
      `install: ${install}`,
      topCommands ? `top commands: ${topCommands}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  return rows.join('\n\n');
}

function renderSearchMarkdown(data: unknown[]) {
  if (data.length === 0) {
    return '## search\n\nNo results.';
  }

  const blocks = data.map((entry, index) => {
    const item = (typeof entry === 'object' && entry !== null ? entry : {}) as {
      cli?: { name?: string; slug?: string; trust_score?: number };
      score?: number;
      install_command?: string;
      top_matching_commands?: string[];
    };
    const name = item.cli?.name ?? item.cli?.slug ?? 'unknown';
    const score = typeof item.score === 'number' ? item.score.toFixed(2) : '--';
    const trust =
      typeof item.cli?.trust_score === 'number' ? item.cli.trust_score.toFixed(1) : '--';
    const install = item.install_command ?? 'install command unavailable';
    const commands = Array.isArray(item.top_matching_commands)
      ? item.top_matching_commands.slice(0, 4)
      : [];
    return [
      `### ${index + 1}. ${name}`,
      `- **Score**: ${score}`,
      `- **Trust**: ${trust}`,
      `- **Install**: \`${install}\``,
      commands.length > 0
        ? `- **Top commands**: ${commands.map((command) => `\`${command}\``).join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  return `## search\n\n${blocks.join('\n\n')}`;
}

function renderListHuman(data: unknown[]) {
  if (data.length === 0) {
    return 'No results.';
  }
  return data
    .map((entry, index) => {
      const item = (typeof entry === 'object' && entry !== null ? entry : {}) as {
        identity?: {
          name?: string;
          slug?: string;
          publisher?: string;
          verification_status?: string;
          trust_score?: number;
        };
      };
      const identity = item.identity ?? {};
      return [
        `${index + 1}. ${identity.name ?? identity.slug ?? 'unknown'} (${identity.slug ?? 'unknown'})`,
        `publisher: ${identity.publisher ?? 'unknown'} | status: ${identity.verification_status ?? 'unknown'} | trust: ${
          typeof identity.trust_score === 'number' ? identity.trust_score.toFixed(1) : '--'
        }`,
      ].join('\n');
    })
    .join('\n\n');
}

function renderListMarkdown(data: unknown[]) {
  if (data.length === 0) {
    return '## list\n\nNo results.';
  }
  const blocks = data.map((entry, index) => {
    const item = (typeof entry === 'object' && entry !== null ? entry : {}) as {
      identity?: {
        name?: string;
        slug?: string;
        publisher?: string;
        verification_status?: string;
        trust_score?: number;
      };
    };
    const identity = item.identity ?? {};
    return [
      `### ${index + 1}. ${identity.name ?? identity.slug ?? 'unknown'}`,
      `- **Slug**: ${identity.slug ?? 'unknown'}`,
      `- **Publisher**: ${identity.publisher ?? 'unknown'}`,
      `- **Status**: ${identity.verification_status ?? 'unknown'}`,
      `- **Trust**: ${typeof identity.trust_score === 'number' ? identity.trust_score.toFixed(1) : '--'}`,
    ].join('\n');
  });
  return `## list\n\n${blocks.join('\n\n')}`;
}

function renderInfoHuman(data: Record<string, unknown>) {
  const identity = (data.identity as Record<string, unknown> | undefined) ?? {};
  const install = Array.isArray(data.install)
    ? (data.install as Array<Record<string, unknown>>)
    : [];
  const auth = (data.auth as Record<string, unknown> | undefined) ?? {};
  const permissionScope = Array.isArray(identity.permission_scope)
    ? (identity.permission_scope as string[])
    : [];
  const dependencies = install.flatMap((entry) =>
    Array.isArray(entry.dependencies) ? (entry.dependencies as string[]) : [],
  );
  const runtime =
    dependencies.find((item) => item.toLowerCase().includes('node')) ??
    dependencies.find((item) => item.toLowerCase().includes('python')) ??
    'Standalone / package-managed';
  const platforms = [...new Set(install.map((entry) => String(entry.os ?? 'any')))].join(', ');

  return [
    `${String(identity.name ?? 'CLI')} (${String(identity.slug ?? 'unknown')})`,
    `Publisher: ${String(identity.publisher ?? 'unknown')}`,
    `Trust score: ${Number(identity.trust_score ?? 0).toFixed(1)}`,
    `Runtime: ${runtime}`,
    `Platforms: ${platforms || 'any'}`,
    `Permissions: ${permissionScope.length > 0 ? permissionScope.join(', ') : 'none'}`,
    `Auth type: ${String(auth.auth_type ?? 'unknown')}`,
  ].join('\n');
}

function renderInfoMarkdown(data: Record<string, unknown>) {
  const identity = (data.identity as Record<string, unknown> | undefined) ?? {};
  const install = Array.isArray(data.install)
    ? (data.install as Array<Record<string, unknown>>)
    : [];
  const auth = (data.auth as Record<string, unknown> | undefined) ?? {};
  const permissionScope = Array.isArray(identity.permission_scope)
    ? (identity.permission_scope as string[])
    : [];
  const dependencies = install.flatMap((entry) =>
    Array.isArray(entry.dependencies) ? (entry.dependencies as string[]) : [],
  );
  const runtime =
    dependencies.find((item) => item.toLowerCase().includes('node')) ??
    dependencies.find((item) => item.toLowerCase().includes('python')) ??
    'Standalone / package-managed';
  const platforms = [...new Set(install.map((entry) => String(entry.os ?? 'any')))].join(', ');

  return [
    '## info',
    '',
    `### ${String(identity.name ?? 'CLI')} (${String(identity.slug ?? 'unknown')})`,
    `- **Publisher**: ${String(identity.publisher ?? 'unknown')}`,
    `- **Trust score**: ${Number(identity.trust_score ?? 0).toFixed(1)}`,
    `- **Runtime**: ${runtime}`,
    `- **Platforms**: ${platforms || 'any'}`,
    `- **Permissions**: ${permissionScope.length > 0 ? permissionScope.join(', ') : 'none'}`,
    `- **Auth type**: ${String(auth.auth_type ?? 'unknown')}`,
  ].join('\n');
}
