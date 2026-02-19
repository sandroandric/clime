import { describe, expect, it } from 'vitest';
import { renderOutput } from '../src/output.js';

describe('output rendering', () => {
  const data = [
    {
      cli: {
        name: 'Vercel CLI',
        slug: 'vercel',
        trust_score: 92.4,
      },
      score: 4.1,
      install_command: 'npm i -g vercel',
      top_matching_commands: ['vercel deploy', 'vercel env add'],
    },
  ];

  it('returns JSON envelope by default', () => {
    const output = renderOutput('search', data, 'json');
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.schema_version).toBe('1.1.0');
    expect(parsed.command).toBe('search');
    expect(parsed.data[0].cli.name).toBe('Vercel CLI');
  });

  it('renders human output', () => {
    const output = renderOutput('search', data, 'human');
    expect(output).toContain('Vercel CLI');
    expect(output).toContain('install: npm i -g vercel');
  });

  it('renders markdown output', () => {
    const output = renderOutput('search', data, 'markdown');
    expect(output).toContain('## search');
    expect(output).toContain('**Install**');
  });

  it('renders list output for human mode', () => {
    const output = renderOutput(
      'list',
      [
        {
          identity: {
            name: 'Vercel CLI',
            slug: 'vercel',
            publisher: 'Vercel',
            verification_status: 'publisher-verified',
            trust_score: 92.4,
          },
        },
      ],
      'human',
    );
    expect(output).toContain('Vercel CLI');
    expect(output).toContain('publisher: Vercel');
  });

  it('renders install hashes as unavailable when checksum is non-cryptographic', () => {
    const installOutput = renderOutput(
      'install',
      [
        {
          os: 'linux',
          package_manager: 'apt',
          command: 'sudo apt install docker.io',
          checksum: 'sha256:docker',
        },
      ],
      'human',
    );
    expect(installOutput).toContain('hash: unavailable');
    expect(installOutput).not.toContain('sha256: docker');
  });
});
