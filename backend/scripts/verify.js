import { relative } from 'node:path';
import { config } from '../config/index.js';
import {
  formatResultsTable,
  runVerification,
  writeVerificationReport,
} from '../services/verification/index.js';

const run = await runVerification({ world: { seed: config.simSeed } });
console.log(formatResultsTable(run));

let reportLine = 'Report not written.';
try {
  const { jsonPath, mdPath } = writeVerificationReport(run);
  reportLine = `Report: ${relative(process.cwd(), jsonPath)} and ${relative(
    process.cwd(),
    mdPath,
  )}`;
} catch (error) {
  reportLine = `Report could not be written: ${error.message}`;
}
console.log(reportLine);

process.exitCode = run.ok ? 0 : 1;
