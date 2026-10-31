import { jaccard, shingles } from '../utils/similarity.js';
import { independenceGroups } from './trust-engine.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const DEFAULT_OPTIONS = Object.freeze({
  similarityThreshold: 0.82,
  minDuplicateProjects: 3,
  burstWindowHours: 48,
  burstMinPrs: 5,
  burstMinProjects: 4,
  syncWindowHours: 6,
  syncNewAccountDays: 21,
  syncMinAccounts: 6,
  syncMinProjects: 6,
  volumeMinPrs: 10,
  lowMergeRate: 0.15,
  denounceWindowDays: 30,
  denounceMinRecords: 3,
  denounceMinSources: 2,
  ringMinOutsideSupport: 1,
});

const SIGNAL_ORDER = [
  'near_duplicate_content',
  'burst_timing',
  'new_accounts_in_sync',
  'vouch_ring',
  'high_volume_low_merge',
  'denouncement_burst',
];

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

function stronglyConnectedComponents(nodes, adjacency) {
  let counter = 0;
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  const connect = (node) => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of adjacency.get(node) ?? []) {
      if (!index.has(next)) {
        connect(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), index.get(next)));
      }
    }

    if (low.get(node) === index.get(node)) {
      const component = [];
      let current;
      do {
        current = stack.pop();
        onStack.delete(current);
        component.push(current);
      } while (current !== node);
      components.push(component);
    }
  };

  for (const node of nodes) {
    if (!index.has(node)) connect(node);
  }
  return components;
}

const toTime = (value) => new Date(value).getTime();
const prRef = (pr) => ({
  kind: 'pull_request',
  id: pr.id,
  projectId: pr.projectId,
});
const uniqueRefs = (refs) => {
  const seen = new Set();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function evidenceBreakdown(refs) {
  return refs.reduce((totals, ref) => {
    totals[ref.kind] = (totals[ref.kind] ?? 0) + 1;
    return totals;
  }, {});
}

function signal(type, weight, description, evidence) {
  return { type, weight, description, evidence: uniqueRefs(evidence) };
}

function findBurst(prs, { windowHours, minPrs, minProjects }) {
  const sorted = [...prs].sort((a, b) => a.time - b.time);
  let left = 0;
  let best = null;
  for (let right = 0; right < sorted.length; right += 1) {
    while (sorted[right].time - sorted[left].time > windowHours * HOUR) left += 1;
    const window = sorted.slice(left, right + 1);
    const projectIds = new Set(window.map((pr) => pr.projectId));
    if (window.length >= minPrs && projectIds.size >= minProjects) {
      if (!best || window.length > best.prs.length) {
        best = { prs: window, projectIds: [...projectIds] };
      }
    }
  }
  return best;
}

/**
 * Network-wide, independent behavioral signals. Each signal is explainable and
 * references concrete PRs or records. No AI-text detection is performed.
 */
export function detectCampaigns({
  projects,
  contributors,
  pullRequests,
  snapshot,
  now = new Date(),
  options = {},
}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const nowTime = toTime(now);

  const prsByContributor = new Map();
  for (const pr of pullRequests) {
    if (!prsByContributor.has(pr.contributorId)) prsByContributor.set(pr.contributorId, []);
    prsByContributor.get(pr.contributorId).push({
      ...pr,
      time: toTime(pr.createdAt),
    });
  }
  const contributorIds = [...prsByContributor.keys()].sort();
  const allNodes = new Set(contributorIds);
  for (const record of snapshot.activeRecords) {
    allNodes.add(record.subjectContributorId);
  }

  const shingleCache = new Map();
  for (const pr of pullRequests) {
    shingleCache.set(
      pr.id,
      shingles(pr.contentSample || `changes to ${pr.changedPathsSummary}`),
    );
  }

  const campaignUnion = new UnionFind([...allNodes]);
  const signalsByContributor = new Map(
    [...allNodes].map((id) => [id, new Map()]),
  );
  const addSignal = (contributorId, value) => {
    if (!signalsByContributor.has(contributorId)) {
      signalsByContributor.set(contributorId, new Map());
    }
    const existing = signalsByContributor.get(contributorId);
    if (!existing.has(value.type)) existing.set(value.type, value);
  };

  // 1) Near-duplicate PR content across projects, plus edges between similar accounts.
  const duplicatePrs = new Map();
  const duplicateProjects = new Map();
  const markDuplicate = (contributorId, pr) => {
    if (!duplicatePrs.has(contributorId)) duplicatePrs.set(contributorId, new Set());
    if (!duplicateProjects.has(contributorId)) duplicateProjects.set(contributorId, new Set());
    duplicatePrs.get(contributorId).add(pr.id);
    duplicateProjects.get(contributorId).add(pr.projectId);
  };

  for (const contributorId of contributorIds) {
    const list = prsByContributor.get(contributorId);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (list[i].projectId === list[j].projectId) continue;
        if (
          jaccard(shingleCache.get(list[i].id), shingleCache.get(list[j].id)) >=
          opts.similarityThreshold
        ) {
          markDuplicate(contributorId, list[i]);
          markDuplicate(contributorId, list[j]);
        }
      }
    }
  }

  const similarityEdges = new Set();
  for (let i = 0; i < contributorIds.length; i += 1) {
    for (let j = i + 1; j < contributorIds.length; j += 1) {
      const a = contributorIds[i];
      const b = contributorIds[j];
      let linked = false;
      for (const prA of prsByContributor.get(a)) {
        for (const prB of prsByContributor.get(b)) {
          if (prA.projectId === prB.projectId) continue;
          if (
            jaccard(shingleCache.get(prA.id), shingleCache.get(prB.id)) >=
            opts.similarityThreshold
          ) {
            linked = true;
            markDuplicate(a, prA);
            markDuplicate(a, prB);
            markDuplicate(b, prA);
            markDuplicate(b, prB);
          }
        }
      }
      if (linked) {
        similarityEdges.add(`${a}|${b}`);
        campaignUnion.union(a, b);
      }
    }
  }

  for (const contributorId of contributorIds) {
    const prs = duplicatePrs.get(contributorId);
    const projectsInvolved = duplicateProjects.get(contributorId);
    if (!prs || !projectsInvolved) continue;
    if (projectsInvolved.size < opts.minDuplicateProjects) continue;
    const evidence = prsByContributor
      .get(contributorId)
      .filter((pr) => prs.has(pr.id))
      .slice(0, 10)
      .map(prRef);
    addSignal(
      contributorId,
      signal(
        'near_duplicate_content',
        0.8,
        `${prs.size} near-duplicate PRs across ${projectsInvolved.size} projects (similarity threshold ${opts.similarityThreshold}).`,
        evidence,
      ),
    );
  }

  // 2) Personal burst: many PRs to many projects in a short window.
  for (const contributorId of contributorIds) {
    const burst = findBurst(prsByContributor.get(contributorId), {
      windowHours: opts.burstWindowHours,
      minPrs: opts.burstMinPrs,
      minProjects: opts.burstMinProjects,
    });
    if (!burst) continue;
    addSignal(
      contributorId,
      signal(
        'burst_timing',
        0.7,
        `${burst.prs.length} PRs across ${burst.projectIds.length} projects within ${opts.burstWindowHours} hours.`,
        burst.prs.slice(0, 12).map(prRef),
      ),
    );
  }

  // 3) Very new accounts acting in sync within a 6-hour window.
  const newAccounts = contributorIds.filter((id) => {
    const contributor = contributors.get(id);
    if (!contributor) return false;
    return nowTime - toTime(contributor.accountCreatedAt) <= opts.syncNewAccountDays * DAY;
  });
  const newEvents = [];
  for (const contributorId of newAccounts) {
    for (const pr of prsByContributor.get(contributorId)) {
      newEvents.push({ ...pr, time: toTime(pr.createdAt), contributorId });
    }
  }
  newEvents.sort((a, b) => a.time - b.time);

  const syncGroups = new Map();
  let left = 0;
  for (let right = 0; right < newEvents.length; right += 1) {
    while (newEvents[right].time - newEvents[left].time > opts.syncWindowHours * HOUR) {
      left += 1;
    }
    const window = newEvents.slice(left, right + 1);
    const ids = [...new Set(window.map((event) => event.contributorId))].sort();
    const projectIds = new Set(window.map((event) => event.projectId));
    if (ids.length < opts.syncMinAccounts || projectIds.size < opts.syncMinProjects) {
      continue;
    }
    const key = ids.join('|');
    if (!syncGroups.has(key)) {
      syncGroups.set(key, { ids, window });
    }
  }

  for (const group of syncGroups.values()) {
    for (let i = 1; i < group.ids.length; i += 1) {
      campaignUnion.union(group.ids[0], group.ids[i]);
    }
    for (const contributorId of group.ids) {
      const ownPrs = group.window.filter((event) => event.contributorId === contributorId);
      const projectCount = new Set(group.window.map((event) => event.projectId)).size;
      addSignal(
        contributorId,
        signal(
          'new_accounts_in_sync',
          0.75,
          `${group.ids.length} accounts created within ${opts.syncNewAccountDays} days submitted ${group.window.length} PRs across ${projectCount} projects inside a ${opts.syncWindowHours}-hour window.`,
          ownPrs.slice(0, 10).map((pr) => prRef(pr)),
        ),
      );
    }
  }

  // 4) Vouch rings: closed loops with little trust from outside the loop.
  const adjacency = new Map();
  const maintainerProjects = new Map();
  for (const project of projects.values()) {
    for (const maintainer of project.maintainerIds ?? []) {
      if (!maintainerProjects.has(maintainer)) maintainerProjects.set(maintainer, []);
      maintainerProjects.get(maintainer).push(project.id);
      allNodes.add(maintainer);
      campaignUnion.find(maintainer);
    }
  }

  const vouchRecords = snapshot.activeRecords.filter(
    (record) => record.type === 'vouch',
  );
  for (const record of vouchRecords) {
    const issuer = projects.get(record.issuerProjectId);
    if (!issuer) continue;
    for (const maintainer of issuer.maintainerIds ?? []) {
      if (!adjacency.has(maintainer)) adjacency.set(maintainer, new Set());
      adjacency.get(maintainer).add(record.subjectContributorId);
      allNodes.add(maintainer);
      allNodes.add(record.subjectContributorId);
      campaignUnion.find(maintainer);
      campaignUnion.find(record.subjectContributorId);
    }
  }

  const ringNodes = [...adjacency.keys()].sort();
  const components = stronglyConnectedComponents(ringNodes, adjacency);
  for (const component of components) {
    const memberSet = new Set(component);
    if (component.length < 2) continue;

    let outsideSupport = 0;
    const ringEvidence = [];
    for (const record of vouchRecords) {
      if (!memberSet.has(record.subjectContributorId)) continue;
      const issuer = projects.get(record.issuerProjectId);
      const maintainers = issuer?.maintainerIds ?? [];
      if (maintainers.length === 0) continue;
      const controlledInside = maintainers.some((id) => memberSet.has(id));
      if (!controlledInside) {
        outsideSupport += 1;
      } else {
        ringEvidence.push({
          kind: 'record',
          id: record.id,
          projectId: record.issuerProjectId,
        });
      }
    }

    const allMembersNew = component.every((id) => {
      const contributor = contributors.get(id);
      return (
        contributor &&
        nowTime - toTime(contributor.accountCreatedAt) <= 60 * DAY
      );
    });
    const eligible =
      outsideSupport <= opts.ringMinOutsideSupport &&
      (component.length >= 3 || (component.length === 2 && allMembersNew));
    if (!eligible) continue;

    for (let i = 1; i < component.length; i += 1) {
      campaignUnion.union(component[0], component[i]);
    }
    for (const member of component) {
      addSignal(
        member,
        signal(
          'vouch_ring',
          0.7,
          `Closed-loop vouching among ${component.length} accounts with ${outsideSupport} vouch(es) from outside the loop.`,
          ringEvidence.slice(0, 12),
        ),
      );
    }
  }

  // 5) Bursts of independent, evidence-backed denouncements on the same account.
  const denouncesBySubject = new Map();
  for (const record of snapshot.activeRecords) {
    if (record.type !== 'denounce') continue;
    if ((record.evidence ?? []).length === 0) continue;
    if (nowTime - toTime(record.createdAt) > opts.denounceWindowDays * DAY) continue;
    if (!denouncesBySubject.has(record.subjectContributorId)) {
      denouncesBySubject.set(record.subjectContributorId, []);
    }
    denouncesBySubject.get(record.subjectContributorId).push(record);
  }
  for (const [subjectId, records] of denouncesBySubject) {
    const issuerIds = records.map((record) => record.issuerProjectId);
    const sources = independenceGroups(issuerIds, projects);
    const distinctSources = new Set(
      issuerIds.map((id) => sources.get(id) ?? id),
    );
    if (
      records.length >= opts.denounceMinRecords &&
      distinctSources.size >= opts.denounceMinSources
    ) {
      addSignal(
        subjectId,
        signal(
          'denouncement_burst',
          0.8,
          `${records.length} evidence-backed denouncements from ${distinctSources.size} independent sources within ${opts.denounceWindowDays} days.`,
          records.slice(0, 10).map((record) => ({
            kind: 'record',
            id: record.id,
            projectId: record.issuerProjectId,
          })),
        ),
      );
    }
  }

  // 6) High submission volume with a very low merge rate.
  for (const contributorId of contributorIds) {
    const prs = prsByContributor.get(contributorId);
    if (prs.length < opts.volumeMinPrs) continue;
    const merged = prs.filter((pr) => pr.outcome === 'merged').length;
    const mergeRate = merged / prs.length;
    if (mergeRate >= opts.lowMergeRate) continue;
    addSignal(
      contributorId,
      signal(
        'high_volume_low_merge',
        0.65,
        `${prs.length} submissions with a merge rate of ${Math.round(mergeRate * 100)}% (threshold below ${Math.round(opts.lowMergeRate * 100)}%).`,
        prs.slice(0, 8).map(prRef),
      ),
    );
  }

  // Cluster accounts linked by shared similarity, synchronized new accounts, or a ring.
  const componentsByRoot = new Map();
  for (const node of allNodes) {
    const root = campaignUnion.find(node);
    if (!componentsByRoot.has(root)) componentsByRoot.set(root, []);
    componentsByRoot.get(root).push(node);
  }

  const campaigns = [];
  for (const memberList of [...componentsByRoot.values()].sort((a, b) =>
    a.sort()[0].localeCompare(b.sort()[0]),
  )) {
    if (memberList.length < 2) continue;
    const members = [...memberList].sort();
    const allSignals = [];
    for (const member of members) {
      const memberSignals = [...(signalsByContributor.get(member)?.values() ?? [])];
      allSignals.push(...memberSignals);
    }
    const distinctTypes = [
      ...new Set(allSignals.map((item) => item.type)),
    ].sort((a, b) => SIGNAL_ORDER.indexOf(a) - SIGNAL_ORDER.indexOf(b));
    if (distinctTypes.length < 2) continue;

    const memberPrs = members.flatMap((member) =>
      (prsByContributor.get(member) ?? []).map((pr) => ({
        ...pr,
        contributorId: member,
        time: toTime(pr.createdAt),
      })),
    );
    memberPrs.sort((a, b) => a.time - b.time);
    const affectedProjectIds = [
      ...new Set(memberPrs.map((pr) => pr.projectId)),
    ].sort();

    const signalEvidence = allSignals.flatMap((item) => item.evidence ?? []);
    const evidence = uniqueRefs(signalEvidence).slice(0, 200);
    const confidenceLabel =
      distinctTypes.length >= 4 && members.length >= 8
        ? 'high'
        : distinctTypes.length >= 3
          ? 'medium'
          : 'low';

    const windowStart = memberPrs.length > 0 ? memberPrs[0].createdAt : now.toISOString();
    const windowEnd =
      memberPrs.length > 0 ? memberPrs[memberPrs.length - 1].createdAt : now.toISOString();

    campaigns.push({
      id: `campaign_${String(campaigns.length + 1).padStart(2, '0')}`,
      memberContributorIds: members,
      affectedProjectIds,
      signalsFired: distinctTypes.map((type) => {
        const matching = allSignals.filter((item) => item.type === type);
        const description =
          matching.length > 1
            ? `${matching[0].description} (${matching.length} members showed this signal.)`
            : matching[0].description;
        return {
          type,
          weight: matching[0].weight,
          description,
          memberCount: matching.length,
          evidence: uniqueRefs(matching.flatMap((item) => item.evidence)).slice(0, 24),
        };
      }),
      window: { start: windowStart, end: windowEnd },
      evidence,
      confidence: {
        label: confidenceLabel,
        reasons: [
          `${distinctTypes.length} independent signal types`,
          `${members.length} members across ${affectedProjectIds.length} projects`,
          `Activity window: ${windowStart} to ${windowEnd}`,
        ],
      },
      provenance: {
        detector: 'behavioral-signals-v1',
        method:
          'Threshold rules over simulated PR metadata and signed records. No text-origin or AI-authorship classifier is used.',
        generatedAt: now.toISOString(),
        inputs: {
          projects: projects.size,
          contributors: contributors.size,
          pullRequests: pullRequests.length,
          activeRecords: snapshot.activeRecords.length,
        },
        thresholds: { ...opts },
        evidence: {
          total: evidence.length,
          byKind: evidenceBreakdown(evidence),
        },
        signalTypes: {
          count: distinctTypes.length,
          types: distinctTypes,
        },
        membersWithSignals: members.filter(
          (member) => (signalsByContributor.get(member)?.size ?? 0) > 0,
        ).length,
      },
      timeline: memberPrs.slice(0, 400).map((pr) => ({
        prId: pr.id,
        contributorId: pr.contributorId,
        projectId: pr.projectId,
        createdAt: pr.createdAt,
        outcome: pr.outcome,
      })),
    });
  }

  for (const campaign of campaigns) {
    for (const member of campaign.memberContributorIds) {
      const map = signalsByContributor.get(member);
      if (!map) continue;
      for (const [type, value] of map) {
        map.set(type, { ...value, campaignId: campaign.id });
      }
    }
  }

  const signalsObject = {};
  for (const [contributorId, map] of signalsByContributor) {
    signalsObject[contributorId] = [...map.values()].sort(
      (a, b) => SIGNAL_ORDER.indexOf(a.type) - SIGNAL_ORDER.indexOf(b.type),
    );
  }

  return {
    campaigns,
    signalsByContributor: signalsObject,
    config: opts,
  };
}
