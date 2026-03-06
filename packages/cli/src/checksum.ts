import { checksumDigest, normalizeSha256Checksum } from '@cli-me/shared-types';

export function checksumMatchesDigest(
  expectedChecksum: string | undefined | null,
  actualDigest: string | undefined | null,
): boolean {
  const normalizedChecksum = normalizeSha256Checksum(expectedChecksum);
  const expectedDigest = checksumDigest(normalizedChecksum);
  const normalizedDigest = actualDigest?.trim().toLowerCase();

  if (!expectedDigest || !normalizedDigest) {
    return false;
  }

  return expectedDigest === normalizedDigest;
}
