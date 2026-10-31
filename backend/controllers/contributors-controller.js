import { assessmentQuerySchema } from '../models/schemas.js';
import { parseOrThrow } from '../utils/validate.js';
import { simulationHost } from '../services/simulation-host.js';
import {
  contributorBehavior,
  contributorSummary,
  prSummary,
  simulationMeta,
  sponsorOptions,
  starterTasksFor,
} from './helpers.js';

export function getAssessment(req, res) {
  const query = parseOrThrow(assessmentQuerySchema, req.query);
  const { project, contributor, assessment, state } = simulationHost.getAssessment(
    query.asProject,
    req.params.id,
  );
  const recentPullRequests = state.pullRequests
    .filter((pr) => pr.contributorId === contributor.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20)
    .map(prSummary);

  res.json({
    simulation: simulationMeta(state),
    contributor: contributorSummary(contributor),
    evaluatingProject: { id: project.id, name: project.name },
    assessment,
    recentPullRequests,
  });
}

const DAY = 24 * 60 * 60 * 1000;

export function getNewcomers(req, res) {
  const state = simulationHost.ensureState();
  const now = new Date(state.simulatedAt);
  const campaignMembers = new Set(
    state.campaignData.campaigns.flatMap((campaign) => campaign.memberContributorIds),
  );

  const newcomers = [];
  for (const contributor of state.contributors.values()) {
    const ageDays = Math.floor(
      (now - new Date(contributor.accountCreatedAt)) / DAY,
    );
    if (ageDays > 90) continue;
    if (campaignMembers.has(contributor.id)) continue;
    const { assessment } = simulationHost.getAssessment('p10', contributor.id);
    if (assessment.outcome !== 'normal_review') continue;
    if ((assessment.signals ?? []).length > 0) continue;

    newcomers.push({
      contributor: contributorSummary(contributor),
      accountAgeDays: ageDays,
      assessment,
      behavior: contributorBehavior(state, contributor.id),
      starterTasks: starterTasksFor(state, contributor.id),
    });
  }

  newcomers.sort((a, b) => a.contributor.handle.localeCompare(b.contributor.handle));

  res.json({
    simulation: simulationMeta(state),
    newcomers,
    sponsorOptions: sponsorOptions(state),
    sponsorAction: {
      method: 'POST',
      path: '/api/records',
      body: {
        issuerProjectId: '<selected project id>',
        subjectContributorId: '<newcomer id>',
        type: 'vouch',
        reasonCode: 'newcomer_sponsor_vouch',
        evidence: [
          {
            kind: 'note',
            ref: 'simulated sponsor vouch from dashboard',
          },
        ],
      },
      note: 'Simulated action: the backend signs this vouch with a simulated project key. Nothing is posted to a real repository.',
    },
    note: 'Neutral newcomers only: normal_review, no behavioral signals, account age at most 90 days. Unknown is not negative.',
  });
}
