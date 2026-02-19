#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(THIS_DIR, '../..');

const interval = (envKey, fallbackSeconds) => {
  const raw = Number(process.env[envKey] ?? fallbackSeconds);
  if (!Number.isFinite(raw) || raw <= 0) {
    return fallbackSeconds * 1000;
  }
  return Math.trunc(raw * 1000);
};

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const checksumRefreshEnabled =
  (process.env.CLIME_CHECKSUM_REFRESH_ENABLED ?? 'true').trim().toLowerCase() !== 'false';

const workerConfig = {
  indexer: {
    script: resolve(ROOT_DIR, 'workers/indexer/dist/index.js'),
    intervalMs: interval('CLIME_INDEXER_INTERVAL_SECONDS', 21600),
  },
  verifier: {
    script: resolve(ROOT_DIR, 'workers/verifier/dist/index.js'),
    intervalMs: interval('CLIME_VERIFIER_INTERVAL_SECONDS', 86400),
  },
  analytics: {
    script: resolve(ROOT_DIR, 'workers/analytics/dist/index.js'),
    intervalMs: interval('CLIME_ANALYTICS_INTERVAL_SECONDS', 21600),
  },
  checksums: {
    script: resolve(ROOT_DIR, 'apps/api/dist/scripts/refresh-checksums.js'),
    intervalMs: interval('CLIME_CHECKSUM_REFRESH_INTERVAL_SECONDS', 86400),
    enabledInAll: hasDatabaseUrl && checksumRefreshEnabled,
  },
};

const mode = (process.env.WORKER_MODE ?? 'all').trim().toLowerCase();
const runOnce = (process.env.WORKER_RUN_ONCE ?? 'false').trim().toLowerCase() === 'true';

const selectedWorkers = (() => {
  if (mode === 'all') {
    const autoSelected = Object.keys(workerConfig).filter(
      (worker) => workerConfig[worker].enabledInAll !== false,
    );
    const skipped = Object.keys(workerConfig).filter((worker) => !autoSelected.includes(worker));
    if (skipped.length > 0) {
      console.log(
        `[workers] skipping ${skipped.join(', ')} in WORKER_MODE=all (disabled by env/runtime).`,
      );
    }
    return autoSelected;
  }

  const parsed = mode
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set(parsed)];
})();

if (selectedWorkers.length === 0) {
  console.error(`Invalid WORKER_MODE: '${mode}'.`);
  process.exit(1);
}

for (const worker of selectedWorkers) {
  if (!(worker in workerConfig)) {
    console.error(
      `Unsupported worker '${worker}'. Expected one of: ${Object.keys(workerConfig).join(', ')}.`,
    );
    process.exit(1);
  }
}

const running = new Set();

const runWorker = (worker) =>
  new Promise((resolvePromise, rejectPromise) => {
    const config = workerConfig[worker];
    const child = spawn(process.execPath, [config.script], {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', (error) => {
      rejectPromise(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${worker} exited with code ${code ?? 'unknown'}`));
    });
  });

async function runWorkerSafe(worker) {
  if (running.has(worker)) {
    return;
  }

  running.add(worker);
  try {
    await runWorker(worker);
    console.log(`[workers] ${worker} run completed.`);
  } catch (error) {
    console.error(`[workers] ${worker} run failed:`, error);
  } finally {
    running.delete(worker);
  }
}

async function main() {
  for (const worker of selectedWorkers) {
    await runWorkerSafe(worker);
  }

  if (runOnce) {
    return;
  }

  for (const worker of selectedWorkers) {
    const { intervalMs } = workerConfig[worker];
    setInterval(() => {
      void runWorkerSafe(worker);
    }, intervalMs);
  }

  console.log(
    `[workers] scheduler started for ${selectedWorkers.join(', ')} (mode=${mode}, runOnce=${runOnce}).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
