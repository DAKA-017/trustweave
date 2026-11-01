import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../app.js';
import { config } from '../config/index.js';

const API_SESSION = 'api-test-visitor';

// Every request in this file acts as one visitor. Supertest only accepts
// headers after a request method is chosen, so the proxy applies the session
// header as soon as get/post/... is called.
function asVisitor(builder) {
  return new Proxy(builder, {
    get(target, property) {
      const value = target[property];
      if (typeof value !== 'function') return value;
      return (...args) => {
        const test = value.apply(target, args);
        if (test && typeof test.set === 'function') {
          test.set('X-TrustWeave-Session', API_SESSION);
        }
        return test;
      };
    },
  });
}

before(async () => {
  await asVisitor(request(app))
    .post('/api/simulate')
    .send({ seed: 42, size: 30, campaignSize: 12 })
    .expect(200);
});

test('GET /api/health reports a simulation host with no authority', async () => {
  const response = await asVisitor(request(app)).get('/api/health').expect(200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.simulationHost, true);
  assert.equal(response.body.authority, false);
  assert.equal(response.body.simulated, true);
  assert.equal(response.body.seed, 42);
  assert.equal(response.body.counts.projects, 30);
});

test('GET /api/projects returns sanitized project summaries', async () => {
  const response = await asVisitor(request(app)).get('/api/projects').expect(200);
  assert.equal(response.body.projects.length, 30);
  const project = response.body.projects.find((item) => item.id === 'p10');
  assert.ok(project);
  assert.equal(project.publicKey, undefined);
  assert.ok(project.publicKeyFingerprint);
  assert.ok(project.trustConfig.length > 0);
  assert.ok(project.trustConfig.every((edge) => edge.weight >= 0 && edge.weight <= 1));
});

test('GET /api/projects/:id/view returns assessments from that project only', async () => {
  const response = await asVisitor(request(app)).get('/api/projects/p10/view').expect(200);
  assert.equal(response.body.project.id, 'p10');
  assert.ok(response.body.project.publicKey);
  assert.ok(response.body.effectiveTrust.length > 0);
  assert.ok(response.body.incoming.length > 0);
  assert.equal(
    response.body.summary.contributors,
    response.body.incoming.length,
  );
  assert.ok(
    response.body.incoming.every(
      (item) => item.assessment.evaluatingProjectId === 'p10',
    ),
  );
  assert.ok(
    response.body.effectiveTrust.every(
      (entry) => entry.weight > 0 && entry.weight <= 1,
    ),
  );
  assert.ok(
    response.body.effectiveTrust.every(
      (entry) =>
        entry.directWeight == null || entry.weight + 1e-9 >= entry.directWeight,
    ),
  );

  const toP08 = response.body.effectiveTrust.find((entry) => entry.projectId === 'p08');
  assert.ok(toP08);
  assert.ok(toP08.weight <= 1);
  const reverse = await asVisitor(request(app)).get('/api/projects/p08/view').expect(200);
  const toP10 = reverse.body.effectiveTrust.find((entry) => entry.projectId === 'p10');
  assert.ok(toP10);
  assert.equal(toP08.weight, toP10.weight);
});

test('the same contributor gets different outcomes as different projects', async () => {
  const trusting = await asVisitor(request(app))
    .get('/api/contributors/c_disputed/assessment')
    .query({ asProject: 'p06' })
    .expect(200);
  const unaware = await asVisitor(request(app))
    .get('/api/contributors/c_disputed/assessment')
    .query({ asProject: 'p08' })
    .expect(200);

  assert.equal(trusting.body.assessment.outcome, 'caution');
  assert.equal(unaware.body.assessment.outcome, 'normal_review');
  assert.ok(
    trusting.body.assessment.reasons.some(
      (reason) => reason.weight > 0 && reason.references.length > 0,
    ),
  );
  assert.ok(trusting.body.assessment.whatWouldChangeThis.length > 0);
});

test('a newcomer with no history is neutral and the malicious denouncement is ignored', async () => {
  const newcomer = await asVisitor(request(app))
    .get('/api/contributors/c_new_good/assessment')
    .query({ asProject: 'p10' })
    .expect(200);
  assert.equal(newcomer.body.assessment.outcome, 'normal_review');
  assert.equal(
    newcomer.body.assessment.note,
    'No signed records yet. Treated as neutral.',
  );

  const honest = await asVisitor(request(app))
    .get(`/api/contributors/${encodeURIComponent('c_denounced')}/assessment`)
    .query({ asProject: 'p10' })
    .expect(200);
  assert.equal(honest.body.assessment.outcome, 'normal_review');
  const ignored = honest.body.assessment.reasons.find(
    (reason) =>
      reason.type === 'ignored_record' &&
      reason.references.some((ref) => ref.projectId === 'p01'),
  );
  assert.ok(ignored);
  assert.match(ignored.message, /no evidence attached/i);
});

test('GET /api/campaigns returns the coordinated campaign with evidence', async () => {
  const response = await asVisitor(request(app)).get('/api/campaigns').expect(200);
  assert.equal(response.body.campaigns.length, 1);
  const campaign = response.body.campaigns[0];
  assert.equal(campaign.members.length, 12);
  assert.ok(campaign.affectedProjects.length >= 20);
  assert.ok(campaign.signalsFired.length >= 2);
  assert.ok(campaign.signalsFired.every((signal) => signal.evidence.length > 0));
  assert.ok(campaign.signalsFired.every((signal) => signal.memberCount >= 1));
  assert.ok(campaign.timeline.length > 0);
  assert.equal(campaign.confidence.label, 'high');
  assert.ok(response.body.detector.requirement.includes('two independent signal types'));

  assert.equal(campaign.provenance.detector, 'behavioral-signals-v1');
  assert.equal(campaign.provenance.inputs.projects, 30);
  assert.equal(campaign.provenance.evidence.total, campaign.evidence.length);
  assert.ok(campaign.provenance.evidence.byKind.pull_request > 0);
  assert.ok(campaign.provenance.evidence.byKind.record > 0);
  assert.equal(campaign.provenance.signalTypes.count, campaign.signalsFired.length);
  assert.equal(campaign.provenance.membersWithSignals, campaign.members.length);
  assert.ok(campaign.members.every((member) => member.signalTypes.length > 0));
  assert.ok(campaign.members.some((member) => member.pullRequests > 0));
  assert.match(campaign.provenance.method, /no text-origin/i);
});

test('GET /api/records verifies logs and shows rejection under tampering', async () => {
  const summary = await asVisitor(request(app)).get('/api/records').expect(200);
  assert.ok(summary.body.projects.length === 30);
  assert.equal(summary.body.defaultProjectId, 'p07');
  const defaultProject = summary.body.projects.find(
    (project) => project.id === summary.body.defaultProjectId,
  );
  assert.ok(defaultProject.types.vouch > 0);
  assert.ok(defaultProject.types.denounce > 0);

  const clean = await asVisitor(request(app))
    .get('/api/records')
    .query({ projectId: 'p07' })
    .expect(200);
  assert.equal(clean.body.log.valid, true);
  assert.equal(clean.body.log.counts.invalid, 0);
  assert.ok(clean.body.log.entries.every((entry) => entry.verification.active || entry.verification.expired || entry.verification.revoked));

  const signature = await asVisitor(request(app))
    .get('/api/records')
    .query({ projectId: 'p07', tamper: 'signature' })
    .expect(200);
  assert.equal(signature.body.demoOnly, true);
  assert.equal(signature.body.log.valid, false);
  assert.ok(
    signature.body.log.entries.some((entry) =>
      entry.verification.issues.includes('invalid_signature'),
    ),
  );

  const chain = await asVisitor(request(app))
    .get('/api/records')
    .query({ projectId: 'p07', tamper: 'chain' })
    .expect(200);
  assert.equal(chain.body.log.valid, false);
  assert.ok(
    chain.body.log.entries.some((entry) =>
      entry.verification.issues.includes('broken_chain'),
    ),
  );
});

test('POST /api/records signs a new record and a later revoke reverses it', async () => {
  const vouch = await asVisitor(request(app))
    .post('/api/records')
    .send({
      issuerProjectId: 'p10',
      subjectContributorId: 'c_new_01',
      type: 'vouch',
      reasonCode: 'newcomer_sponsor_vouch',
      evidence: [{ kind: 'note', ref: 'simulated sponsor vouch from test' }],
    })
    .expect(201);
  assert.ok(vouch.body.record.signature);
  assert.equal(vouch.body.verification.integrity, 'valid');
  assert.equal(vouch.body.verification.active, true);

  const revoke = await asVisitor(request(app))
    .post('/api/records')
    .send({
      issuerProjectId: 'p10',
      subjectContributorId: 'c_new_01',
      type: 'revoke',
      reasonCode: 'appeal_accepted',
      subjectRecordId: vouch.body.record.id,
      evidence: [{ kind: 'record', ref: vouch.body.record.id }],
    })
    .expect(201);
  assert.ok(revoke.body.record.signature);

  const log = await asVisitor(request(app))
    .get('/api/records')
    .query({ projectId: 'p10' })
    .expect(200);
  const target = log.body.log.entries.find(
    (entry) => entry.record.id === vouch.body.record.id,
  );
  assert.equal(target.verification.revoked, true);
  assert.equal(target.verification.revokedBy, revoke.body.record.id);
  assert.equal(target.verification.active, false);
});

test('revoked and expired records remain verifiable but inactive', async () => {
  const revoked = await asVisitor(request(app))
    .get('/api/records')
    .query({ projectId: 'p13' })
    .expect(200);
  const revokedEntry = revoked.body.log.entries.find(
    (entry) => entry.verification.revoked,
  );
  assert.ok(revokedEntry);
  assert.equal(revokedEntry.verification.integrity, 'valid');
  assert.equal(revokedEntry.verification.active, false);
  assert.ok(revokedEntry.verification.revokedBy);

  const expired = await asVisitor(request(app))
    .get('/api/records')
    .query({ projectId: 'p12' })
    .expect(200);
  const expiredEntry = expired.body.log.entries.find(
    (entry) => entry.verification.expired,
  );
  assert.ok(expiredEntry);
  assert.equal(expiredEntry.verification.integrity, 'valid');
  assert.equal(expiredEntry.verification.active, false);
});

test('API errors use the documented shape', async () => {
  const missingProject = await asVisitor(request(app))
    .get('/api/projects/nope/view')
    .expect(404);
  assert.equal(missingProject.body.error.code, 'NOT_FOUND');
  assert.equal(typeof missingProject.body.error.message, 'string');

  const missingQuery = await asVisitor(request(app))
    .get('/api/contributors/c_new_good/assessment')
    .expect(400);
  assert.equal(missingQuery.body.error.code, 'VALIDATION_ERROR');

  const badSimulation = await asVisitor(request(app))
    .post('/api/simulate')
    .send({ size: 10 })
    .expect(400);
  assert.equal(badSimulation.body.error.code, 'VALIDATION_ERROR');

  const invalidJson = await asVisitor(request(app))
    .post('/api/records')
    .set('Content-Type', 'application/json')
    .send('{"type":')
    .expect(400);
  assert.equal(invalidJson.body.error.code, 'INVALID_JSON');

  const unknown = await asVisitor(request(app)).get('/api/nope').expect(404);
  assert.equal(unknown.body.error.code, 'NOT_FOUND');
});

test('CORS is restricted to the configured origin and TrustWeave deployments', async () => {
  const allowed = await asVisitor(request(app))
    .get('/api/health')
    .set('Origin', config.frontendOrigin)
    .expect(200);
  assert.equal(
    allowed.headers['access-control-allow-origin'],
    config.frontendOrigin,
  );

  const preview = await asVisitor(request(app))
    .get('/api/health')
    .set('Origin', 'https://trustweave-preview-team.vercel.app')
    .expect(200);
  assert.equal(
    preview.headers['access-control-allow-origin'],
    'https://trustweave-preview-team.vercel.app',
  );

  const blocked = await asVisitor(request(app))
    .get('/api/health')
    .set('Origin', 'https://evil.example')
    .expect(200);
  assert.equal(blocked.headers['access-control-allow-origin'], undefined);
});

test('GET /api/metrics reports measurements for one seed and across seeds', async () => {
  const current = await asVisitor(request(app)).get('/api/metrics').expect(200);
  assert.equal(current.body.metrics.campaign.precision, 1);
  assert.equal(current.body.metrics.campaign.recall, 0.8);
  assert.equal(current.body.metrics.campaign.observableRecall, 1);
  assert.equal(current.body.metrics.campaign.sleeperMembers, 3);
  assert.equal(current.body.metrics.campaign.unobservedSleepers.length, 3);
  assert.equal(current.body.metrics.campaign.missed.length, 0);
  assert.equal(current.body.metrics.newcomerFalseFlag.rate, 0);
  assert.equal(current.body.metrics.explanationCompleteness.rate, 1);
  assert.equal(
    current.body.metrics.hardCasesPassed,
    current.body.metrics.hardCasesTotal,
  );

  const multi = await asVisitor(request(app))
    .get('/api/metrics')
    .query({ multi: '1' })
    .expect(200);
  assert.equal(multi.body.multiSeed.aggregate.campaignPrecisionMean, 1);
  assert.equal(multi.body.multiSeed.aggregate.campaignRecallMean, 0.8);
  assert.equal(multi.body.multiSeed.aggregate.observableRecallMean, 1);
  assert.equal(multi.body.multiSeed.aggregate.newcomerFalseFlagRateMax, 0);
  assert.equal(multi.body.multiSeed.aggregate.explanationCompletenessMin, 1);
  assert.ok(multi.body.multiSeed.variance.campaignPrecision.range === 0);

  const stealth = multi.body.scenarios.stealth;
  assert.equal(stealth.scenario, 'stealth');
  assert.equal(stealth.aggregate.campaignPrecisionMean, 1);
  assert.ok(stealth.aggregate.campaignRecallMean < 1);
  assert.ok(stealth.aggregate.observableRecallMean < 1);
  assert.equal(stealth.aggregate.newcomerFalseFlagRateMax, 0);
  assert.ok(stealth.aggregate.missedMembersTotal > 0);
  assert.ok(stealth.aggregate.unobservedQuietTotal > 0);
  for (const seedResult of stealth.seeds) {
    assert.equal(seedResult.scenario, 'stealth');
    assert.ok(seedResult.missedMembers.every((missed) => missed.reason.length > 0));
  }
});

test('POST /api/simulate returns identical results for the same seed', async () => {
  const fingerprint = async () => {
    const [health, campaigns, records] = await Promise.all([
      asVisitor(request(app)).get('/api/health').expect(200),
      asVisitor(request(app)).get('/api/campaigns').expect(200),
      asVisitor(request(app)).get('/api/records').query({ projectId: 'p02' }).expect(200),
    ]);
    return {
      counts: health.body.counts,
      simulatedAt: health.body.simulatedAt,
      members: campaigns.body.campaigns.map((campaign) => campaign.memberContributorIds),
      signals: campaigns.body.campaigns.map((campaign) =>
        campaign.signalsFired.map((signal) => signal.type),
      ),
      hashes: records.body.log.entries.map((entry) => entry.hash),
    };
  };

  try {
    await asVisitor(request(app))
      .post('/api/simulate')
      .send({ seed: 7, size: 20, campaignSize: 10 })
      .expect(200);
    const first = await fingerprint();
    assert.equal(first.members[0].length, 10);
    assert.ok(first.hashes.length > 10);

    await asVisitor(request(app))
      .post('/api/simulate')
      .send({ seed: 7, size: 20, campaignSize: 10 })
      .expect(200);
    const second = await fingerprint();
    assert.deepEqual(second, first);
  } finally {
    await asVisitor(request(app))
      .post('/api/simulate')
      .send({ seed: 42, size: 30, campaignSize: 12 })
      .expect(200);
  }
});

test('POST /api/simulate selects the stealth scenario inside the visitor sandbox', async () => {
  try {
    const simulated = await asVisitor(request(app))
      .post('/api/simulate')
      .send({ seed: 42, size: 30, campaignSize: 12, scenario: 'stealth' })
      .expect(200);
    assert.equal(simulated.body.simulation.scenario, 'stealth');
    assert.equal(simulated.body.readOnly, false);

    const health = await asVisitor(request(app)).get('/api/health').expect(200);
    assert.equal(health.body.scenario, 'stealth');

    const metrics = await asVisitor(request(app)).get('/api/metrics').expect(200);
    assert.equal(metrics.body.metrics.scenario, 'stealth');
    assert.equal(metrics.body.metrics.campaign.precision, 1);
    assert.ok(metrics.body.metrics.campaign.observableRecall < 1);
    assert.ok(metrics.body.metrics.campaign.unobservedQuiet.length > 0);
    assert.ok(metrics.body.metrics.campaign.missedMembers.length > 0);
    assert.equal(metrics.body.metrics.newcomerFalseFlag.rate, 0);
    assert.equal(
      metrics.body.metrics.campaign.signalTypes.includes('burst_timing'),
      false,
    );

    await asVisitor(request(app))
      .post('/api/simulate')
      .send({ seed: 42, size: 30, campaignSize: 12, scenario: 'phantom' })
      .expect(400);
  } finally {
    await asVisitor(request(app))
      .post('/api/simulate')
      .send({ seed: 42, size: 30, campaignSize: 12, scenario: 'obvious' })
      .expect(200);
  }
});
