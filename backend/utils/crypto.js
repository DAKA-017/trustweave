import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto';
import { canonicalize, recordPayload } from './canonical.js';

export const GENESIS_HASH = '0'.repeat(64);

const ED25519_PKCS8_PREFIX = Buffer.from(
  '302e020100300506032b657004220420',
  'hex',
);

/**
 * Deterministic per-project keypair derived from the simulation seed and the
 * project id. Real deployments would generate keys on the maintainer's device;
 * determinism here only makes the simulation reproducible.
 */
export function deterministicKeyPair(namespace) {
  const seed = createHash('sha256').update(`trustweave:${namespace}`).digest();
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKey = createPublicKey(privateKey);
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

export function signRecord(privateKeyPem, record) {
  return sign(
    null,
    Buffer.from(canonicalize(recordPayload(record))),
    privateKeyPem,
  ).toString('base64');
}

export function verifyRecordSignature(publicKeyPem, record) {
  if (!record?.signature) return false;
  try {
    return verify(
      null,
      Buffer.from(canonicalize(recordPayload(record))),
      publicKeyPem,
      Buffer.from(record.signature, 'base64'),
    );
  } catch {
    return false;
  }
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function hashRecord(record) {
  return sha256(canonicalize(record));
}
