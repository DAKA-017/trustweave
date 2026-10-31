import test from 'node:test';
import assert from 'node:assert/strict';
import { GENESIS_HASH, hashRecord, signRecord, verifyRecordSignature } from '../utils/crypto.js';
import { createWorld, NOW, evidence } from './helpers.js';

test('a signed record verifies and its signature covers the payload', () => {
  const world = createWorld({ projects: [{ id: 'p1' }] });
  const record = world.append('p1', {
    type: 'vouch',
    subjectContributorId: 'c1',
    evidence: evidence(),
  });

  const result = world.records.verifyProjectLog('p1', { now: new Date(NOW) });
  assert.equal(result.valid, true);
  assert.equal(result.counts.active, 1);
  assert.deepEqual(result.entries[0].verification.issues, []);
  assert.equal(result.entries[0].verification.signatureValid, true);
  assert.equal(result.entries[0].verification.hashIntact, true);
  assert.equal(result.entries[0].verification.chainIntact, true);
  assert.equal(result.entries[0].record.previousRecordHash, GENESIS_HASH);
  assert.equal(result.entries[0].hash, hashRecord(result.entries[0].record));
  assert.equal(
    verifyRecordSignature(world.projects.get('p1').publicKey, record),
    true,
  );
});

test('signature tampering is rejected and the stored log stays intact', () => {
  const world = createWorld({ projects: [{ id: 'p1' }] });
  world.append('p1', { type: 'vouch', subjectContributorId: 'c1' });

  const tampered = world.records.verifyProjectLog('p1', {
    tamper: 'signature',
    now: new Date(NOW),
  });
  assert.equal(tampered.valid, false);
  assert.equal(tampered.counts.invalid, 1);
  assert.deepEqual(tampered.entries[0].verification.issues, [
    'invalid_signature',
    'hash_mismatch',
  ]);
  assert.equal(tampered.entries[0].verification.active, false);

  const untouched = world.records.verifyProjectLog('p1', { now: new Date(NOW) });
  assert.equal(untouched.valid, true);
});

test('changing a middle record breaks its hash and the next record chain link', () => {
  const world = createWorld({ projects: [{ id: 'p1' }] });
  world.append('p1', { type: 'vouch', subjectContributorId: 'c1' });
  const second = world.append('p1', { type: 'vouch', subjectContributorId: 'c2' });
  const third = world.append('p1', { type: 'vouch', subjectContributorId: 'c3' });

  const clean = world.records.verifyProjectLog('p1', { now: new Date(NOW) });
  assert.deepEqual(
    clean.entries.map((entry) => entry.record.previousRecordHash),
    [GENESIS_HASH, clean.entries[0].hash, clean.entries[1].hash],
  );
  assert.equal(clean.entries[2].record.previousRecordHash, clean.entries[1].hash);

  const broken = world.records.verifyProjectLog('p1', {
    tamper: 'chain',
    now: new Date(NOW),
  });
  assert.equal(broken.valid, false);
  assert.deepEqual(broken.counts, { valid: 1, invalid: 2, expired: 0, revoked: 0, active: 1 });
  assert.deepEqual(broken.entries[0].verification.issues, []);
  assert.deepEqual(broken.entries[1].verification.issues, [
    'invalid_signature',
    'hash_mismatch',
  ]);
  assert.deepEqual(broken.entries[2].verification.issues, ['broken_chain']);
  assert.equal(second.signature.length > 0, true);
  assert.equal(third.signature.length > 0, true);
});

test('a peer pull verifies the log and drops records that fail verification', () => {
  const world = createWorld({ projects: [{ id: 'p1' }, { id: 'p2' }] });
  world.append('p1', { type: 'vouch', subjectContributorId: 'c1' });
  world.append('p1', { type: 'vouch', subjectContributorId: 'c2' });

  const pull = world.records.pullPeerLog('p2', 'p1', { now: new Date(NOW) });
  assert.equal(pull.verified, true);
  assert.equal(pull.records.length, 2);

  world.records.getLog('p1')[0].record.reasonCode = 'tampered_in_place';
  const rejected = world.records.pullPeerLog('p2', 'p1', { now: new Date(NOW) });
  assert.equal(rejected.verified, false);
  assert.equal(rejected.records.length, 0);
});

test('expired records and revoked records are inactive but remain verifiable', () => {
  const world = createWorld({ projects: [{ id: 'p1' }] });
  const revokedTarget = world.append('p1', {
    type: 'vouch',
    subjectContributorId: 'c1',
    evidence: evidence(),
  });
  world.append('p1', {
    type: 'vouch',
    subjectContributorId: 'c2',
    evidence: evidence(),
    expiresAt: '2026-10-01T00:00:00.000Z',
  });
  const revoke = world.append('p1', {
    type: 'revoke',
    subjectContributorId: 'c1',
    subjectRecordId: revokedTarget.id,
    evidence: [{ kind: 'record', ref: revokedTarget.id }],
  });

  const result = world.records.verifyProjectLog('p1', { now: new Date(NOW) });
  assert.equal(result.valid, true);
  assert.deepEqual(result.counts, { valid: 3, invalid: 0, expired: 1, revoked: 1, active: 1 });
  assert.equal(result.entries[0].verification.revoked, true);
  assert.equal(result.entries[0].verification.revokedBy, revoke.id);
  assert.equal(result.entries[0].verification.active, false);
  assert.equal(result.entries[1].verification.expired, true);
  assert.equal(result.entries[1].verification.active, false);
  assert.equal(result.entries[2].verification.active, true);
});

test('records from a project with no registered key cannot be appended', () => {
  const world = createWorld({ projects: [{ id: 'p1' }] });
  assert.throws(
    () => world.records.append('ghost', { type: 'vouch', subjectContributorId: 'c1' }),
    /unknown project/i,
  );
});

test('deterministic signing produces the same signature for the same payload', () => {
  const world = createWorld({ projects: [{ id: 'p1' }] });
  const project = world.projects.get('p1');
  const record = {
    id: 'fixed',
    type: 'vouch',
    issuerProjectId: 'p1',
    subjectContributorId: 'c1',
    createdAt: NOW,
    reasonCode: 'reviewed',
    evidence: [],
    previousRecordHash: GENESIS_HASH,
  };
  const first = signRecord(
    world.records.privateKeys.get('p1'),
    record,
  );
  const second = signRecord(
    world.records.privateKeys.get('p1'),
    record,
  );
  assert.equal(first, second);
  assert.equal(verifyRecordSignature(project.publicKey, { ...record, signature: first }), true);
});
