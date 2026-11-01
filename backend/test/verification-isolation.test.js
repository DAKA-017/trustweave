import test from 'node:test';
import assert from 'node:assert/strict';
import { VerificationSandbox } from '../services/verification/sandbox.js';
import { simulationHost } from '../services/simulation-host.js';

function sandboxFingerprint(state) {
  return JSON.stringify({
    seed: state.seed,
    size: state.size,
    campaignSize: state.campaignSize,
    scenario: state.scenario,
    counts: state.counts,
    simulatedAt: state.simulatedAt,
    p02: state.records.getLog('p02').map((entry) => entry.hash),
    members: state.campaignData.campaigns.map(
      (campaign) => campaign.memberContributorIds,
    ),
  });
}

function sharedFingerprint() {
  const state = simulationHost.ensureState();
  return {
    counts: state.counts,
    seed: state.seed,
    p02Hashes: state.records.getLog('p02').map((entry) => entry.hash),
    p10Hashes: state.records.getLog('p10').map((entry) => entry.hash),
  };
}

const VOUCH = {
  issuerProjectId: 'p08',
  subjectContributorId: 'c_new_good',
  type: 'vouch',
  reasonCode: 'verification_isolation',
  evidence: [{ kind: 'note', ref: 'isolation test' }],
};

test('two sandboxes with the same seed start identical and never share writes', () => {
  const alpha = new VerificationSandbox({ seed: 42 });
  const beta = new VerificationSandbox({ seed: 42 });
  try {
    assert.equal(
      sandboxFingerprint(alpha.state),
      sandboxFingerprint(beta.state),
      'Two sandboxes with the same seed should be byte-identical',
    );

    const signed = alpha.append(VOUCH);
    const alphaLog = alpha.refresh().records.getLog('p08');
    assert.ok(
      alphaLog.some((entry) => entry.record.id === signed.entry.record.id),
      'The signing visitor should see its own record after reopening the session',
    );

    const betaLog = beta.refresh().records.getLog('p08');
    assert.ok(
      !betaLog.some((entry) => entry.record.id === signed.entry.record.id),
      'Another visitor must not see the first visitor record',
    );

    const gamma = new VerificationSandbox({ seed: 42 });
    try {
      assert.ok(
        !gamma.state.records
          .getLog('p08')
          .some((entry) => entry.record.id === signed.entry.record.id),
        'A fresh sandbox must not inherit another visitor record',
      );
    } finally {
      gamma.dispose();
    }
  } finally {
    alpha.dispose();
    beta.dispose();
  }
});

test('sandbox rebuilds and tamper demos leave the shared demo world untouched', () => {
  const before = sharedFingerprint();

  const sandbox = new VerificationSandbox({ seed: 42 });
  try {
    sandbox.append(VOUCH);
    sandbox.rebuild({ seed: 7, campaignSize: 10 });
    sandbox.state.records.verifyProjectLog('p03', { tamper: 'signature' });
    sandbox.state.records.verifyProjectLog('p03', { tamper: 'chain' });
  } finally {
    sandbox.dispose();
  }

  assert.deepEqual(
    sharedFingerprint(),
    before,
    'Checks must not rebuild, sign or tamper with the shared demo world',
  );
});
