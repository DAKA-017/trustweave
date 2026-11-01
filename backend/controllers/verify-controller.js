import { timingSafeEqual } from 'node:crypto';
import { config } from '../config/index.js';
import { verificationAgent } from '../services/verification/agent.js';
import { ApiError } from '../utils/errors.js';

function tokenMatches(provided, expected) {
  const given = Buffer.from(provided ?? '');
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

function agentStatus() {
  return {
    enabled: config.verifyIntervalMinutes > 0,
    intervalMinutes: config.verifyIntervalMinutes,
    scheduled: verificationAgent.scheduled,
    running: verificationAgent.running,
    lastError: verificationAgent.lastError,
    count: verificationAgent.history.length,
  };
}

export function getVerifyLatest(req, res) {
  res.json({
    latest: verificationAgent.latest,
    ...agentStatus(),
  });
}

export function getVerifyHistory(req, res) {
  res.json({
    history: verificationAgent.history,
    ...agentStatus(),
  });
}

export async function postVerifyRun(req, res) {
  if (!config.verifyToken) {
    throw new ApiError(
      403,
      'VERIFY_TOKEN_REQUIRED',
      'POST /api/verify/run is disabled until VERIFY_TOKEN is set in backend/.env.',
    );
  }
  if (!tokenMatches(req.get('x-verify-token'), config.verifyToken)) {
    throw new ApiError(403, 'FORBIDDEN', 'A valid X-Verify-Token header is required.');
  }
  const run = await verificationAgent.trigger('api');
  if (!run) {
    throw new ApiError(
      503,
      'VERIFY_BUSY',
      verificationAgent.lastError ?? 'A verification run is already in progress.',
    );
  }
  res.json({ run, ...agentStatus() });
}
