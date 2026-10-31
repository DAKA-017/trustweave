import { GENESIS_HASH, hashRecord, signRecord, verifyRecordSignature } from '../utils/crypto.js';
import { signedRecordSchema } from '../models/schemas.js';

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function tamperSignature(record) {
  const first = record.signature.slice(0, 1);
  return {
    ...record,
    signature: `${first === 'A' ? 'B' : 'A'}${record.signature.slice(1)}`,
  };
}

/**
 * Append-only, hash-chained record logs. The simulation host keeps one log per
 * simulated project; peers "pull" copies and verify the chain and signatures
 * themselves. There is no privileged verifier in the design.
 */
export class RecordsService {
  constructor({ clock = () => new Date() } = {}) {
    this.clock = clock;
    this.logs = new Map();
    this.privateKeys = new Map();
    this.publicKeys = new Map();
  }

  registerProject(project, privateKey) {
    this.publicKeys.set(project.id, project.publicKey);
    this.privateKeys.set(project.id, privateKey);
    if (!this.logs.has(project.id)) this.logs.set(project.id, []);
  }

  getLog(projectId) {
    return this.logs.get(projectId) ?? [];
  }

  nextRecordId(projectId) {
    return `r_${projectId}_${this.getLog(projectId).length + 1}`;
  }

  append(projectId, core, { now = this.clock() } = {}) {
    if (!this.privateKeys.has(projectId)) {
      throw new Error(`Cannot append a record for unknown project ${projectId}`);
    }
    const log = this.getLog(projectId);
    const previousRecordHash = log.length
      ? log[log.length - 1].hash
      : GENESIS_HASH;

    const record = {
      ...core,
      id: core.id ?? this.nextRecordId(projectId),
      createdAt: core.createdAt ?? toIso(now),
      evidence: core.evidence ?? [],
      previousRecordHash,
    };
    record.signature = signRecord(this.privateKeys.get(projectId), record);

    const parsed = signedRecordSchema.safeParse(record);
    if (!parsed.success) {
      throw new Error(`Produced an invalid record: ${parsed.error.message}`);
    }

    const entry = { index: log.length, record: parsed.data, hash: hashRecord(parsed.data) };
    log.push(entry);
    return structuredClone(entry);
  }

  verifyProjectLog(projectId, { tamper = 'none', now = this.clock() } = {}) {
    const nowDate = now instanceof Date ? now : new Date(now);
    const entries = structuredClone(this.getLog(projectId));

    if (tamper === 'signature' && entries.length > 0) {
      const last = entries[entries.length - 1];
      last.record = tamperSignature(last.record);
    }
    if (tamper === 'chain' && entries.length > 1) {
      const middle = entries[Math.floor(entries.length / 2)];
      middle.record = {
        ...middle.record,
        reasonCode: `${middle.record.reasonCode}_tampered`,
      };
    }

    const publicKey = this.publicKeys.get(projectId);
    const checks = entries.map((entry, index) => {
      const signatureValid = publicKey
        ? verifyRecordSignature(publicKey, entry.record)
        : false;
      const hashIntact = hashRecord(entry.record) === entry.hash;
      const previousActual =
        index === 0 ? GENESIS_HASH : hashRecord(entries[index - 1].record);
      const chainIntact =
        entry.record.previousRecordHash === previousActual;
      const issues = [];
      if (!signatureValid) issues.push('invalid_signature');
      if (!hashIntact) issues.push('hash_mismatch');
      if (!chainIntact) issues.push('broken_chain');
      return {
        integrity: issues.length === 0 ? 'valid' : 'invalid',
        signatureValid,
        hashIntact,
        chainIntact,
        issues,
      };
    });

    const byId = new Map(entries.map((entry) => [entry.record.id, entry]));
    const revocations = new Map();
    entries.forEach((entry, index) => {
      const record = entry.record;
      if (checks[index].integrity !== 'valid') return;
      if (record.type !== 'revoke' || !record.subjectRecordId) return;
      if (record.issuerProjectId !== projectId) return;
      if (record.expiresAt && new Date(record.expiresAt) <= nowDate) return;
      const target = byId.get(record.subjectRecordId);
      if (!target || target.record.issuerProjectId !== projectId) return;
      if (new Date(target.record.createdAt) > new Date(record.createdAt)) return;
      if (!revocations.has(target.record.id)) {
        revocations.set(target.record.id, record.id);
      }
    });

    const verified = entries.map((entry, index) => {
      const record = entry.record;
      const expired = Boolean(
        record.expiresAt && new Date(record.expiresAt) <= nowDate,
      );
      const revoked = revocations.has(record.id);
      const integrity = checks[index].integrity;
      return {
        index,
        record,
        hash: entry.hash,
        verification: {
          ...checks[index],
          expired,
          revoked,
          revokedBy: revocations.get(record.id) ?? null,
          active: integrity === 'valid' && !expired && !revoked,
        },
      };
    });

    const counts = verified.reduce(
      (acc, entry) => {
        if (entry.verification.integrity === 'valid') acc.valid += 1;
        else acc.invalid += 1;
        if (entry.verification.expired) acc.expired += 1;
        if (entry.verification.revoked) acc.revoked += 1;
        if (entry.verification.active) acc.active += 1;
        return acc;
      },
      { valid: 0, invalid: 0, expired: 0, revoked: 0, active: 0 },
    );

    return {
      projectId,
      tamper,
      verifiedAt: nowDate.toISOString(),
      valid: counts.invalid === 0,
      counts,
      entries: verified,
    };
  }

  /**
   * Simulated gossip: one project requests a peer's log and verifies it without
   * trusting the peer's word about validity.
   */
  pullPeerLog(requesterProjectId, peerProjectId, { now = this.clock() } = {}) {
    const result = this.verifyProjectLog(peerProjectId, { now });
    return {
      requesterProjectId,
      peerProjectId,
      verified: result.valid,
      counts: result.counts,
      records: result.entries
        .filter((entry) => entry.verification.integrity === 'valid')
        .map((entry) => entry.record),
    };
  }

  createSnapshot({ now = this.clock() } = {}) {
    const nowDate = now instanceof Date ? now : new Date(now);
    const logs = new Map();
    const activeRecords = [];
    const recordById = new Map();

    for (const projectId of this.logs.keys()) {
      const verification = this.verifyProjectLog(projectId, { now: nowDate });
      logs.set(projectId, verification);
      for (const entry of verification.entries) {
        recordById.set(entry.record.id, {
          record: entry.record,
          projectId,
          verification: entry.verification,
        });
        if (entry.verification.active) {
          activeRecords.push({
            ...entry.record,
            verification: entry.verification,
          });
        }
      }
    }

    return {
      generatedAt: nowDate.toISOString(),
      logs,
      activeRecords,
      recordById,
      verificationFor: (projectId) => logs.get(projectId) ?? null,
    };
  }
}
