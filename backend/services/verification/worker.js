import { parentPort, workerData } from 'node:worker_threads';
import { runVerification } from './runner.js';

try {
  const run = await runVerification({ world: workerData?.world ?? {} });
  parentPort.postMessage({ ok: true, run });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error?.message ?? 'verification failed' });
}
