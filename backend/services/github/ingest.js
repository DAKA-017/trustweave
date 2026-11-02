import { config } from '../../config/index.js';
import { detectCampaigns } from '../campaign-detector.js';
import { githubRequest } from './app-auth.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const AGE_CACHE_TTL_MS = DAY_MS;
const AGE_CACHE_LIMIT = 5_000;
// Only the first page of a repository's most recently updated PRs is scanned,
// which bounds both API calls and detector work per webhook.
const MAX_PAGES_PER_REPOSITORY = 3;
const PAGE_SIZE = 100;

const ageCache = new Map();

export function projectIdForRepo(repository) {
  return `github:${repository.fullName.toLowerCase()}`;
}

export async function listInstallationRepositories(installationId, { fetchImpl } = {}) {
  const data = await githubRequest('/installation/repositories?per_page=100', {
    installationId,
    fetchImpl,
  });
  const repositories = Array.isArray(data?.repositories) ? data.repositories : [];
  return repositories
    .filter((repo) => !repo.archived && !repo.disabled)
    .slice(0, config.github.maxRepositories)
    .map((repo) => ({
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
    }));
}

export async function listRecentPullRequests({
  installationId,
  owner,
  name,
  since,
  fetchImpl,
} = {}) {
  const pullRequests = [];
  for (let page = 1; page <= MAX_PAGES_PER_REPOSITORY; page += 1) {
    const query = new URLSearchParams({
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: String(PAGE_SIZE),
      page: String(page),
    });
    const data = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls?${query}`,
      { installationId, fetchImpl },
    );
    if (!Array.isArray(data) || data.length === 0) break;

    let reachedLookback = false;
    for (const pullRequest of data) {
      const updatedAt = Date.parse(
        pullRequest.updated_at ?? pullRequest.created_at,
      );
      if (Number.isFinite(updatedAt) && updatedAt < since) {
        reachedLookback = true;
        break;
      }
      if (pullRequest.user?.type === 'Bot') continue;
      pullRequests.push(pullRequest);
      if (pullRequests.length >= config.github.maxPullRequestsPerRepository) {
        return pullRequests;
      }
    }

    if (reachedLookback || data.length < PAGE_SIZE) break;
  }
  return pullRequests;
}

function normalizePullRequest(repository, pullRequest) {
  return {
    id: `${projectIdForRepo(repository)}#${pullRequest.number}`,
    number: pullRequest.number,
    url: pullRequest.html_url,
    projectId: projectIdForRepo(repository),
    contributorId: pullRequest.user?.login ?? 'ghost',
    createdAt: pullRequest.created_at,
    outcome: pullRequest.merged_at
      ? 'merged'
      : pullRequest.state === 'closed'
        ? 'closed'
        : 'open',
    contentSample: `${pullRequest.title ?? ''}\n\n${pullRequest.body ?? ''}`
      .trim()
      .slice(0, 4_000),
    changedPathsSummary: '',
    size: pullRequest.additions ?? 0,
  };
}

async function loadAccountAges({ installationId, logins, fetchImpl, now = Date.now() }) {
  const ages = new Map();
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const unique = [...new Set(logins)].slice(0, config.github.maxUserLookups);

  for (const login of unique) {
    const cached = ageCache.get(login);
    if (cached && cached.expiresAt > nowMs) {
      ages.set(login, cached.createdAt);
      continue;
    }
    try {
      const user = await githubRequest(`/users/${encodeURIComponent(login)}`, {
        installationId,
        fetchImpl,
      });
      if (!user?.created_at) continue;
      if (ageCache.size >= AGE_CACHE_LIMIT) {
        const oldest = ageCache.keys().next().value;
        if (oldest !== undefined) ageCache.delete(oldest);
      }
      ageCache.set(login, {
        createdAt: user.created_at,
        expiresAt: nowMs + AGE_CACHE_TTL_MS,
      });
      ages.set(login, user.created_at);
    } catch {
      // An unknown account age only disables the new-accounts signal.
    }
  }
  return ages;
}

export function resetIngestCache() {
  ageCache.clear();
}

/**
 * Reads recent pull request metadata for every repository in the installation,
 * maps it into the detector's world shape, and assesses one author.
 */
export async function assessPullRequest({
  installationId,
  owner,
  name,
  author,
  fetchImpl,
  now = new Date(),
} = {}) {
  const since = now.getTime() - config.github.lookbackDays * DAY_MS;
  let repositories = [];
  try {
    repositories = await listInstallationRepositories(installationId, { fetchImpl });
  } catch {
    // Listing can fail for repository-scoped installations; the target repo
    // is always known from the webhook itself.
  }
  const target = { owner, name, fullName: `${owner}/${name}` };
  if (
    !repositories.some(
      (repo) => repo.fullName.toLowerCase() === target.fullName.toLowerCase(),
    )
  ) {
    repositories.unshift(target);
  }

  const pullRequests = [];
  for (const repository of repositories) {
    try {
      const recent = await listRecentPullRequests({
        installationId,
        owner: repository.owner,
        name: repository.name,
        since,
        fetchImpl,
      });
      for (const pullRequest of recent) {
        pullRequests.push(normalizePullRequest(repository, pullRequest));
      }
    } catch {
      // One unreadable repository must not fail the whole check.
    }
  }

  const projects = new Map(
    repositories.map((repository) => {
      const id = projectIdForRepo(repository);
      return [id, { id, name: repository.fullName, maintainerIds: [] }];
    }),
  );

  const contributors = new Map();
  const ages = await loadAccountAges({
    installationId,
    logins: [author, ...pullRequests.map((pr) => pr.contributorId)],
    fetchImpl,
    now,
  });
  for (const [login, createdAt] of ages) {
    contributors.set(login, { id: login, handle: login, accountCreatedAt: createdAt });
  }

  const result = detectCampaigns({
    projects,
    contributors,
    pullRequests,
    snapshot: { activeRecords: [] },
    now,
  });

  return {
    author,
    campaign:
      result.campaigns.find((campaign) =>
        campaign.memberContributorIds.includes(author),
      ) ?? null,
    signals: result.signalsByContributor[author] ?? [],
    counts: {
      repositories: projects.size,
      pullRequests: pullRequests.length,
      lookbackDays: config.github.lookbackDays,
    },
    pullRequestsById: new Map(pullRequests.map((pr) => [pr.id, pr])),
  };
}
