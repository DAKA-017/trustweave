import { sha256 } from '../utils/crypto.js';
import { computeEffectiveTrust, evaluateContributor } from '../services/trust-engine.js';

const OUTCOME_ORDER = { flagged: 0, caution: 1, normal_review: 2 };
const DAY = 24 * 60 * 60 * 1000;

export function simulationMeta(state) {
  return {
    mode: state.mode,
    authority: state.authority,
    seed: state.seed,
    size: state.size,
    campaignSize: state.campaignSize,
    scenario: state.scenario,
    simulatedAt: state.simulatedAt,
    counts: state.counts,
    note: state.note,
  };
}

export function contributorSummary(contributor) {
  return {
    id: contributor.id,
    handle: contributor.handle,
    accountCreatedAt: contributor.accountCreatedAt,
  };
}

export function prSummary(pr) {
  return {
    id: pr.id,
    projectId: pr.projectId,
    contributorId: pr.contributorId,
    createdAt: pr.createdAt,
    outcome: pr.outcome,
    size: pr.size,
    changedPathsSummary: pr.changedPathsSummary,
    contentFingerprint: pr.contentFingerprint,
    contentSample: pr.contentSample,
  };
}

export function projectSummary(state, project, { includeKey = false } = {}) {
  const log = state.records.getLog(project.id);
  const verification = state.snapshot.verificationFor(project.id);
  const projectPrs = state.pullRequests.filter((pr) => pr.projectId === project.id);
  const contributorsWithPrs = new Set(projectPrs.map((pr) => pr.contributorId));
  return {
    id: project.id,
    name: project.name,
    publicKeyFingerprint: sha256(project.publicKey).slice(0, 24),
    ...(includeKey ? { publicKey: project.publicKey } : {}),
    maintainers: project.maintainerIds.map((id) => {
      const contributor = state.contributors.get(id);
      return contributor ? contributorSummary(contributor) : { id, handle: id };
    }),
    trustConfig: Object.entries(project.trustConfig)
      .map(([projectId, weight]) => ({
        projectId,
        name: state.projects.get(projectId)?.name ?? projectId,
        weight,
      }))
      .sort((a, b) => b.weight - a.weight || a.projectId.localeCompare(b.projectId)),
    thresholds: project.thresholds,
    counts: {
      records: log.length,
      activeRecords: verification?.counts.active ?? 0,
      invalidRecords: verification?.counts.invalid ?? 0,
      expiredRecords: verification?.counts.expired ?? 0,
      revokedRecords: verification?.counts.revoked ?? 0,
      pullRequests: projectPrs.length,
      contributors: contributorsWithPrs.size,
    },
  };
}

export function effectiveTrustList(state, project) {
  const trust = computeEffectiveTrust(project, state.projects);
  return [...trust.entries()]
    .filter(([projectId]) => projectId !== project.id)
    .map(([projectId, weight]) => ({
      projectId,
      name: state.projects.get(projectId)?.name ?? projectId,
      weight: Math.round(weight * 1000) / 1000,
      directWeight: project.trustConfig[projectId] ?? null,
    }))
    .sort((a, b) => b.weight - a.weight || a.projectId.localeCompare(b.projectId));
}

export function incomingAssessments(state, projectId) {
  const project = state.projects.get(projectId);
  const prs = state.pullRequests
    .filter((pr) => pr.projectId === projectId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const byContributor = new Map();
  for (const pr of prs) {
    if (!byContributor.has(pr.contributorId)) byContributor.set(pr.contributorId, []);
    byContributor.get(pr.contributorId).push(pr);
  }

  const items = [];
  for (const [contributorId, contributorPrs] of byContributor) {
    const contributor = state.contributors.get(contributorId);
    if (!contributor) continue;
    const assessment = evaluateContributor({
      evaluatingProject: project,
      contributorId,
      projects: state.projects,
      contributors: state.contributors,
      snapshot: state.snapshot,
      campaignData: state.campaignData,
      pullRequests: state.pullRequests,
      now: new Date(state.simulatedAt),
      trustCache: state.trustCache,
      clusterCache: state.clusterCache,
    });
    items.push({
      contributor: contributorSummary(contributor),
      pullRequests: contributorPrs.map(prSummary),
      assessment,
    });
  }

  items.sort(
    (a, b) =>
      OUTCOME_ORDER[a.assessment.outcome] - OUTCOME_ORDER[b.assessment.outcome] ||
      a.contributor.handle.localeCompare(b.contributor.handle),
  );

  const summary = {
    contributors: items.length,
    pullRequests: prs.length,
    openPullRequests: prs.filter((pr) => pr.outcome === 'open').length,
    byOutcome: {
      normal_review: items.filter((item) => item.assessment.outcome === 'normal_review').length,
      caution: items.filter((item) => item.assessment.outcome === 'caution').length,
      flagged: items.filter((item) => item.assessment.outcome === 'flagged').length,
    },
  };

  return { items, summary };
}

export function contributorBehavior(state, contributorId) {
  const prs = state.pullRequests.filter((pr) => pr.contributorId === contributorId);
  const contributor = state.contributors.get(contributorId);
  const ageDays = contributor
    ? Math.floor((new Date(state.simulatedAt) - new Date(contributor.accountCreatedAt)) / DAY)
    : null;
  return {
    submissions: prs.length,
    projects: new Set(prs.map((pr) => pr.projectId)).size,
    merged: prs.filter((pr) => pr.outcome === 'merged').length,
    mergeRate: prs.length > 0 ? Math.round((prs.filter((pr) => pr.outcome === 'merged').length / prs.length) * 100) / 100 : null,
    accountAgeDays: ageDays,
    signalTypes: (state.campaignData.signalsByContributor[contributorId] ?? []).map(
      (signal) => signal.type,
    ),
    recentPrIds: prs.slice(0, 8).map((pr) => pr.id),
  };
}

const STARTER_TASK_TEMPLATES = [
  (projectName) => `Add a regression test for the ${projectName} retry path`,
  (projectName) => `Document an edge case in ${projectName}`,
  (projectName) => `Triage a good-first-issue in ${projectName}`,
  (projectName) => `Improve an error message in ${projectName}`,
  (projectName) => `Add input validation tests to ${projectName}`,
  (projectName) => `Update the ${projectName} setup notes`,
];

function stableOffset(text, max) {
  const hash = sha256(text);
  return Number.parseInt(hash.slice(0, 8), 16) % max;
}

export function starterTasksFor(state, contributorId, count = 3) {
  const projectPool = [...state.projects.values()]
    .filter((project) => !['p01', 'p02', 'p03', 'p04', 'p05', 'p09'].includes(project.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (projectPool.length === 0) return [];
  const offset = stableOffset(contributorId, projectPool.length);
  return Array.from({ length: count }, (_, index) => {
    const project = projectPool[(offset + index * 3) % projectPool.length];
    const template = STARTER_TASK_TEMPLATES[(offset + index) % STARTER_TASK_TEMPLATES.length];
    return {
      title: template(project.name),
      projectId: project.id,
      projectName: project.name,
      note: 'Simulated suggestion. Nothing was fetched from or posted to a real repository.',
    };
  });
}

export function enrichCampaign(state, campaign) {
  const pullRequestCounts = new Map();
  for (const event of campaign.timeline ?? []) {
    pullRequestCounts.set(
      event.contributorId,
      (pullRequestCounts.get(event.contributorId) ?? 0) + 1,
    );
  }

  return {
    ...campaign,
    members: campaign.memberContributorIds.map((id) => {
      const contributor = state.contributors.get(id);
      const profile = contributor ? contributorSummary(contributor) : { id, handle: id };
      return {
        ...profile,
        signalTypes: (state.campaignData.signalsByContributor[id] ?? []).map(
          (signal) => signal.type,
        ),
        pullRequests: pullRequestCounts.get(id) ?? 0,
      };
    }),
    affectedProjects: campaign.affectedProjectIds.map((id) => ({
      id,
      name: state.projects.get(id)?.name ?? id,
    })),
    timeline: (campaign.timeline ?? []).map((event) => ({
      ...event,
      contributorHandle: state.contributors.get(event.contributorId)?.handle ?? event.contributorId,
      projectName: state.projects.get(event.projectId)?.name ?? event.projectId,
    })),
  };
}

export function sponsorOptions(state, limit = 8) {
  return [...state.projects.values()]
    .filter((project) => !['p03', 'p04', 'p05', 'p09'].includes(project.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((project) => ({
      id: project.id,
      name: project.name,
      maintainers: project.maintainerIds.map(
        (id) => state.contributors.get(id)?.handle ?? id,
      ),
    }));
}
