import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REPORTS_DIR = fileURLToPath(
  new URL('../../reports/', import.meta.url),
);

function markdownTable(run) {
  const rows = [
    '| Check | Result | Duration | Details |',
    '| --- | --- | ---: | --- |',
    ...run.results.map((result) => {
      const detail = result.passed
        ? result.details.replaceAll('|', '\\|')
        : `**${result.error ?? 'failed'}**`;
      return `| ${result.name} | ${result.passed ? 'PASS' : 'FAIL'} | ${Math.round(
        result.durationMs,
      )} ms | ${detail.replaceAll('\n', ' ')} |`;
    }),
  ];
  return rows.join('\n');
}

function markdownReport(run) {
  return [
    '# TrustWeave verification report',
    '',
    `- Generated: ${run.finishedAt}`,
    `- Version: ${run.version}`,
    `- Seed: ${run.seed} (${run.scenario})`,
    `- Result: ${run.passed}/${run.total} passed in ${Math.round(run.durationMs)} ms`,
    '',
    markdownTable(run),
    '',
    `Report files are written by the backend verifier and git-ignored.`,
    '',
  ].join('\n');
}

export function writeVerificationReport(run) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const jsonPath = `${REPORTS_DIR}verification-latest.json`;
  const mdPath = `${REPORTS_DIR}verification-latest.md`;
  writeFileSync(jsonPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  writeFileSync(mdPath, markdownReport(run), 'utf8');
  return { jsonPath, mdPath };
}
