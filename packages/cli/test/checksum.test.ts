import { describe, expect, it } from 'vitest';
import { checksumMatchesDigest } from '../src/checksum.js';

describe('checksum matching', () => {
  it('matches sha256-prefixed checksum values against raw digests', () => {
    expect(
      checksumMatchesDigest(
        'sha256:b6ad82ccdd4ca69e52439f00336dc0c8050166b78acb71fcc291527fd70bed08',
        'b6ad82ccdd4ca69e52439f00336dc0c8050166b78acb71fcc291527fd70bed08',
      ),
    ).toBe(true);
  });

  it('rejects mismatched digests', () => {
    expect(
      checksumMatchesDigest(
        'sha256:b6ad82ccdd4ca69e52439f00336dc0c8050166b78acb71fcc291527fd70bed08',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
    ).toBe(false);
  });
});
