import { Worker } from 'node:worker_threads';
import { config } from '../../config/index.js';
import { runVerification } from './runner.js';
import { writeVerificationReport } from './report.js';

const WORKER_URL = new URL('./worker.js', import.meta.url);

/** Run checks in a worker so the main event loop keeps serving requests. */
export function runChecksInWorker(world) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, { workerData: { world } });
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      callback(value);
    };
    worker.once('message', (message) => {
      if (message?.ok) finish(resolve, message.run);
      else finish(reject, new Error(message?.error ?? 'verification worker failed'));
    });
    worker.once('error', (error) => finish(reject, error));
    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        finish(reject, new Error(`verification worker exited with code ${code}`));
      }
    });
  });
}

function changedChecks(previous, next) {
  if (!previous) return [];
  const before = new Map(previous.results.map((result) => [result.id, result]));
  return next.results.filter((result) => {
    const old = before.get(result.id);
    return old && old.passed !== result.passed;
  });
}

/**
 * Periodic verifier. Runs each check in its own sandbox inside a worker, keeps
 * the last N runs in memory, and logs only status changes. It never resolves or
 * mutates the request-serving demo world.
 */
export class VerifierAgent {
  constructor({
    intervalMinutes = 30,
    world = { seed: 42 },
    historySize = 20,
    executor = runChecksInWorker,
    reportWriter = writeVerificationReport,
    logger = console,
  } = {}) {
    this.intervalMinutes = intervalMinutes;
    this.world = world;
    this.historySize = historySize;
    this.executor = executor;
    this.reportWriter = reportWriter;
    this.logger = logger;
    this.history = [];
    this.running = false;
    this.timer = null;
    this.lastError = null;
  }

  get latest() {
    return this.history[0] ?? null;
  }

  get scheduled() {
    return this.timer !== null;
  }

  logChanges(previous, run, reason) {
    if (!previous) {
      this.logger.log(
        `[verifier] ${reason}: ${run.passed}/${run.total} passed in ${Math.round(run.durationMs)} ms`,
      );
      return;
    }
    const changes = changedChecks(previous, run);
    if (changes.length === 0) return;
    for (const change of changes) {
      if (change.passed) {
        this.logger.log(`[verifier] PASS again: ${change.name} (${change.id})`);
      } else {
        this.logger.error(
          `[verifier] CHECK FAILED: ${change.name} (${change.id}) — ${change.error ?? 'no error message'}`,
        );
      }
    }
    this.logger.log(
      `[verifier] ${run.passed}/${run.total} passed after change in ${Math.round(run.durationMs)} ms`,
    );
  }

  async trigger(reason = 'schedule') {
    if (this.running) return null;
    this.running = true;
    const previous = this.latest;
    try {
      const run = await this.executor(this.world);
      this.history.unshift(run);
      if (this.history.length > this.historySize) {
        this.history.length = this.historySize;
      }
      this.lastError = null;
      try {
        this.reportWriter(run);
      } catch (error) {
        this.lastError = `report write failed: ${error.message}`;
        this.logger.error(`[verifier] could not write report: ${error.message}`);
      }
      this.logChanges(previous, run, reason);
      return run;
    } catch (error) {
      this.lastError = error?.message ?? 'verification failed';
      this.logger.error(`[verifier] run failed: ${this.lastError}`);
      return null;
    } finally {
      this.running = false;
    }
  }

  start({ runNow = false } = {}) {
    if (this.timer) return;
    if (runNow) this.trigger('startup');
    if (this.intervalMinutes <= 0) return;
    this.timer = setInterval(() => {
      this.trigger('schedule');
    }, this.intervalMinutes * 60_000);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  summary() {
    return {
      running: this.running,
      scheduled: this.scheduled,
      intervalMinutes: this.intervalMinutes,
      historySize: this.history.length,
      lastError: this.lastError,
      latest: this.latest,
    };
  }
}

export const verificationAgent = new VerifierAgent({
  intervalMinutes: config.verifyIntervalMinutes,
  world: { seed: config.simSeed },
});

export { runVerification };
