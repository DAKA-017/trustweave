import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSimulation, SIM_NOW } from '../services/simulator.js';
import { computeMetricsForState, computeMetricsAcrossSeeds } from '../services/metrics.js';
import { config } from '../config/index.js';

test('invalid simulator parameters are rejected', () => {
  assert.throws(() => buildSimulation({ seed: 42, size: 10 }), /size must be between 20 and 50/);
  assert.throws(
    () => buildSimulation({ seed: 42, size: 30, campaignSize: 9 }),
    /campaignSize must be between 10 and 15/,
  );
  assert.throws(() => buildSimulation({ seed: 0 }), /seed must be a positive integer/);
});

test('the simulator is deterministic for a given seed', () => {
  const first = buildSimulation({ seed: 7, size: 20, campaignSize: 10 });
  const second = buildSimulation({ seed: 7, size: 20, campaignSize: 10 });

  assert.deepEqual(first.counts, second.counts);
  assert.deepEqual(
    first.campaignData.campaigns.map((campaign) => campaign.memberContributorIds),
    second.campaignData.campaigns.map((campaign) => campaign.memberContributorIds),
  );
  assert.deepEqual(
    first.pullRequests.slice(0, 15).map((pr) => [pr.id, pr.projectId, pr.createdAt]),
    second.pullRequests.slice(0, 15).map((pr) => [pr.id, pr.projectId, pr.createdAt]),
  );
  assert.deepEqual(
    [...first.projects.values()].map((project) => project.publicKey),
    [...second.projects.values()].map((project) => project.publicKey),
  );
  assert.equal(first.simulatedAt, SIM_NOW);
});

test('the generated scenario meets the structural requirements', () => {
  const state = buildSimulation({ seed: 42, size: 30, campaignSize: 12 });
  assert.equal(state.projects.size, 30);
  assert.ok(state.campaignSize >= 10 && state.campaignSize <= 15);
  assert.ok(state.counts.pullRequests > 300);
  assert.ok(state.counts.records > 50);
  assert.equal(state.authority, false);
  assert.equal(state.mode, 'simulation-host');
  assert.ok(
    state.campaignData.campaigns[0].affectedProjectIds.length >= 20,
  );
  assert.ok(state.groundTruth.legitNewcomers.length >= 10);
});

test('all hard cases pass for the default seed and are fully explained', () => {
  const state = buildSimulation({ seed: 42, size: 30, campaignSize: 12 });
  const metrics = computeMetricsForState(state);

  assert.equal(metrics.campaign.precision, 1);
  assert.equal(metrics.campaign.recall, 1);
  assert.equal(metrics.newcomerFalseFlag.rate, 0);
  assert.ok(metrics.newcomerFalseFlag.total >= 10);
  assert.equal(metrics.explanationCompleteness.rate, 1);
  assert.ok(metrics.explanationCompleteness.nonNeutral > 0);
  assert.equal(metrics.hardCasesTotal, 9);
  assert.equal(metrics.hardCasesPassed, 9);
  for (const hardCase of metrics.hardCases) {
    assert.equal(hardCase.passed, true, `${hardCase.id}: ${hardCase.actual}`);
  }
});

test('campaign precision and recall are perfect and newcomer false flags stay zero across seeds', () => {
  const multi = computeMetricsAcrossSeeds({
    seeds: config.multiSeedList,
    size: 30,
    campaignSize: 12,
  });

  assert.equal(multi.aggregate.campaignPrecisionMean, 1);
  assert.equal(multi.aggregate.campaignRecallMean, 1);
  assert.equal(multi.aggregate.newcomerFalseFlagRateMax, 0);
  assert.equal(multi.aggregate.explanationCompletenessMin, 1);
  assert.equal(
    multi.aggregate.hardCasesPassedTotal,
    multi.aggregate.hardCasesTotal,
  );
  assert.equal(multi.seeds.length, config.multiSeedList.length);

  for (const metric of [
    multi.variance.campaignPrecision,
    multi.variance.campaignRecall,
    multi.variance.newcomerFalseFlagRate,
    multi.variance.explanationCompleteness,
  ]) {
    assert.equal(metric.range, 0);
  }

  for (const seedResult of multi.seeds) {
    assert.equal(seedResult.campaignPrecision, 1, `seed ${seedResult.seed}`);
    assert.equal(seedResult.campaignRecall, 1, `seed ${seedResult.seed}`);
    assert.equal(seedResult.newcomerFalseFlagRate, 0, `seed ${seedResult.seed}`);
  }
});

test('different sizes and campaign sizes still produce one explainable campaign', () => {
  const state = buildSimulation({ seed: 99, size: 20, campaignSize: 10 });
  assert.equal(state.projects.size, 20);
  assert.equal(state.campaignData.campaigns.length, 1);
  const campaign = state.campaignData.campaigns[0];
  assert.equal(campaign.memberContributorIds.length, 10);
  assert.ok(campaign.signalsFired.length >= 2);
  assert.ok(campaign.evidence.length > 0);

  const metrics = computeMetricsForState(state);
  assert.equal(metrics.campaign.precision, 1);
  assert.equal(metrics.campaign.recall, 1);
  assert.equal(metrics.newcomerFalseFlag.rate, 0);
  assert.equal(metrics.hardCasesPassed, metrics.hardCasesTotal);
});
