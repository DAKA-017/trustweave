import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCampaigns } from '../services/campaign-detector.js';
import { buildSimulation } from '../services/simulator.js';
import { createWorld, NOW, evidence } from './helpers.js';

const HOUR = 60 * 60 * 1000;

function makePr({ id, projectId, contributorId = 'x', hoursAgo, content, outcome = 'open' }) {
  return {
    id,
    projectId,
    contributorId,
    createdAt: new Date(Date.parse(NOW) - hoursAgo * HOUR).toISOString(),
    contentFingerprint: `fingerprint-${id}`,
    contentSample: content,
    changedPathsSummary: `${projectId}/src/${id}.js`,
    size: 10,
    outcome,
  };
}

function detect(world, pullRequests) {
  return detectCampaigns({
    projects: world.projects,
    contributors: world.contributors,
    pullRequests,
    snapshot: world.snapshot(),
    now: new Date(NOW),
  });
}

test('a synchronized burst across many projects fires burst_timing', () => {
  const world = createWorld({
    projects: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }],
    contributors: [{ id: 'x' }],
  });
  const pullRequests = [
    makePr({ id: 'pr1', projectId: 'p1', hoursAgo: 20, content: 'alpha beta gamma delta epsilon zeta' }),
    makePr({ id: 'pr2', projectId: 'p2', hoursAgo: 16, content: 'theta iota kappa lambda mu nu xi' }),
    makePr({ id: 'pr3', projectId: 'p3', hoursAgo: 12, content: 'omicron pi rho sigma tau upsilon' }),
    makePr({ id: 'pr4', projectId: 'p4', hoursAgo: 8, content: 'phi chi psi omega kai rhea' }),
    makePr({ id: 'pr5', projectId: 'p1', hoursAgo: 4, content: 'theseus perseus hercules athena apollo' }),
    makePr({ id: 'pr6', projectId: 'p2', hoursAgo: 2, content: 'artemis hestia demeter hades poseidon' }),
  ];

  const result = detect(world, pullRequests);
  const types = (result.signalsByContributor.x ?? []).map((signal) => signal.type);
  assert.ok(types.includes('burst_timing'));
  assert.equal(types.includes('near_duplicate_content'), false);
  assert.equal(result.campaigns.length, 0);
});

test('a spread-out submission pattern does not fire a burst', () => {
  const world = createWorld({
    projects: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
    contributors: [{ id: 'x' }],
  });
  const pullRequests = Array.from({ length: 5 }, (_, index) =>
    makePr({
      id: `pr${index}`,
      projectId: `p${(index % 3) + 1}`,
      hoursAgo: 6 + index * 72,
      content: `distinct content number ${index} about a different topic entirely`,
    }),
  );

  const result = detect(world, pullRequests);
  const types = (result.signalsByContributor.x ?? []).map((signal) => signal.type);
  assert.equal(types.includes('burst_timing'), false);
});

test('near-duplicate content across projects fires near_duplicate_content', () => {
  const world = createWorld({
    projects: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }],
    contributors: [{ id: 'x' }],
  });
  const content =
    'This pull request improves performance and fixes bugs and updates documentation and adds tests for the module.';
  const pullRequests = [1, 2, 3, 4].map((number, index) =>
    makePr({
      id: `pr${number}`,
      projectId: `p${number}`,
      hoursAgo: 24 + index * 72,
      content,
    }),
  );

  const result = detect(world, pullRequests);
  const signals = result.signalsByContributor.x ?? [];
  const duplicate = signals.find((signal) => signal.type === 'near_duplicate_content');
  assert.ok(duplicate);
  assert.match(duplicate.description, /4 near-duplicate PRs across 4 projects/);
  assert.ok(duplicate.evidence.length >= 4);
  assert.equal(signals.some((signal) => signal.type === 'burst_timing'), false);
});

test('closed-loop vouching among accounts with no outside support fires vouch_ring', () => {
  const world = createWorld({
    projects: [
      { id: 'r1', maintainerIds: ['u1'] },
      { id: 'r2', maintainerIds: ['u2'] },
      { id: 'r3', maintainerIds: ['u3'] },
    ],
    contributors: [
      { id: 'u1', accountCreatedAt: '2026-10-30T00:00:00.000Z' },
      { id: 'u2', accountCreatedAt: '2026-10-30T00:00:00.000Z' },
      { id: 'u3', accountCreatedAt: '2026-10-30T00:00:00.000Z' },
    ],
  });
  world.append('r1', {
    type: 'vouch',
    subjectContributorId: 'u2',
    evidence: evidence('example://r1-u2'),
  });
  world.append('r2', {
    type: 'vouch',
    subjectContributorId: 'u3',
    evidence: evidence('example://r2-u3'),
  });
  world.append('r3', {
    type: 'vouch',
    subjectContributorId: 'u1',
    evidence: evidence('example://r3-u1'),
  });

  const result = detect(world, []);
  for (const member of ['u1', 'u2', 'u3']) {
    const types = (result.signalsByContributor[member] ?? []).map(
      (signal) => signal.type,
    );
    assert.ok(types.includes('vouch_ring'), `${member} should show vouch_ring`);
  }
  assert.equal(
    result.campaigns.length,
    0,
    'a single signal type never forms a campaign',
  );
});

test('the simulated campaign is detected with multiple independent signal types', () => {
  const state = buildSimulation({ seed: 42, size: 30, campaignSize: 12 });
  assert.equal(state.campaignData.campaigns.length, 1);

  const campaign = state.campaignData.campaigns[0];
  const members = new Set(campaign.memberContributorIds);
  assert.equal(members.size, state.groundTruth.campaignMembers.length);
  assert.ok(
    state.groundTruth.campaignMembers.every((member) => members.has(member)),
  );
  assert.ok(campaign.affectedProjectIds.length >= 20);
  assert.equal(campaign.confidence.label, 'high');

  const types = campaign.signalsFired.map((signal) => signal.type);
  for (const type of [
    'near_duplicate_content',
    'burst_timing',
    'new_accounts_in_sync',
    'vouch_ring',
    'high_volume_low_merge',
  ]) {
    assert.ok(types.includes(type), `campaign should fire ${type}`);
  }
  const spanHours =
    (Date.parse(campaign.window.end) - Date.parse(campaign.window.start)) / HOUR;
  assert.ok(spanHours <= 24);
});

test('honest newcomers and hard cases are not grouped into the campaign', () => {
  const state = buildSimulation({ seed: 42, size: 30, campaignSize: 12 });
  const grouped = new Set(
    state.campaignData.campaigns.flatMap((campaign) => campaign.memberContributorIds),
  );

  for (const contributorId of [
    state.groundTruth.goodNewcomerId,
    state.groundTruth.aiAssistedId,
    state.groundTruth.nonNativeId,
    state.groundTruth.denouncedId,
    ...state.groundTruth.legitNewcomers,
  ]) {
    assert.equal(grouped.has(contributorId), false, `${contributorId} was grouped`);
    const signals = state.campaignData.signalsByContributor[contributorId] ?? [];
    assert.equal(signals.length, 0, `${contributorId} should have no signals`);
  }

  const spamSignals = state.campaignData.signalsByContributor[
    state.groundTruth.humanSpamId
  ];
  const spamTypes = spamSignals.map((signal) => signal.type);
  assert.ok(spamTypes.includes('high_volume_low_merge'));
  assert.ok(spamTypes.includes('near_duplicate_content'));
  assert.equal(grouped.has(state.groundTruth.humanSpamId), false);
});
