import { RecordsService } from '../services/records.js';
import { deterministicKeyPair } from '../utils/crypto.js';
import { evaluateContributor } from '../services/trust-engine.js';

export const NOW = '2026-11-01T12:00:00.000Z';

export function createWorld({
  projects: projectDefs,
  contributors: contributorDefs = [],
  now = NOW,
}) {
  const nowDate = new Date(now);
  const records = new RecordsService({ clock: () => nowDate });
  const projects = new Map();

  for (const def of projectDefs) {
    const keys = deterministicKeyPair(`test-world:${def.id}`);
    const project = {
      id: def.id,
      name: def.name ?? def.id,
      publicKey: keys.publicKey,
      maintainerIds: def.maintainerIds ?? [],
      trustConfig: def.trustConfig ?? {},
      thresholds: {
        caution: 0.5,
        flagged: 1,
        maxDepth: 3,
        minIndependentSources: 2,
        ...(def.thresholds ?? {}),
      },
    };
    projects.set(project.id, project);
    records.registerProject(project, keys.privateKey);
  }

  const contributors = new Map();
  for (const def of contributorDefs) {
    contributors.set(def.id, {
      handle: def.id,
      accountCreatedAt: '2025-01-01T00:00:00.000Z',
      ...def,
    });
  }

  const append = (issuerProjectId, core) =>
    records.append(
      issuerProjectId,
      {
        type: core.type,
        issuerProjectId,
        subjectContributorId: core.subjectContributorId,
        subjectRecordId: core.subjectRecordId,
        reasonCode: core.reasonCode ?? core.type,
        evidence: core.evidence ?? [],
        createdAt: core.createdAt,
        expiresAt: core.expiresAt,
      },
      { now: nowDate },
    ).record;

  const snapshot = (at = nowDate) => records.createSnapshot({ now: at });

  const assess = (
    asProject,
    contributorId,
    { pullRequests = [], campaignData = null, at = nowDate } = {},
  ) =>
    evaluateContributor({
      evaluatingProject: projects.get(asProject),
      contributorId,
      projects,
      contributors,
      snapshot: records.createSnapshot({ now: at }),
      campaignData,
      pullRequests,
      now: at,
    });

  return {
    projects,
    contributors,
    records,
    append,
    snapshot,
    assess,
    now: nowDate,
  };
}

export const evidence = (ref = 'example://simulated-evidence') => [
  { kind: 'link', ref },
];

export const prEvidence = (ref = 'pr_0001') => [{ kind: 'pull_request', ref }];
