import { createPrivateKey, sign } from 'node:crypto';
import { config } from '../../config/index.js';

const API_VERSION = '2022-11-28';
const USER_AGENT = 'trustweave-github-app';
const TOKEN_SKEW_MS = 60_000;
// GitHub caps an app JWT at 10 minutes; 9 minutes leaves room for clock drift.
const JWT_TTL_SECONDS = 540;

const tokenCache = new Map();

export class GithubApiError extends Error {
  constructor(message, { status = 0, code = 'GITHUB_API_ERROR' } = {}) {
    super(message);
    this.name = 'GithubApiError';
    this.status = status;
    this.code = code;
  }
}

const base64url = (value) => Buffer.from(value).toString('base64url');

export function createAppJwt({
  appId = config.github.appId,
  privateKey = config.github.privateKey,
  now = Date.now(),
} = {}) {
  if (!appId || !privateKey) {
    throw new GithubApiError('GitHub App credentials are not configured.', {
      code: 'GITHUB_NOT_CONFIGURED',
    });
  }

  const issuedAt = Math.floor(now / 1000) - 60;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iat: issuedAt,
      exp: issuedAt + JWT_TTL_SECONDS,
      iss: String(appId),
    }),
  );
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    createPrivateKey(privateKey),
  ).toString('base64url');

  return `${header}.${payload}.${signature}`;
}

export async function getInstallationToken(
  installationId,
  { fetchImpl = fetch, now = Date.now() } = {},
) {
  const key = String(installationId);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - TOKEN_SKEW_MS > now) return cached.token;

  const response = await fetchImpl(
    `${config.github.apiBaseUrl}/app/installations/${encodeURIComponent(key)}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${createAppJwt({ now })}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        'User-Agent': USER_AGENT,
      },
    },
  );

  if (!response.ok) {
    throw new GithubApiError(
      `GitHub rejected the installation token request (${response.status}).`,
      { status: response.status, code: 'INSTALLATION_TOKEN_FAILED' },
    );
  }

  const data = await response.json();
  const expiresAt = Date.parse(data.expires_at);
  tokenCache.set(key, {
    token: data.token,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : now + 50 * 60_000,
  });
  return data.token;
}

export function resetTokenCache() {
  tokenCache.clear();
}

async function performRequest(token, path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${config.github.apiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': USER_AGENT,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const detail = data?.message ? `: ${data.message}` : '.';
    throw new GithubApiError(`GitHub API ${response.status}${detail}`, {
      status: response.status,
    });
  }

  return data;
}

export async function githubRequest(
  path,
  { installationId, fetchImpl = fetch, now = Date.now(), ...options } = {},
) {
  const token = await getInstallationToken(installationId, { fetchImpl, now });
  return performRequest(token, path, { ...options, fetchImpl });
}

/** App-level lookup: confirms an installation belongs to this GitHub App. */
export async function getAppInstallation(
  installationId,
  { fetchImpl = fetch, now = Date.now() } = {},
) {
  return performRequest(
    createAppJwt({ now }),
    `/app/installations/${encodeURIComponent(String(installationId))}`,
    { fetchImpl },
  );
}
