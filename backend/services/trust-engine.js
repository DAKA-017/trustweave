const CLUSTER_TRUST_THRESHOLD = 0.5;
const MAX_VOUCH_SINGLE_SOURCE = 0.5;
const MAX_VOUCH_TOTAL = 1;
const ROUND = (value) => Math.round(value * 1000) / 1000;

class UnionFind {
  constructor(ids) {
    this.parent = new Map(ids.map((id) => [id, id]));
  }

  find(id) {
    if (!this.parent.has(id)) this.parent.set(id, id);
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    let current = id;
    while (this.parent.get(current) !== root) {
      const next = this.parent.get(current);
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

/**
 * Effective trust from the evaluating project to every other project.
 * Strongest path wins, path value is the product of edge weights, cycles are
 * avoided by tracking the current path, and depth counts edges (default 3).
 */
export function computeEffectiveTrust(project, projects, { maxDepth } = {}) {
  const depthLimit = maxDepth ?? project.thresholds?.maxDepth ?? 3;
  const best = new Map([[project.id, 1]]);

  const visit = (nodeId, visited, product, depth) => {
    const node = projects.get(nodeId);
    if (!node) return;
    for (const [peerId, weight] of Object.entries(node.trustConfig ?? {})) {
      if (!projects.has(peerId) || visited.has(peerId) || weight <= 0) continue;
      const value = product * weight;
      if (value > (best.get(peerId) ?? 0)) best.set(peerId, value);
      if (depth < depthLimit) {
        visit(peerId, new Set([...visited, peerId]), value, depth + 1);
      }
    }
  };

  visit(project.id, new Set([project.id]), 1, 1);
  return best;
}

/** Mutual-trust clusters. Projects that only point at each other weakly are not merged. */
export function computeTrustClusters(projects) {
  const ids = [...projects.keys()];
  const uf = new UnionFind(ids);
  const projectList = [...projects.values()];

  for (const a of projectList) {
    for (const b of projectList) {
      if (a.id >= b.id) continue;
      const ab = a.trustConfig?.[b.id] ?? 0;
      const ba = b.trustConfig?.[a.id] ?? 0;
      if (ab >= CLUSTER_TRUST_THRESHOLD && ba >= CLUSTER_TRUST_THRESHOLD) {
        uf.union(a.id, b.id);
      }
    }
  }

  const byMaintainer = new Map();
  for (const project of projectList) {
    for (const maintainer of project.maintainerIds ?? []) {
      if (!byMaintainer.has(maintainer)) byMaintainer.set(maintainer, []);
      byMaintainer.get(maintainer).push(project.id);
    }
  }
  for (const idsForMaintainer of byMaintainer.values()) {
    for (let i = 1; i < idsForMaintainer.length; i += 1) {
      uf.union(idsForMaintainer[0], idsForMaintainer[i]);
    }
  }

  return new Map(ids.map((id) => [id, uf.find(id)]));
}

function shareMaintainer(a, b) {
  const set = new Set(a.maintainerIds ?? []);
  return (b.maintainerIds ?? []).some((id) => set.has(id));
}

/** Map each issuer project to an independence source id. Shared for signals and assessments. */
export function independenceGroups(issuerIds, projects) {
  const clusters = computeTrustClusters(projects);
  const unique = [...new Set(issuerIds)];
  const sourceOf = groupIssuers(unique, projects, clusters);
  return new Map(unique.map((id) => [id, sourceOf(id)]));
}

/** Denouncers that share maintainers or a trust cluster are one source. */
function groupIssuers(issuerIds, projects, clusters) {
  const uf = new UnionFind(issuerIds);
  for (let i = 0; i < issuerIds.length; i += 1) {
    for (let j = i + 1; j < issuerIds.length; j += 1) {
      const a = issuerIds[i];
      const b = issuerIds[j];
      const pa = projects.get(a);
      const pb = projects.get(b);
      if (!pa || !pb) continue;
      if (clusters.get(a) === clusters.get(b) || shareMaintainer(pa, pb)) {
        uf.union(a, b);
      }
    }
  }
  return (id) => uf.find(id);
}

function buildIssuerDownweightFactors(snapshot, totalContributors) {
  const denouncedSubjects = new Map();
  for (const record of snapshot.activeRecords) {
    if (record.type !== 'denounce') continue;
    if (!denouncedSubjects.has(record.issuerProjectId)) {
      denouncedSubjects.set(record.issuerProjectId, new Set());
    }
    denouncedSubjects.get(record.issuerProjectId).add(record.subjectContributorId);
  }

  const factors = new Map();
  for (const [issuerId, subjects] of denouncedSubjects) {
    const ratio = subjects.size / Math.max(1, totalContributors);
    const factor =
      subjects.size >= 5 && ratio > 0.5
        ? Math.max(0.15, 0.5 / ratio)
        : 1;
    factors.set(issuerId, factor);
  }
  return factors;
}

function recordReference(record) {
  return {
    kind: 'record',
    id: record.id,
    projectId: record.issuerProjectId,
  };
}

function reason(type, weight, message, references) {
  return { type, weight, message, references };
}

function whatWouldChange(outcome, summary) {
  if (outcome === 'flagged') {
    return `The outcome would drop if the evidence behind it is revoked, expires, or turns out to be correlated. Revoking one of the independent sources, or disproving one signal type, leaves at most ${summary.signalTypes.length + summary.evidenceBackedDenounceSources - 1} independent indicator(s), which can only reach caution. A single source or a single signal type can never flag a contributor.`;
  }
  if (outcome === 'caution') {
    return 'One more independent, evidence-backed denouncement from a project this project trusts, or a second independent behavioral signal, would move this to flagged. If the current record expires, is revoked, or its issuer loses trust, the outcome returns to normal review.';
  }
  return 'Two independent, evidence-backed denouncements from trusted projects, or two independent behavioral signal types, would flag this contributor. One signal, one denouncement, or a project with no effective trust cannot.';
}

/**
 * Evaluate one contributor "as project X". Every number here is a signal
 * weight, not a spam probability.
 */
export function evaluateContributor({
  evaluatingProject,
  contributorId,
  projects,
  contributors,
  snapshot,
  campaignData,
  pullRequests = [],
  now = new Date(),
  trustCache,
  clusterCache,
}) {
  const project = evaluatingProject;
  const thresholds = project.thresholds ?? {};
  const cautionThreshold = thresholds.caution ?? 0.5;
  const flaggedThreshold = thresholds.flagged ?? 1;
  const minSources = thresholds.minIndependentSources ?? 2;

  const trustKey = `${project.id}:${thresholds.maxDepth ?? 3}`;
  let trust = trustCache?.get(trustKey);
  if (!trust) {
    trust = computeEffectiveTrust(project, projects);
    trustCache?.set(trustKey, trust);
  }
  let clusters = clusterCache?.get('clusters');
  if (!clusters) {
    clusters = computeTrustClusters(projects);
    clusterCache?.set('clusters', clusters);
  }
  const activeContributorCount = new Set(
    pullRequests.map((pr) => pr.contributorId),
  ).size;
  const issuerFactors = buildIssuerDownweightFactors(
    snapshot,
    activeContributorCount || contributors.size,
  );

  const targetRecords = [];
  const seenIds = new Set();
  for (const outcome of snapshot.recordById.values()) {
    const record = outcome.record;
    if (record.subjectContributorId !== contributorId) continue;
    if (seenIds.has(record.id)) continue;
    seenIds.add(record.id);
    targetRecords.push(outcome);
  }

  const reasons = [];
  const contributingRecords = [];
  const activeDenounces = [];
  const activeVouches = [];
  const ignored = [];

  for (const { record, verification } of targetRecords) {
    if (verification.integrity !== 'valid') {
      ignored.push({ record, verification, why: 'invalid' });
      continue;
    }
    if (!verification.active) {
      ignored.push({
        record,
        verification,
        why: verification.revoked ? 'revoked' : 'expired',
      });
      continue;
    }
    if (record.type === 'denounce') activeDenounces.push({ record, verification });
    if (record.type === 'vouch') activeVouches.push({ record, verification });
  }

  const denounceCandidates = [];
  for (const { record, verification } of activeDenounces) {
    const effectiveTrust = trust.get(record.issuerProjectId) ?? 0;
    contributingRecords.push({ ...record, verification });
    if (effectiveTrust <= 0) {
      ignored.push({ record, verification, why: 'untrusted_issuer' });
      continue;
    }
    if ((record.evidence ?? []).length === 0) {
      ignored.push({ record, verification, why: 'no_evidence' });
      continue;
    }
    const massFactor = issuerFactors.get(record.issuerProjectId) ?? 1;
    denounceCandidates.push({
      record,
      verification,
      sourceId: record.issuerProjectId,
      effectiveTrust,
      massFactor,
      weight: effectiveTrust * massFactor,
    });
  }

  const issuerIds = [...new Set(denounceCandidates.map((item) => item.sourceId))];
  const sourceOf = groupIssuers(issuerIds, projects, clusters);
  const grouped = new Map();
  for (const candidate of denounceCandidates) {
    const key = sourceOf(candidate.sourceId);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(candidate);
  }

  let denounceScore = 0;
  let evidenceBackedDenounceSources = 0;
  for (const group of grouped.values()) {
    group.sort((a, b) => b.weight - a.weight);
    const [primary, ...correlated] = group;
    const rounded = ROUND(primary.weight);
    if (rounded > 0) {
      evidenceBackedDenounceSources += 1;
      denounceScore += primary.weight;
      const factorNote =
        primary.massFactor < 1
          ? ` Down-weighted by ${ROUND(primary.massFactor)} because this project denounces an unusually large share of contributors.`
          : '';
      reasons.push(
        reason(
          'evidence_backed_denouncement',
          rounded,
          `Evidence-backed denouncement from ${primary.record.issuerProjectId} (reason: ${primary.record.reasonCode}); scaled by effective trust ${ROUND(primary.effectiveTrust)}.${factorNote}`,
          [recordReference(primary.record)],
        ),
      );
    }
    for (const item of correlated) {
      reasons.push(
        reason(
          'correlated_denouncement',
          0,
          `Denouncement from ${item.record.issuerProjectId} counted as one source with ${primary.record.issuerProjectId} (shared maintainers or same trust cluster).`,
          [recordReference(item.record)],
        ),
      );
    }
  }

  const vouchCandidates = [];
  for (const { record, verification } of activeVouches) {
    const effectiveTrust = trust.get(record.issuerProjectId) ?? 0;
    contributingRecords.push({ ...record, verification });
    if (effectiveTrust <= 0) {
      ignored.push({ record, verification, why: 'untrusted_issuer' });
      continue;
    }
    const evidenceScale = (record.evidence ?? []).length > 0 ? 1 : 0.5;
    vouchCandidates.push({
      record,
      verification,
      sourceId: record.issuerProjectId,
      effectiveTrust,
      weight: effectiveTrust * evidenceScale,
    });
  }

  const vouchIssuerIds = [...new Set(vouchCandidates.map((item) => item.sourceId))];
  const vouchSourceOf = groupIssuers(vouchIssuerIds, projects, clusters);
  const vouchGroups = new Map();
  for (const candidate of vouchCandidates) {
    const key = vouchSourceOf(candidate.sourceId);
    if (!vouchGroups.has(key)) vouchGroups.set(key, []);
    vouchGroups.get(key).push(candidate);
  }
  let vouchSupport = 0;
  for (const group of vouchGroups.values()) {
    const best = group.reduce((a, b) => (a.weight >= b.weight ? a : b));
    const capped = Math.min(MAX_VOUCH_SINGLE_SOURCE, best.weight);
    if (capped <= 0) continue;
    vouchSupport += capped;
    reasons.push(
      reason(
        'vouch_support',
        ROUND(capped),
        `Vouch from ${best.record.issuerProjectId} supports this contributor; single-source weight is capped at ${MAX_VOUCH_SINGLE_SOURCE} and vouches never erase evidence-backed denouncements.`,
        [recordReference(best.record)],
      ),
    );
  }
  vouchSupport = Math.min(MAX_VOUCH_TOTAL, vouchSupport);

  const signals = (campaignData?.signalsByContributor?.[contributorId] ?? []).map(
    (signal) => ({ ...signal }),
  );
  const signalTypes = [...new Set(signals.map((signal) => signal.type))];
  for (const signal of signals) {
    const refs = [...(signal.evidence ?? [])];
    if (signal.campaignId) {
      refs.push({ kind: 'campaign', id: signal.campaignId });
    }
    if (refs.length === 0) {
      refs.push({ kind: 'contributor', id: contributorId });
    }
    reasons.push(
      reason(
        `behavioral_signal:${signal.type}`,
        ROUND(signal.weight ?? 0.7),
        signal.description,
        refs,
      ),
    );
  }

  for (const item of ignored) {
    const { record, verification, why } = item;
    let message;
    if (why === 'no_evidence') {
      message = `Denouncement from ${record.issuerProjectId} ignored: no evidence attached, so its weight is zero.`;
    } else if (why === 'untrusted_issuer') {
      message = `Record from ${record.issuerProjectId} ignored: this project gives that issuer zero effective trust.`;
    } else if (why === 'expired') {
      message = `Record from ${record.issuerProjectId} ignored: it expired (appeal path).`;
    } else if (why === 'revoked') {
      message = `Record from ${record.issuerProjectId} ignored: it was revoked by its issuer (appeal path).`;
    } else {
      message = `Record from ${record.issuerProjectId} rejected: signature or hash-chain verification failed.`;
    }
    reasons.push(
      reason('ignored_record', 0, message, [recordReference(record)]),
    );
    if (why === 'invalid') {
      contributingRecords.push({ ...record, verification });
    }
  }

  const flaggedByDenouncements =
    evidenceBackedDenounceSources >= minSources &&
    denounceScore >= flaggedThreshold;
  const flaggedBySignals = signalTypes.length >= 2;
  let outcome = 'normal_review';
  if (flaggedByDenouncements || flaggedBySignals) {
    outcome = 'flagged';
  } else if (
    (evidenceBackedDenounceSources >= 1 && denounceScore >= cautionThreshold) ||
    signalTypes.length === 1
  ) {
    outcome = 'caution';
  }

  const negativeReasons = reasons.filter(
    (item) =>
      item.weight > 0 &&
      item.type !== 'vouch_support' &&
      !item.type.startsWith('behavioral_signal:'),
  );
  const hasAnyRecord = targetRecords.length > 0;
  if (
    outcome === 'normal_review' &&
    !hasAnyRecord &&
    signals.length === 0
  ) {
    reasons.push(
      reason(
        'newcomer_neutral',
        0,
        'No history. Treated as neutral.',
        [{ kind: 'contributor', id: contributorId }],
      ),
    );
  }

  reasons.sort((a, b) => b.weight - a.weight);
  const uniqueRecords = [];
  const recordSeen = new Set();
  for (const record of contributingRecords) {
    if (recordSeen.has(record.id)) continue;
    recordSeen.add(record.id);
    uniqueRecords.push(record);
  }

  const summary = {
    evidenceBackedDenounceSources,
    denounceScore: ROUND(denounceScore),
    vouchSupport: ROUND(vouchSupport),
    signalTypes,
    ignoredRecords: ignored.length,
    thresholds: {
      caution: cautionThreshold,
      flagged: flaggedThreshold,
      minIndependentSources: minSources,
    },
  };

  return {
    evaluatingProjectId: project.id,
    contributorId,
    outcome,
    reasons,
    contributingRecords: uniqueRecords,
    signals,
    whatWouldChangeThis: whatWouldChange(outcome, summary),
    note:
      outcome === 'normal_review'
        ? signals.length === 0 && negativeReasons.length === 0
          ? hasAnyRecord
            ? 'No countable negative evidence. Neutral by default.'
            : 'No history. Treated as neutral.'
          : 'No countable negative evidence reached this project.'
        : undefined,
    summary,
    evaluatedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
  };
}
