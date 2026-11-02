import express, { Router } from 'express';
import { config } from '../config/index.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { verifyGithubSignature } from '../middleware/verify-github-signature.js';
import { getAppInstallation } from '../services/github/app-auth.js';
import {
  isHandledPullRequestEvent,
  processPullRequestEvent,
} from '../services/github/event-handler.js';
import { renderSetupPage } from '../services/github/setup-page.js';

const MAX_DELIVERIES = 5_000;
const DELIVERY_TTL_MS = 60 * 60 * 1000;

const deliveries = new Map();
let tail = Promise.resolve();

function rememberDelivery(id, now) {
  for (const [key, at] of deliveries) {
    if (now - at > DELIVERY_TTL_MS) deliveries.delete(key);
    else break;
  }
  if (deliveries.size >= MAX_DELIVERIES) {
    const oldest = deliveries.keys().next().value;
    if (oldest !== undefined) deliveries.delete(oldest);
  }
  deliveries.set(id, now);
}

function parseWebhookBody(req, res, next) {
  if (!Buffer.isBuffer(req.body)) {
    return res.status(415).json({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'GitHub webhooks must be sent as application/json.',
      },
    });
  }
  try {
    req.webhook = JSON.parse(req.body.toString('utf8') || '{}');
  } catch {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Webhook body must be valid JSON.' },
    });
  }
  return next();
}

export const githubRouter = Router();
const limitSetup = rateLimit({ max: 10 });

// The App's "Setup URL". GitHub redirects here after installation so the
// maintainer lands on a real page instead of a JSON endpoint.
githubRouter.get('/setup', limitSetup, async (req, res) => {
  if (!config.github.configured) {
    return res.status(503).json({
      error: {
        code: 'GITHUB_NOT_CONFIGURED',
        message: 'GitHub App webhooks are not configured.',
      },
    });
  }

  const installationId =
    typeof req.query.installation_id === 'string' ? req.query.installation_id : '';
  if (!/^\d{1,20}$/.test(installationId)) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'installation_id must be a numeric installation id.',
      },
    });
  }

  let installation = null;
  try {
    installation = await getAppInstallation(installationId);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        error: {
          code: 'UNKNOWN_INSTALLATION',
          message: 'That installation does not belong to this app.',
        },
      });
    }
    // The install itself still succeeded; fall back to a generic confirmation.
  }

  const payload = {
    installed: true,
    installationId,
    account: installation?.account?.login ?? null,
    repositorySelection: installation?.repository_selection ?? null,
  };

  res.set('Cache-Control', 'no-store');
  res.set('Vary', 'Accept');
  if (req.accepts(['html', 'json']) === 'json') return res.json(payload);

  res.set(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  );
  res.set('X-Content-Type-Options', 'nosniff');
  return res.type('html').send(
    renderSetupPage({
      ...payload,
      dashboardUrl: `${config.frontendOrigin}/network`,
    }),
  );
});

githubRouter.post(
  '/webhook',
  // Mounted before express.json() in app.js so the signed bytes stay intact.
  express.raw({ type: 'application/json', limit: '25mb' }),
  verifyGithubSignature(),
  parseWebhookBody,
  (req, res) => {
    const event = req.get('x-github-event') ?? 'unknown';
    const delivery = req.get('x-github-delivery') ?? '';

    if (event === 'ping') return res.status(200).json({ ok: true });

    if (event === 'installation' || event === 'installation_repositories') {
      return res.status(202).json({ accepted: true, event });
    }

    if (event !== 'pull_request' || !isHandledPullRequestEvent(req.webhook)) {
      return res.status(202).json({ accepted: true, event, ignored: true });
    }

    if (delivery && deliveries.has(delivery)) {
      return res.status(202).json({ accepted: true, event, duplicate: true });
    }
    if (delivery) rememberDelivery(delivery, Date.now());

    res.status(202).json({ accepted: true, event });

    // One job at a time keeps GitHub API usage predictable; failures are
    // reported through the check run and never crash the process.
    const payload = req.webhook;
    tail = tail
      .then(() => processPullRequestEvent(payload))
      .catch((error) => {
        console.error(
          `[trustweave] GitHub webhook processing failed: ${error.message}`,
        );
      });
    return undefined;
  },
);

export function drainGithubQueue() {
  return tail;
}

export function resetGithubWebhookState() {
  deliveries.clear();
  tail = Promise.resolve();
}
