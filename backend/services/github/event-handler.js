import { assessPullRequest } from './ingest.js';
import {
  completeCheckRun,
  createCheckRun,
  formatAssessment,
} from './check-run.js';

const HANDLED_ACTIONS = new Set([
  'opened',
  'synchronize',
  'reopened',
  'ready_for_review',
]);

export function isHandledPullRequestEvent(payload) {
  return (
    HANDLED_ACTIONS.has(payload?.action) &&
    Boolean(payload?.installation?.id) &&
    Boolean(payload?.repository?.owner?.login) &&
    Boolean(payload?.repository?.name) &&
    Boolean(payload?.pull_request?.head?.sha) &&
    Boolean(payload?.pull_request?.user?.login)
  );
}

export async function processPullRequestEvent(payload, { fetchImpl } = {}) {
  const installationId = payload.installation.id;
  const owner = payload.repository.owner.login;
  const name = payload.repository.name;
  const pullRequest = payload.pull_request;
  const target = {
    installationId,
    owner,
    name,
    headSha: pullRequest.head.sha,
    fetchImpl,
  };

  if (pullRequest.draft) {
    const checkRun = await createCheckRun(target);
    await completeCheckRun({
      ...target,
      checkRunId: checkRun.id,
      conclusion: 'neutral',
      title: 'Draft pull request',
      summary: 'TrustWeave runs when the pull request is ready for review.',
    });
    return { checkRunId: checkRun.id, report: null };
  }

  const checkRun = await createCheckRun(target);
  try {
    const assessment = await assessPullRequest({
      installationId,
      owner,
      name,
      author: pullRequest.user.login,
      fetchImpl,
    });
    const report = formatAssessment(assessment);
    await completeCheckRun({ ...target, checkRunId: checkRun.id, ...report });
    return { checkRunId: checkRun.id, report };
  } catch (error) {
    console.error(
      `[trustweave] GitHub check failed for ${owner}/${name}#${pullRequest.number}: ${error.message}`,
    );
    await completeCheckRun({
      ...target,
      checkRunId: checkRun.id,
      conclusion: 'neutral',
      title: 'TrustWeave could not complete this check',
      summary: 'The behavioral check did not finish. No action is required.',
    }).catch((completeError) => {
      console.error(
        `[trustweave] Could not close GitHub check run ${checkRun.id}: ${completeError.message}`,
      );
    });
    return { checkRunId: checkRun.id, report: null };
  }
}
