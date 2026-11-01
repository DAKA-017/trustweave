import { readFileSync } from 'node:fs';
import { DEFAULT_VERIFY_WORLD, VerificationSandbox } from './sandbox.js';
import { CHECKS } from './checks.js';

const PACKAGE = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

export const VERIFICATION_VERSION = PACKAGE.version;
export { CHECKS };
export { DEFAULT_VERIFY_WORLD, VerificationSandbox };

export function checkNames() {
  return CHECKS.map(({ id, name }) => ({ id, name }));
}

function elapsed(startedAt) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

/**
 * Run every check against its own private sandbox. The shared demo world is
 * never resolved, rebuilt or written to here.
 */
export async function runVerification({
  world = {},
  checks = CHECKS,
  sandboxFactory = (params) => new VerificationSandbox(params),
} = {}) {
  const resolvedWorld = { ...DEFAULT_VERIFY_WORLD, ...world };
  const startedAt = new Date().toISOString();
  const runStart = performance.now();
  const results = [];

  for (const check of checks) {
    const checkStart = performance.now();
    let sandbox;
    try {
      sandbox = sandboxFactory(resolvedWorld);
      const outcome = await check.run({ sandbox, world: resolvedWorld });
      results.push({
        id: check.id,
        name: check.name,
        passed: true,
        details: outcome?.details ?? '',
        durationMs: elapsed(checkStart),
      });
    } catch (error) {
      results.push({
        id: check.id,
        name: check.name,
        passed: false,
        details: '',
        durationMs: elapsed(checkStart),
        error: error?.message ?? 'The check could not finish.',
      });
    } finally {
      sandbox?.dispose?.();
    }
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  return {
    version: VERIFICATION_VERSION,
    seed: resolvedWorld.seed,
    scenario: resolvedWorld.scenario,
    world: resolvedWorld,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: elapsed(runStart),
    total: results.length,
    passed,
    failed,
    results,
    ok: failed === 0,
  };
}

const NAME_WIDTH = 40;
const ID_WIDTH = 12;

export function formatResultsTable(run) {
  const lines = [];
  lines.push(
    `TrustWeave verification · seed ${run.seed} · ${run.scenario} · v${run.version} · ${run.startedAt}`,
  );
  lines.push('');
  lines.push(
    `${'ID'.padEnd(ID_WIDTH)}${'CHECK'.padEnd(NAME_WIDTH)}RESULT  DURATION`,
  );
  lines.push(`${'-'.repeat(ID_WIDTH + NAME_WIDTH + 16)}`);
  for (const result of run.results) {
    lines.push(
      `${result.id.padEnd(ID_WIDTH)}${result.name.padEnd(NAME_WIDTH)}${
        result.passed ? 'PASS' : 'FAIL'
      }    ${`${Math.round(result.durationMs)}ms`.padStart(8)}`,
    );
    if (!result.passed) {
      lines.push(`  ↳ ${result.error ?? 'no error message'}`);
    }
  }
  lines.push('');
  lines.push(`${run.passed}/${run.total} passed`);
  return lines.join('\n');
}
