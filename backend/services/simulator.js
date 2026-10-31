import { deterministicKeyPair, sha256 } from '../utils/crypto.js';
import {
  intBetween,
  mulberry32,
  pick,
  pickMany,
  shuffle,
} from '../utils/prng.js';
import { RecordsService } from './records.js';
import { detectCampaigns } from './campaign-detector.js';

export const SIM_NOW = '2026-11-01T12:00:00.000Z';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const PROJECT_NAMES = [
  'Aurora UI', 'Basalt DB', 'Cobalt CLI', 'Drift Cache', 'Ember Auth',
  'Fathom API', 'Garnet Graph', 'Harbor Queue', 'Ionic Parser', 'Juno Build',
  'Kestrel Net', 'Lumen Docs', 'Mosaic Router', 'Nimbus Logging', 'Orbit Render',
  'Pylon Proxy', 'Quartz Store', 'Ridge Sync', 'Sable Crypto', 'Tessera Types',
  'Umbra Config', 'Vela Events', 'Willow Metrics', 'Xenon Deploy', 'Yarrow Bindings',
  'Zephyr Plugins', 'Alder Index', 'Birch Sandbox', 'Cedar Search', 'Dune Compiler',
  'Elm Runtime', 'Fern Streams', 'Grove Forms', 'Hazel Mobile', 'Ivy Virtual',
  'Jade Workers', 'Kelp Analytics', 'Larch Routing', 'Maple Testing', 'Nettle Linting',
  'Oak Storage', 'Pine Scheduler', 'Quill Utils', 'Reed Networking', 'Spruce Validation',
  'Teak Serialization', 'Ulex Telemetry', 'Vine Migrations', 'Wren Feature Flags',
  'Yew Benchmarks',
];

const HANDLES = [
  'lena-dev', 'samir-ops', 'jules-code', 'mina-ui', 'theo-db', 'nora-api',
  'ravi-build', 'ines-auth', 'omar-cli', 'tara-web', 'vince-core', 'zoe-docs',
  'abel-runtime', 'bella-cache', 'chen-net', 'dina-parser', 'eli-graph',
  'faye-queue', 'gus-lint', 'hana-test', 'ivan-mesh', 'jana-utils', 'kofi-types',
  'lina-sync', 'milo-proxy', 'nia-storage', 'orin-cli', 'pia-config',
  'quin-security', 'ravi-render', 'sara-crypto', 'tomas-sched', 'uma-logging',
  'vio-events', 'wes-metrics', 'xena-deploy', 'yuri-bindings', 'zara-plugins',
  'amir-index', 'bo-sandbox', 'cleo-search', 'drew-compiler', 'esme-wasm',
  'finn-streams', 'gita-forms', 'hugo-mobile', 'iris-virtual', 'jai-workers',
  'kira-analytics', 'lev-routing',
];

const TOPICS = [
  'retry handling', 'cache invalidation', 'config validation', 'batch scheduling',
  'stream backpressure', 'error reporting', 'path normalization', 'index rebuilds',
  'queue draining', 'token refresh', 'schema migration', 'worker shutdown',
  'timeouts', 'pagination', 'logging fields', 'serialization',
];

const DETAILS = [
  'replacing the duplicated parser with a shared helper',
  'splitting the large module into two focused units',
  'adding a table-driven test for edge cases',
  'removing an unnecessary second pass over the data',
  'introducing a typed boundary between two layers',
  'documenting the failure modes with examples',
  'guarding the empty-input path explicitly',
  'reusing the existing buffer instead of allocating',
  'making the ordering deterministic in tests',
  'extracting constants from inline literals',
  'narrowing the public surface of the module',
  'adding a regression test for the reported bug',
];

const pad = (value) => String(value).padStart(2, '0');
const projectIdFor = (index) => `p${pad(index)}`;
const daysAgoIso = (nowMs, days, extraMs = 0) =>
  new Date(nowMs - days * DAY + extraMs).toISOString();

function baseContent(handle, projectName, seedIndex) {
  const topic = TOPICS[seedIndex % TOPICS.length];
  const detail = DETAILS[(seedIndex * 5 + handle.length) % DETAILS.length];
  return `${handle} refactors ${topic} in ${projectName} by ${detail}. The change adds focused regression tests and documents the behavior so future maintainers can reason about it.`;
}

function humanSpamContent(index) {
  return `This pull request improves documentation clarity and code style across the project. It fixes typo issues, updates comments, and refactors naming for consistency. The change is small, safe, and ready to merge. Variant ${index}.`;
}

function campaignContent() {
  return `This pull request improves performance, fixes critical bugs, updates documentation, adds missing tests, and refactors utility functions for clarity and maintainability. It also removes duplicate code paths and makes the build faster. No behavior changes are intended.`;
}

function aiAssistedContent(projectName, index) {
  return `I used an AI coding assistant to draft an accessibility audit for ${projectName}; I then reviewed every change, ran the test suite, and fixed the contrast issue it found. Details are in the changelog entry ${index}. This note describes how the patch was prepared, not how it should be judged.`;
}

function nonNativeContent(projectName, index) {
  return `When the worker restart happen, sometimes the lock not released and next job wait forever. This patch make release happen in a finally block for ${projectName}, and add test for restart path. I verify with two local runs and the logs now clear. Note ${index}.`;
}

export function buildSimulation({
  seed = 42,
  size = 30,
  campaignSize = 12,
  now = SIM_NOW,
} = {}) {
  if (!Number.isInteger(seed) || seed < 1) throw new Error('seed must be a positive integer');
  if (!Number.isInteger(size) || size < 20 || size > 50) throw new Error('size must be between 20 and 50');
  if (!Number.isInteger(campaignSize) || campaignSize < 10 || campaignSize > 15) {
    throw new Error('campaignSize must be between 10 and 15');
  }

  const rng = mulberry32(seed);
  const nowDate = new Date(now);
  const nowMs = nowDate.getTime();
  const records = new RecordsService({ clock: () => nowDate });
  const contributors = new Map();

  const addContributor = (id, handle, accountCreatedAt) => {
    const contributor = { id, handle, accountCreatedAt };
    contributors.set(id, contributor);
    return contributor;
  };

  // Campaign accounts: new, synchronized, and the only ground-truth campaign.
  const campaignMembers = Array.from(
    { length: campaignSize },
    (_, index) => `c_campaign_${pad(index + 1)}`,
  );
  campaignMembers.forEach((id, index) => {
    addContributor(
      id,
      `nova-build-${pad(index + 1)}`,
      daysAgoIso(nowMs, 2 + (index % 8), index * 37 * MINUTE),
    );
  });

  const hardCases = {
    goodNewcomer: 'c_new_good',
    aiAssisted: 'c_ai_assisted',
    humanSpam: 'c_human_spam',
    nonNative: 'c_non_native',
    denounced: 'c_denounced',
    disputed: 'c_disputed',
  };

  addContributor(hardCases.goodNewcomer, 'ana-newcomer', daysAgoIso(nowMs, 35));
  addContributor(hardCases.aiAssisted, 'kai-ai-assisted', daysAgoIso(nowMs, 300));
  addContributor(hardCases.humanSpam, 'sam-human-spam', daysAgoIso(nowMs, 25));
  addContributor(hardCases.nonNative, 'priya-non-native', daysAgoIso(nowMs, 45));
  addContributor(hardCases.denounced, 'elena-honest', daysAgoIso(nowMs, 200));
  addContributor(hardCases.disputed, 'marco-disputed', daysAgoIso(nowMs, 150));

  const legitNewcomerIds = Array.from({ length: 10 }, (_, index) => `c_new_${pad(index + 1)}`);
  legitNewcomerIds.forEach((id, index) => {
    addContributor(id, `newbie-${pad(index + 1)}`, daysAgoIso(nowMs, 5 + index * 3));
  });

  addContributor('c_base_bad', 'quinn-spam-bot', daysAgoIso(nowMs, 70));

  const baseCount = Math.max(12, Math.ceil(size / 2));
  const baseIds = Array.from({ length: baseCount }, (_, index) => `c_base_${pad(index + 1)}`);
  baseIds.forEach((id, index) => {
    addContributor(
      id,
      HANDLES[index % HANDLES.length],
      daysAgoIso(nowMs, intBetween(rng, 300, 1400)),
    );
  });

  const reviewerIds = Array.from({ length: 5 }, (_, index) => `c_reviewer_${pad(index + 1)}`);
  reviewerIds.forEach((id, index) => {
    addContributor(id, `reviewer-${pad(index + 1)}`, daysAgoIso(nowMs, 400 + index * 80));
  });

  const allProjectIds = Array.from({ length: size }, (_, index) => projectIdFor(index + 1));
  const names = shuffle(rng, PROJECT_NAMES).slice(0, size);

  const campaignGroups = [[], [], []];
  campaignMembers.forEach((member, index) => {
    campaignGroups[index % 3].push(member);
  });

  const campaignProjects = ['p04', 'p05', 'p09'];
  const specialNoVouch = new Set(['p01', 'p02', 'p03', 'p04', 'p05', 'p09']);

  const maintainers = new Map();
  maintainers.set('p01', ['c_base_01']);
  maintainers.set('p02', ['c_base_02']);
  maintainers.set('p03', [campaignMembers[0]]);
  maintainers.set('p04', campaignGroups[0]);
  maintainers.set('p05', campaignGroups[1]);
  maintainers.set('p06', ['c_base_03']);
  maintainers.set('p07', ['c_base_04']);
  maintainers.set('p08', ['c_base_05']);
  maintainers.set('p09', campaignGroups[2]);
  maintainers.set('p10', ['c_base_06']);
  maintainers.set('p11', ['c_base_06']);

  let maintainerCursor = 7;
  for (const projectId of allProjectIds) {
    if (maintainers.has(projectId)) continue;
    const baseId = baseIds[(maintainerCursor - 1) % baseIds.length];
    maintainers.set(projectId, [baseId]);
    maintainerCursor += 1;
  }

  const projects = new Map();
  allProjectIds.forEach((id, index) => {
    const keys = deterministicKeyPair(`${seed}:${id}`);
    const project = {
      id,
      name: names[index],
      publicKey: keys.publicKey,
      maintainerIds: maintainers.get(id),
      trustConfig: {},
      thresholds: {
        caution: 0.5,
        flagged: 1,
        maxDepth: 3,
        minIndependentSources: 2,
      },
    };
    projects.set(id, project);
    records.registerProject(project, keys.privateKey);
  });

  const setTrust = (from, to, weight) => {
    if (!projects.has(from) || !projects.has(to) || from === to) return;
    projects.get(from).trustConfig[to] = weight;
  };

  // Campaign fronts only trust each other and the fresh sybil project.
  for (const projectId of campaignProjects) {
    for (const other of campaignProjects) {
      if (other !== projectId) setTrust(projectId, other, 0.9);
    }
    setTrust(projectId, 'p03', 0.4);
  }

  // Dispute case: p06 trusts p07, p08 cannot reach p07.
  setTrust('p06', 'p07', 0.9);
  setTrust('p07', 'p06', 0.9);

  const group0 = ['p08', 'p10', 'p11', 'p12', 'p13'].filter((id) => projects.has(id));
  for (let i = 0; i < group0.length; i += 1) {
    for (let j = i + 1; j < group0.length; j += 1) {
      setTrust(group0[i], group0[j], 0.8);
      setTrust(group0[j], group0[i], 0.8);
    }
  }
  setTrust('p01', 'p11', 0.5);
  setTrust('p11', 'p01', 0.55);
  setTrust('p01', 'p12', 0.4);
  setTrust('p02', 'p10', 0.6);
  setTrust('p10', 'p02', 0.7);

  // Remaining projects form small mutual clusters with weak one-way bridges.
  const remaining = allProjectIds.filter((id) => Number(id.slice(1)) >= 14);
  for (let i = 0; i < remaining.length; i += 4) {
    const chunk = remaining.slice(i, i + 4);
    for (let a = 0; a < chunk.length; a += 1) {
      for (let b = a + 1; b < chunk.length; b += 1) {
        setTrust(chunk[a], chunk[b], 0.8);
        setTrust(chunk[b], chunk[a], 0.8);
      }
    }
  }
  const bridges = [...group0.slice(-1), ...remaining.filter((_, index) => index % 4 === 3)];
  for (let i = 0; i < bridges.length - 1; i += 1) {
    setTrust(bridges[i], bridges[i + 1], 0.3);
  }

  const pullRequests = [];
  let prCounter = 0;
  const addPr = ({
    projectId,
    contributorId,
    createdAt,
    contentSample,
    changedPathsSummary,
    prSize,
    outcome,
  }) => {
    prCounter += 1;
    const pr = {
      id: `pr_${String(prCounter).padStart(4, '0')}`,
      projectId,
      contributorId,
      createdAt,
      contentFingerprint: sha256(contentSample).slice(0, 32),
      contentSample,
      changedPathsSummary,
      size: prSize,
      outcome,
    };
    pullRequests.push(pr);
    return pr;
  };

  const contributionProjects = allProjectIds.filter(
    (id) => !['p03', 'p04', 'p05', 'p09'].includes(id),
  );
  const projectLabel = (id) => projects.get(id)?.name ?? id;
  const pathsFor = (projectId, tag) => {
    const slug = projectLabel(projectId).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `${slug}/src/${tag}.js, ${slug}/tests/${tag}.test.js`;
  };

  const baseOutcome = (rngValue) => {
    if (rngValue < 0.7) return 'merged';
    if (rngValue < 0.86) return 'open';
    return 'closed';
  };

  for (const contributorId of baseIds) {
    const handle = contributors.get(contributorId).handle;
    const count = intBetween(rng, 3, 8);
    const projectChoices = pickMany(rng, contributionProjects, Math.min(count, contributionProjects.length));
    projectChoices.forEach((projectId, index) => {
      addPr({
        projectId,
        contributorId,
        createdAt: daysAgoIso(nowMs, intBetween(rng, 5, 120), intBetween(rng, 0, 1439) * MINUTE),
        contentSample: baseContent(handle, projectLabel(projectId), prCounter + index + contributorId.length),
        changedPathsSummary: pathsFor(projectId, `module-${index + 1}`),
        prSize: intBetween(rng, 4, 180),
        outcome: baseOutcome(rng()),
      });
    });
  }

  for (let i = 0; i < 6; i += 1) {
    const projectId = contributionProjects[i % contributionProjects.length];
    addPr({
      projectId,
      contributorId: 'c_base_bad',
      createdAt: daysAgoIso(nowMs, 40 - i * 4),
      contentSample: `Update generated files and bump version in ${projectLabel(projectId)} without tests or context. Change ${i}.`,
      changedPathsSummary: pathsFor(projectId, 'generated'),
      prSize: intBetween(rng, 1, 6),
      outcome: 'closed',
    });
  }

  for (const index of [0, 1, 2, 3, 4]) {
    const projectId = 'p07';
    addPr({
      projectId,
      contributorId: hardCases.disputed,
      createdAt: daysAgoIso(nowMs, 40 - index * 7),
      contentSample: baseContent('marco-disputed', projectLabel(projectId), 90 + index),
      changedPathsSummary: pathsFor(projectId, `disputed-${index + 1}`),
      prSize: intBetween(rng, 10, 90),
      outcome: index % 3 === 1 ? 'closed' : 'merged',
    });
  }

  const denouncedPrs = [];
  [10, 12, 15, 18, 20].forEach((projectNumber, index) => {
    const projectId = allProjectIds[Math.min(projectNumber - 1, allProjectIds.length - 1)];
    denouncedPrs.push(
      addPr({
        projectId,
        contributorId: hardCases.denounced,
        createdAt: daysAgoIso(nowMs, 80 - index * 15),
        contentSample: baseContent('elena-honest', projectLabel(projectId), 30 + index),
        changedPathsSummary: pathsFor(projectId, `honest-${index + 1}`),
        prSize: intBetween(rng, 8, 70),
        outcome: 'merged',
      }),
    );
  });

  const goodProjects = ['p10', 'p12', 'p15', 'p18'].filter((id) => projects.has(id));
  goodProjects.forEach((projectId, index) => {
    addPr({
      projectId,
      contributorId: hardCases.goodNewcomer,
      createdAt: daysAgoIso(nowMs, 30 - index * 7),
      contentSample: baseContent('ana-newcomer', projectLabel(projectId), 50 + index),
      changedPathsSummary: pathsFor(projectId, `newcomer-${index + 1}`),
      prSize: intBetween(rng, 6, 45),
      outcome: index === 2 ? 'open' : 'merged',
    });
  });

  ['p10', 'p12', 'p16'].forEach((projectId, index) => {
    if (!projects.has(projectId)) return;
    addPr({
      projectId,
      contributorId: hardCases.aiAssisted,
      createdAt: daysAgoIso(nowMs, 70 - index * 25),
      contentSample: aiAssistedContent(projectLabel(projectId), index + 1),
      changedPathsSummary: pathsFor(projectId, `a11y-${index + 1}`),
      prSize: intBetween(rng, 12, 60),
      outcome: 'merged',
    });
  });

  ['p11', 'p14', 'p19'].forEach((projectId, index) => {
    if (!projects.has(projectId)) return;
    addPr({
      projectId,
      contributorId: hardCases.nonNative,
      createdAt: daysAgoIso(nowMs, 40 - index * 14),
      contentSample: nonNativeContent(projectLabel(projectId), index + 1),
      changedPathsSummary: pathsFor(projectId, `restart-${index + 1}`),
      prSize: intBetween(rng, 10, 55),
      outcome: index === 2 ? 'closed' : 'merged',
    });
  });

  const spamProjects = ['p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17'].filter((id) => projects.has(id));
  const spamStart = nowMs - 3 * DAY;
  for (let i = 0; i < 14; i += 1) {
    const projectId = spamProjects[i % spamProjects.length];
    addPr({
      projectId,
      contributorId: hardCases.humanSpam,
      createdAt: new Date(spamStart + i * 2 * HOUR).toISOString(),
      contentSample: humanSpamContent(i + 1),
      changedPathsSummary: `${projectId}/docs/README.md, ${projectId}/src/style-${i + 1}.js, ${projectId}/tests/docs.test.js`,
      prSize: intBetween(rng, 2, 14),
      outcome: i < 12 ? 'closed_as_spam' : 'closed',
    });
  }

  legitNewcomerIds.forEach((contributorId, index) => {
    const contributor = contributors.get(contributorId);
    const createdDaysAgo = Math.round((nowMs - new Date(contributor.accountCreatedAt).getTime()) / DAY);
    const count = index % 3;
    for (let i = 0; i < count; i += 1) {
      const projectId = contributionProjects[(index * 3 + i) % contributionProjects.length];
      const prDaysAgo = Math.max(1, createdDaysAgo - 1 - i * 3);
      addPr({
        projectId,
        contributorId,
        createdAt: daysAgoIso(nowMs, prDaysAgo, i * 97 * MINUTE),
        contentSample: baseContent(contributor.handle, projectLabel(projectId), 120 + index * 4 + i),
        changedPathsSummary: pathsFor(projectId, `starter-${index + 1}-${i + 1}`),
        prSize: intBetween(rng, 5, 40),
        outcome: i === 1 ? 'open' : 'merged',
      });
    }
  });

  const campaignTargetProjects = allProjectIds.slice(0, Math.min(size, 24));
  const campaignStart = nowMs - 16 * HOUR;
  campaignMembers.forEach((contributorId, memberIndex) => {
    campaignTargetProjects.forEach((projectId, projectIndex) => {
      addPr({
        projectId,
        contributorId,
        createdAt: new Date(
          campaignStart + memberIndex * 18 * MINUTE + projectIndex * 20 * 1000,
        ).toISOString(),
        contentSample: campaignContent(),
        changedPathsSummary: 'src/core/perf.js, docs/README.md, tests/perf.test.js',
        prSize: intBetween(rng, 20, 45),
        outcome: 'open',
      });
    });
  });

  const prsFor = (contributorId, projectId) =>
    pullRequests.filter(
      (pr) => pr.contributorId === contributorId && (!projectId || pr.projectId === projectId),
    );

  const addRecord = (projectId, subjectContributorId, type, reasonCode, options = {}) =>
    records.append(
      projectId,
      {
        type,
        issuerProjectId: projectId,
        subjectContributorId,
        reasonCode,
        evidence: options.evidence ?? [],
        createdAt: options.createdAt,
        expiresAt: options.expiresAt,
        subjectRecordId: options.subjectRecordId,
      },
      { now: nowDate },
    );

  const maintainerSet = new Set(
    [...maintainers.values()].flat(),
  );
  // Reviewers never maintain a project, so their vouches cannot form a loop.
  const vouchCandidates = reviewerIds.filter((id) => !maintainerSet.has(id));

  for (const project of projects.values()) {
    if (specialNoVouch.has(project.id)) continue;
    const targets = pickMany(rng, vouchCandidates, Math.min(2, vouchCandidates.length));
    for (const [index, subject] of targets.entries()) {
      const createdAt = daysAgoIso(nowMs, intBetween(rng, 20, 160));
      const entry = addRecord(project.id, subject, 'vouch', 'reviewed_contributions', {
        evidence: [
          {
            kind: 'link',
            ref: `example://review/${project.id}/${subject}/${index}`,
            note: 'Simulated review link, not a real repository.',
          },
        ],
        createdAt,
      });
      if (project.id === 'p13' && index === 0) {
        addRecord(project.id, subject, 'revoke', 'appeal_accepted', {
          evidence: [{ kind: 'record', ref: entry.record.id }],
          subjectRecordId: entry.record.id,
          createdAt: daysAgoIso(nowMs, 5),
        });
      }
      if (project.id === 'p12' && index === 1) {
        addRecord(project.id, subject, 'vouch', 'legacy_review', {
          evidence: [{ kind: 'link', ref: `example://legacy/${project.id}/${subject}` }],
          createdAt: daysAgoIso(nowMs, 90),
          expiresAt: daysAgoIso(nowMs, 10),
        });
      }
    }
  }

  // A malicious project denounces an honest contributor with no evidence.
  addRecord('p01', hardCases.denounced, 'denounce', 'suspected_spam', {
    evidence: [],
    createdAt: daysAgoIso(nowMs, 1),
  });

  // A legitimate project denounces a disputed contributor with real PR evidence.
  addRecord('p07', hardCases.disputed, 'denounce', 'repeated_low_quality_patch', {
    evidence: prsFor(hardCases.disputed, 'p07').slice(0, 2).map((pr) => ({
      kind: 'pull_request',
      ref: pr.id,
    })),
    createdAt: daysAgoIso(nowMs, 2),
  });

  // Two independent legitimate denouncements of a known bad account.
  for (const projectId of ['p14', 'p18']) {
    if (!projects.has(projectId)) continue;
    addRecord(projectId, 'c_base_bad', 'denounce', 'spam_submissions', {
      evidence: prsFor('c_base_bad').slice(0, 2).map((pr) => ({
        kind: 'pull_request',
        ref: pr.id,
        projectId: pr.projectId,
      })),
      createdAt: daysAgoIso(nowMs, projectId === 'p14' ? 15 : 10),
    });
  }

  // Low-credibility project issues mass denouncements; down-weighted by the engine.
  const protectedIds = new Set([
    ...legitNewcomerIds,
    hardCases.goodNewcomer,
    hardCases.aiAssisted,
    hardCases.nonNative,
    hardCases.denounced,
    hardCases.disputed,
  ]);
  const massTargets = [...contributors.keys()].filter((id) => {
    if (protectedIds.has(id)) return false;
    if ((maintainers.get('p02') ?? []).includes(id)) return false;
    return prsFor(id).length > 0;
  });
  for (const subject of massTargets) {
    addRecord('p02', subject, 'denounce', 'bulk_pattern_match', {
      evidence: [{ kind: 'note', ref: 'bulk-similarity-scan' }],
      createdAt: daysAgoIso(nowMs, 1),
    });
  }

  // Campaign accounts vouch for each other through projects they maintain,
  // plus a fresh sybil project. No normal project trusts any of these issuers.
  for (const projectId of ['p03', 'p04', 'p05', 'p09']) {
    for (const subject of campaignMembers) {
      addRecord(projectId, subject, 'vouch', 'campaign_trust', {
        evidence: [
          {
            kind: 'link',
            ref: `example://vouch/${projectId}/${subject}`,
            note: 'Simulated vouch; no real repository was contacted.',
          },
        ],
        createdAt: daysAgoIso(nowMs, 1),
      });
    }
  }

  const snapshot = records.createSnapshot({ now: nowDate });
  const campaignData = detectCampaigns({
    projects,
    contributors,
    pullRequests,
    snapshot,
    now: nowDate,
  });

  const legitNewcomers = [
    hardCases.goodNewcomer,
    hardCases.aiAssisted,
    hardCases.nonNative,
    hardCases.denounced,
    ...legitNewcomerIds,
  ];

  return {
    mode: 'simulation-host',
    authority: false,
    note: 'One process hosts many simulated projects. It is not a central authority: each project verifies peer logs and evaluates from its own trust configuration.',
    seed,
    size,
    campaignSize,
    simulatedAt: nowDate.toISOString(),
    projects,
    contributors,
    pullRequests,
    records,
    snapshot,
    campaignData,
    trustCache: new Map(),
    clusterCache: new Map(),
    groundTruth: {
      campaignMembers,
      legitNewcomers,
      humanSpamId: hardCases.humanSpam,
      aiAssistedId: hardCases.aiAssisted,
      nonNativeId: hardCases.nonNative,
      denouncedId: hardCases.denounced,
      disputedId: hardCases.disputed,
      goodNewcomerId: hardCases.goodNewcomer,
      maliciousProjectId: 'p01',
      sybilProjectId: 'p03',
      lowCredibilityProjectId: 'p02',
      campaignProjects,
      expected: {
        [hardCases.goodNewcomer]: 'normal_review',
        [hardCases.aiAssisted]: 'normal_review',
        [hardCases.nonNative]: 'normal_review',
        [hardCases.denounced]: 'normal_review',
        [hardCases.humanSpam]: 'flagged',
      },
    },
    counts: {
      projects: projects.size,
      contributors: contributors.size,
      pullRequests: pullRequests.length,
      records: snapshot.activeRecords.length,
    },
  };
}

/** Rebuild derived views after a new signed record is appended. */
export function refreshSimulation(state) {
  const nowDate = new Date(state.simulatedAt);
  state.snapshot = state.records.createSnapshot({ now: nowDate });
  state.campaignData = detectCampaigns({
    projects: state.projects,
    contributors: state.contributors,
    pullRequests: state.pullRequests,
    snapshot: state.snapshot,
    now: nowDate,
  });
  state.counts = {
    projects: state.projects.size,
    contributors: state.contributors.size,
    pullRequests: state.pullRequests.length,
    records: state.snapshot.activeRecords.length,
  };
  return state;
}
