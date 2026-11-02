import { githubRequest } from './app-auth.js';

export const CHECK_NAME = 'TrustWeave';

const MAX_TITLE = 255;
const MAX_BODY = 60_000;
const MAX_EVIDENCE_LINES = 10;

const truncate = (value, limit) =>
  value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;

const repoPath = (owner, name) =>
  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

export async function createCheckRun({
  installationId,
  owner,
  name,
  headSha,
  fetchImpl,
  now = new Date(),
}) {
  return githubRequest(`${repoPath(owner, name)}/check-runs`, {
    installationId,
    method: 'POST',
    fetchImpl,
    body: {
      name: CHECK_NAME,
      head_sha: headSha,
      status: 'in_progress',
      started_at: now.toISOString(),
      output: {
        title: 'Reading recent pull requests…',
        summary: 'Looking for behavioral signals across this installation.',
      },
    },
  });
}

export async function completeCheckRun({
  installationId,
  owner,
  name,
  checkRunId,
  conclusion,
  title,
  summary,
  text = '',
  detailsUrl,
  fetchImpl,
  now = new Date(),
}) {
  return githubRequest(
    `${repoPath(owner, name)}/check-runs/${encodeURIComponent(String(checkRunId))}`,
    {
      installationId,
      method: 'PATCH',
      fetchImpl,
      body: {
        status: 'completed',
        conclusion,
        completed_at: now.toISOString(),
        ...(detailsUrl ? { details_url: detailsUrl } : {}),
        output: {
          title: truncate(title, MAX_TITLE),
          summary: truncate(summary, MAX_BODY),
          text: truncate(text, MAX_BODY),
        },
      },
    },
  );
}

function evidenceLines(campaign, pullRequestsById) {
  return campaign.evidence.slice(0, MAX_EVIDENCE_LINES).map((ref) => {
    const pullRequest = pullRequestsById.get(ref.id);
    if (!pullRequest?.url) return `- \`${ref.id}\``;
    const repo = String(ref.projectId ?? '').replace(/^github:/, '') || 'repository';
    return `- [${repo}#${pullRequest.number}](${pullRequest.url})`;
  });
}

function signalLines(signals) {
  return signals.map((signal) => `- \`${signal.type}\` — ${signal.description}`);
}

/**
 * Produces an advisory check result. A finding never becomes a failing check:
 * the conclusion is `action_required` and a maintainer still decides.
 */
export function formatAssessment(assessment) {
  const { author, campaign, signals, counts, pullRequestsById } = assessment;
  const scope = `${counts.pullRequests} pull requests across ${counts.repositories} repositories (last ${counts.lookbackDays} days)`;

  if (!campaign) {
    const summary = `Checked ${scope} for @${author}. No campaign-level pattern reached the detector's thresholds.`;
    const text =
      signals.length > 0
        ? [
            `${signals.length} behavioral signal${signals.length === 1 ? ' is' : 's are'} present, but no campaign links this account to others. TrustWeave does not flag an isolated account on signals alone.`,
            '',
            ...signalLines(signals),
            '',
            'Advisory only — no merge is blocked.',
          ].join('\n')
        : 'Advisory only — no merge is blocked.';
    return {
      conclusion: 'neutral',
      title: 'No coordinated pattern found',
      summary,
      text,
    };
  }

  const text = [
    `Part of \`${campaign.id}\` — ${campaign.memberContributorIds.length} accounts across ${campaign.affectedProjectIds.length} repositories, confidence **${campaign.confidence.label}**.`,
    '',
    ...campaign.signalsFired.map(
      (signal) =>
        `- \`${signal.type}\` — ${signal.description}`,
    ),
    '',
    'Evidence:',
    ...evidenceLines(campaign, pullRequestsById),
    '',
    'Advisory only — a maintainer decides; no merge is blocked.',
  ].join('\n');

  return {
    conclusion: 'action_required',
    title: `${campaign.signalsFired.length} behavioral signals on @${author}`,
    summary: `Possibly coordinated with ${campaign.memberContributorIds.length - 1} other account(s) across ${campaign.affectedProjectIds.length} repositories.`,
    text,
  };
}
