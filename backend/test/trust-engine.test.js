import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEffectiveTrust,
  computeTrustClusters,
  evaluateContributor,
} from '../services/trust-engine.js';
import { buildSimulation } from '../services/simulator.js';
import { createWorld, evidence } from './helpers.js';

const close = (actual, expected, epsilon = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
};

test('transitive trust multiplies edge weights and stops at depth three', () => {
  const world = createWorld({
    projects: [
      { id: 'a', trustConfig: { b: 0.8 } },
      { id: 'b', trustConfig: { c: 0.8 } },
      { id: 'c', trustConfig: { d: 0.8, a: 0.8 } },
      { id: 'd', trustConfig: {} },
    ],
  });
  const a = world.projects.get('a');

  const trust = computeEffectiveTrust(a, world.projects);
  assert.equal(trust.get('a'), 1);
  close(trust.get('b'), 0.8);
  close(trust.get('c'), 0.64);
  close(trust.get('d'), 0.512);

  const shallow = computeEffectiveTrust(a, world.projects, { maxDepth: 2 });
  close(shallow.get('c'), 0.64);
  assert.equal(shallow.has('d'), false);
});

test('the strongest path wins and cycles terminate safely', () => {
  const world = createWorld({
    projects: [
      { id: 'a', trustConfig: { b: 0.5, d: 0.9 } },
      { id: 'b', trustConfig: { c: 0.9 } },
      { id: 'c', trustConfig: { a: 0.9, d: 0.1 } },
      { id: 'd', trustConfig: { c: 0.8 } },
    ],
  });

  const trust = computeEffectiveTrust(world.projects.get('a'), world.projects);
  close(trust.get('c'), 0.72);
  close(trust.get('d'), 0.9);
  assert.equal(trust.get('a'), 1);
  assert.ok([...trust.values()].every((value) => value > 0 && value <= 1));

  const clusters = computeTrustClusters(world.projects);
  assert.equal(clusters.size, 4);
});

test('a project threshold maxDepth is honoured when no option is passed', () => {
  const world = createWorld({
    projects: [
      { id: 'a', trustConfig: { b: 0.5 }, thresholds: { maxDepth: 1 } },
      { id: 'b', trustConfig: { c: 0.9 } },
      { id: 'c' },
    ],
  });
  const trust = computeEffectiveTrust(world.projects.get('a'), world.projects);
  close(trust.get('b'), 0.5);
  assert.equal(trust.has('c'), false);
});

test('denouncers in the same trust cluster count as one source', () => {
  const world = createWorld({
    projects: [
      { id: 'a', trustConfig: { b: 0.9, c: 0.9 } },
      { id: 'b', trustConfig: { c: 0.8 } },
      { id: 'c', trustConfig: { b: 0.8 } },
    ],
  });
  world.append('b', {
    type: 'denounce',
    subjectContributorId: 'x',
    evidence: evidence('example://b'),
  });
  world.append('c', {
    type: 'denounce',
    subjectContributorId: 'x',
    evidence: evidence('example://c'),
  });

  const assessment = world.assess('a', 'x');
  assert.equal(assessment.outcome, 'caution');
  assert.equal(assessment.summary.evidenceBackedDenounceSources, 1);
  close(assessment.summary.denounceScore, 0.9);
  assert.equal(
    assessment.reasons.filter((reason) => reason.type === 'evidence_backed_denouncement')
      .length,
    1,
  );
  assert.equal(
    assessment.reasons.filter((reason) => reason.type === 'correlated_denouncement')
      .length,
    1,
  );
  assert.match(
    assessment.reasons.find((reason) => reason.type === 'correlated_denouncement')
      .message,
    /counted as one source/i,
  );
});

test('independent denouncers are separate sources and can flag', () => {
  const world = createWorld({
    projects: [
      { id: 'a', trustConfig: { b: 0.9, c: 0.9 } },
      { id: 'b' },
      { id: 'c' },
    ],
  });
  world.append('b', {
    type: 'denounce',
    subjectContributorId: 'x',
    evidence: evidence('example://b'),
  });
  world.append('c', {
    type: 'denounce',
    subjectContributorId: 'x',
    evidence: evidence('example://c'),
  });

  const assessment = world.assess('a', 'x');
  assert.equal(assessment.outcome, 'flagged');
  assert.equal(assessment.summary.evidenceBackedDenounceSources, 2);
  close(assessment.summary.denounceScore, 1.8);
  assert.ok(
    assessment.reasons
      .filter((reason) => reason.type === 'evidence_backed_denouncement')
      .every((reason) => reason.references.length > 0),
  );
});

test('the same evidence from two independent projects counts once', () => {
  const world = createWorld({
    projects: [
      { id: 'a', trustConfig: { b: 0.9, c: 0.9 } },
      { id: 'b' },
      { id: 'c' },
    ],
  });
  world.append('b', {
    type: 'denounce',
    subjectContributorId: 'x',
    evidence: evidence('example://shared-artifact'),
  });
  world.append('c', {
    type: 'denounce',
    subjectContributorId: 'x',
    evidence: evidence('example://shared-artifact'),
  });

  const assessment = world.assess('a', 'x');
  assert.equal(assessment.summary.evidenceBackedDenounceSources, 1);
  assert.equal(assessment.summary.duplicateEvidenceSources, 1);
  assert.equal(assessment.outcome, 'caution');
  close(assessment.summary.denounceScore, 0.9);
  const duplicate = assessment.reasons.find(
    (reasonItem) => reasonItem.type === 'duplicate_evidence_denouncement',
  );
  assert.ok(duplicate);
  assert.match(duplicate.message, /not a second independent source/i);
  assert.equal(duplicate.references.length, 2);
});

test('one trusted issuer alone cannot push past caution', () => {
  const world = createWorld({
    projects: [
      { id: 'a', trustConfig: { b: 1 } },
      { id: 'b' },
    ],
  });
  world.append('b', {
    type: 'denounce',
    subjectContributorId: 'x',
    evidence: evidence(),
  });

  const assessment = world.assess('a', 'x');
  assert.equal(assessment.outcome, 'caution');
  assert.equal(assessment.summary.evidenceBackedDenounceSources, 1);
  close(assessment.summary.denounceScore, 1);
});

test('a denouncement without evidence is ignored with a visible reason', () => {
  const world = createWorld({
    projects: [
      { id: 'a', trustConfig: { b: 0.9 } },
      { id: 'b' },
    ],
  });
  world.append('b', {
    type: 'denounce',
    subjectContributorId: 'x',
    evidence: [],
  });

  const assessment = world.assess('a', 'x');
  assert.equal(assessment.outcome, 'normal_review');
  const ignored = assessment.reasons.find((reason) => reason.type === 'ignored_record');
  assert.ok(ignored);
  assert.match(ignored.message, /no evidence attached/i);
  assert.equal(ignored.weight, 0);
  assert.equal(assessment.summary.evidenceBackedDenounceSources, 0);
});

test('expired denouncements are ignored (appeal path)', () => {
  const world = createWorld({
    projects: [
      { id: 'a', trustConfig: { b: 0.9 } },
      { id: 'b' },
    ],
  });
  world.append('b', {
    type: 'denounce',
    subjectContributorId: 'x',
    evidence: evidence(),
    expiresAt: '2026-10-01T00:00:00.000Z',
  });

  const assessment = world.assess('a', 'x');
  assert.equal(assessment.outcome, 'normal_review');
  const ignored = assessment.reasons.find((reason) => reason.type === 'ignored_record');
  assert.match(ignored.message, /expired/i);
});

test('revoked denouncements are ignored (appeal path)', () => {
  const world = createWorld({
    projects: [
      { id: 'a', trustConfig: { b: 0.9 } },
      { id: 'b' },
    ],
  });
  const target = world.append('b', {
    type: 'denounce',
    subjectContributorId: 'x',
    evidence: evidence(),
  });
  world.append('b', {
    type: 'revoke',
    subjectContributorId: 'x',
    subjectRecordId: target.id,
    evidence: [{ kind: 'record', ref: target.id }],
  });

  const assessment = world.assess('a', 'x');
  assert.equal(assessment.outcome, 'normal_review');
  const ignored = assessment.reasons.find((reason) => reason.type === 'ignored_record');
  assert.match(ignored.message, /revoked/i);
});

test('a mass-denouncing project is down-weighted', () => {
  const world = createWorld({
    projects: [
      { id: 'a', trustConfig: { l: 1 } },
      { id: 'l' },
    ],
    contributors: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((id) => ({ id })),
  });
  for (let index = 1; index <= 5; index += 1) {
    world.append('l', {
      type: 'denounce',
      subjectContributorId: `c${index}`,
      evidence: evidence(`example://bulk/${index}`),
    });
  }
  const pullRequests = Array.from({ length: 6 }, (_, index) => ({
    contributorId: `c${index + 1}`,
  }));

  const assessment = world.assess('a', 'c1', { pullRequests });
  assert.equal(assessment.outcome, 'caution');
  close(assessment.summary.denounceScore, 0.6);
  const reason = assessment.reasons.find(
    (item) => item.type === 'evidence_backed_denouncement',
  );
  assert.match(reason.message, /down-weighted by 0\.6/i);
});

test('vouches are weighted, independent, and capped per source', () => {
  const clustered = createWorld({
    projects: [
      { id: 'a', trustConfig: { b: 1, c: 1 } },
      { id: 'b', trustConfig: { c: 0.8 } },
      { id: 'c', trustConfig: { b: 0.8 } },
    ],
  });
  for (const issuer of ['b', 'c']) {
    clustered.append(issuer, {
      type: 'vouch',
      subjectContributorId: 'x',
      evidence: evidence(`example://${issuer}`),
    });
  }
  const capped = clustered.assess('a', 'x');
  assert.equal(capped.outcome, 'normal_review');
  close(capped.summary.vouchSupport, 0.5);

  const independent = createWorld({
    projects: [
      { id: 'a', trustConfig: { b: 1, c: 1 } },
      { id: 'b' },
      { id: 'c' },
    ],
  });
  for (const issuer of ['b', 'c']) {
    independent.append(issuer, {
      type: 'vouch',
      subjectContributorId: 'x',
      evidence: evidence(`example://${issuer}`),
    });
  }
  const uncapped = independent.assess('a', 'x');
  close(uncapped.summary.vouchSupport, 1);
});

test('vouches never erase evidence-backed denouncements', () => {
  const world = createWorld({
    projects: [
      { id: 'a', trustConfig: { b: 0.6, c: 0.6, d: 0.6, e: 0.6 } },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
      { id: 'e' },
    ],
  });
  for (const issuer of ['b', 'c']) {
    world.append(issuer, {
      type: 'vouch',
      subjectContributorId: 'x',
      evidence: evidence(`example://vouch/${issuer}`),
    });
  }
  for (const issuer of ['d', 'e']) {
    world.append(issuer, {
      type: 'denounce',
      subjectContributorId: 'x',
      evidence: evidence(`example://denounce/${issuer}`),
    });
  }

  const assessment = world.assess('a', 'x');
  assert.equal(assessment.outcome, 'flagged');
  close(assessment.summary.vouchSupport, 1);
  assert.ok(assessment.summary.denounceScore >= 1);
});

test('records from zero-effective-trust issuers contribute zero weight', () => {
  const world = createWorld({
    projects: [{ id: 'a' }, { id: 'z' }],
  });
  world.append('z', {
    type: 'vouch',
    subjectContributorId: 'x',
    evidence: evidence(),
  });
  world.append('z', {
    type: 'denounce',
    subjectContributorId: 'x',
    evidence: evidence(),
  });

  const assessment = world.assess('a', 'x');
  assert.equal(assessment.outcome, 'normal_review');
  const ignored = assessment.reasons.filter((reason) => reason.type === 'ignored_record');
  assert.equal(ignored.length, 2);
  assert.ok(ignored.every((reason) => /zero effective trust/i.test(reason.message)));
});

test('no records is neutral, with the exact newcomer note', () => {
  const world = createWorld({
    projects: [{ id: 'a' }],
    contributors: [{ id: 'x' }],
  });

  const assessment = world.assess('a', 'x');
  assert.equal(assessment.outcome, 'normal_review');
  assert.equal(assessment.note, 'No history. Treated as neutral.');
  const neutral = assessment.reasons.find((reason) => reason.type === 'newcomer_neutral');
  assert.ok(neutral);
  assert.equal(neutral.message, 'No history. Treated as neutral.');
  assert.equal(neutral.weight, 0);
});

test('activity without signed records says so instead of claiming no history', () => {
  const world = createWorld({
    projects: [{ id: 'a' }],
    contributors: [{ id: 'x' }],
  });

  const assessment = world.assess('a', 'x', {
    pullRequests: [{ contributorId: 'x' }],
  });
  assert.equal(assessment.outcome, 'normal_review');
  assert.equal(
    assessment.note,
    'No signed records yet. Treated as neutral.',
  );
  const neutral = assessment.reasons.find((reason) => reason.type === 'newcomer_neutral');
  assert.ok(neutral);
  assert.equal(neutral.message, 'No signed records yet. Treated as neutral.');
  assert.equal(neutral.weight, 0);
});

test('the same contributor is assessed differently by different projects', () => {
  const state = buildSimulation({ seed: 42, size: 30, campaignSize: 12 });
  const evaluate = (projectId) =>
    evaluateContributor({
      evaluatingProject: state.projects.get(projectId),
      contributorId: state.groundTruth.disputedId,
      projects: state.projects,
      contributors: state.contributors,
      snapshot: state.snapshot,
      campaignData: state.campaignData,
      pullRequests: state.pullRequests,
      now: new Date(state.simulatedAt),
      trustCache: state.trustCache,
      clusterCache: state.clusterCache,
    });

  const trusting = evaluate('p06');
  const unaware = evaluate('p08');
  assert.equal(trusting.outcome, 'caution');
  assert.equal(unaware.outcome, 'normal_review');
  assert.notEqual(trusting.evaluatingProjectId, unaware.evaluatingProjectId);
  assert.ok(
    trusting.reasons.some(
      (reason) => reason.weight > 0 && reason.references.length > 0,
    ),
  );
});
