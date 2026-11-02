import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config/index.js';

const SIGNATURE_HEADER = 'x-hub-signature-256';

function reject(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

/**
 * GitHub signs the exact request bytes, so `req.body` must still be the raw
 * Buffer produced by express.raw() when this runs.
 */
export function verifyGithubSignature({ secret = config.github.webhookSecret } = {}) {
  return function githubSignature(req, res, next) {
    if (!secret) {
      return reject(
        res,
        503,
        'GITHUB_NOT_CONFIGURED',
        'GitHub App webhooks are not configured.',
      );
    }

    const received = req.get(SIGNATURE_HEADER);
    if (!received || !Buffer.isBuffer(req.body)) {
      return reject(
        res,
        401,
        'MISSING_SIGNATURE',
        'A signed raw body is required.',
      );
    }

    const expected = `sha256=${createHmac('sha256', secret)
      .update(req.body)
      .digest('hex')}`;
    const provided = received.trim().toLowerCase();
    const matches =
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

    if (!matches) {
      return reject(res, 401, 'INVALID_SIGNATURE', 'Webhook signature is invalid.');
    }

    return next();
  };
}
