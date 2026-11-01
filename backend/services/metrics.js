import { buildSimulation } from './simulator.js';
import { evaluateContributor } from './trust-engine.js';

const round = (value) => Math.round(value * 1000) / 1000;

function assess(state, contributorId, projectId, now) {
  return evaluateContributor({
    evaluatingProject: state.projects.get(projectId),
    contributorId,
    projects: state.projects,
    contributors: state.contributors,
    snapshot: state.snapshot,
    campaignData: state.campaignData,
    pullRequests: state.pullRequests,
    now,
    trustCache: state.trustCache,
    clusterCache: state.clusterCache,
  });
}

function safeRatio(numerator, denominator, fallback = 1) {
  return denominator === 0 ? fallback : numerator / denominator;
}

function campaignMetrics(state) {
  const truth = new Set(state.groundTruth.campaignMembers);
  const sleepers = new Set(state.groundTruth.sleeperCampaignMembers ?? []);
  const predicted = new Set(
    state.campaignData.campaigns.flatMap((campaign) => campaign.memberContributorIds),
  );
  const matched = [...predicted].filter((id) => truth.has(id) || sleepers.has(id));
  const falsePositives = [...predicted].filter(
    (id) => !truth.has(id) && !sleepers.has(id),
  );
  const missed = [...truth].filter((id) => !predicted.has(id));
  const truthMembers = truth.size + sleepers.size;
  return {
    precision: round(safeRatio(matched.length, predicted.size)),
    recall: round(safeRatio(matched.length, truthMembers)),
    observableRecall: round(safeRatio(matched.length, truth.size)),
    predictedCampaigns: state.campaignData.campaigns.length,
    predictedMembers: predicted.size,
    truthMembers,
    observableTruthMembers: truth.size,
    sleeperMembers: sleepers.size,
    matchedMembers: matched.length,
    unobservedSleepers: [...sleepers].filter((id) => !predicted.has(id)),
    falsePositives,
    missed,
    signalTypes: [
      ...new Set(
        state.campaignData.campaigns.flatMap((campaign) =>
          campaign.signalsFired.map((signal) => signal.type),
        ),
      ),
    ],
  };
}

function newcomerMetrics(state, now) {
  const projectIds = [...state.projects.keys()];
  const details = [];
  let flaggedCount = 0;
  for (const contributorId of state.groundTruth.legitNewcomers) {
    const flaggedBy = [];
    for (const projectId of projectIds) {
      const assessment = assess(state, contributorId, projectId, now);
      if (assessment.outcome === 'flagged') {
        flaggedBy.push(projectId);
        break;
      }
    }
    if (flaggedBy.length > 0) flaggedCount += 1;
    details.push({ contributorId, flagged: flaggedBy.length > 0, flaggedBy });
  }
  return {
    rate: round(safeRatio(flaggedCount, details.length)),
    flagged: flaggedCount,
    total: details.length,
    projectsEvaluated: projectIds.length,
    details,
  };
}

function explanationMetrics(state, now) {
  const activeContributors = [...new Set(state.pullRequests.map((pr) => pr.contributorId))];
  const samples = new Map();
  for (const contributorId of activeContributors) {
    samples.set(contributorId, assess(state, contributorId, 'p10', now));
  }
  samples.set(
    state.groundTruth.disputedId,
    assess(state, state.groundTruth.disputedId, 'p06', now),
  );

  let nonNeutral = 0;
  let complete = 0;
  const failures = [];
  for (const [contributorId, assessment] of samples) {
    if (assessment.outcome === 'normal_review') continue;
    nonNeutral += 1;
    const explained = assessment.reasons.some(
      (reason) => reason.weight > 0 && (reason.references ?? []).length > 0,
    );
    if (explained) complete += 1;
    else failures.push({ contributorId, outcome: assessment.outcome });
  }
  return {
    rate: round(safeRatio(complete, nonNeutral)),
    checked: samples.size,
    nonNeutral,
    complete,
    failures,
  };
}

function hardCaseMetrics(state, now) {
  const p10 = (contributorId) => assess(state, contributorId, 'p10', now);
  const results = [];
  const predictedCampaignMembers = new Set(
    state.campaignData.campaigns.flatMap((campaign) => campaign.memberContributorIds),
  );

  const goodNewcomer = p10(state.groundTruth.goodNewcomerId);
  results.push({
    id: 'honest-multi-project-newcomer',
    label: 'Honest newcomer with distinct work across projects',
    expected: 'normal_review and not grouped into a campaign',
    actual: `${goodNewcomer.outcome}, grouped=${predictedCampaignMembers.has(state.groundTruth.goodNewcomerId)}`,
    passed:
      goodNewcomer.outcome === 'normal_review' &&
      !predictedCampaignMembers.has(state.groundTruth.goodNewcomerId),
  });

  const aiAssisted = p10(state.groundTruth.aiAssistedId);
  results.push({
    id: 'ai-assisted-legitimate',
    label: 'Legitimate contributor using AI assistance',
    expected: 'normal_review (AI text is not a signal)',
    actual: aiAssisted.outcome,
    passed: aiAssisted.outcome === 'normal_review',
    details: 'Behavioral signals only; no AI-text detection exists in the engine.',
  });

  const humanSpam = p10(state.groundTruth.humanSpamId);
  results.push({
    id: 'human-written-spam',
    label: 'Human-written spam contribution',
    expected: 'flagged by behavior',
    actual: humanSpam.outcome,
    passed: humanSpam.outcome === 'flagged',
    details: humanSpam.summary.signalTypes.join(', '),
  });

  const nonNative = p10(state.groundTruth.nonNativeId);
  results.push({
    id: 'non-native-english',
    label: 'Non-native English newcomer with unusual phrasing',
    expected: 'normal_review',
    actual: nonNative.outcome,
    passed: nonNative.outcome === 'normal_review',
  });

  const denounced = p10(state.groundTruth.denouncedId);
  const hasNoEvidenceReason = denounced.reasons.some(
    (reason) =>
      reason.type === 'ignored_record' &&
      reason.references.some((ref) => ref.projectId === state.groundTruth.maliciousProjectId),
  );
  results.push({
    id: 'malicious-no-evidence-denouncement',
    label: 'Malicious project denouncing an honest contributor without evidence',
    expected: 'normal_review, denouncement ignored',
    actual: `${denounced.outcome}, zero-weight reason=${hasNoEvidenceReason}`,
    passed: denounced.outcome === 'normal_review' && hasNoEvidenceReason,
  });

  const disputedAsTrusting = assess(state, state.groundTruth.disputedId, 'p06', now);
  const disputedAsDistrusting = assess(state, state.groundTruth.disputedId, 'p08', now);
  results.push({
    id: 'per-project-assessment',
    label: 'Same contributor assessed differently by two projects',
    expected: 'p06 caution, p08 normal_review',
    actual: `p06 ${disputedAsTrusting.outcome}, p08 ${disputedAsDistrusting.outcome}`,
    passed:
      disputedAsTrusting.outcome === 'caution' &&
      disputedAsDistrusting.outcome === 'normal_review',
  });

  const campaignMember = p10(state.groundTruth.campaignMembers[0]);
  results.push({
    id: 'campaign-member-flagged',
    label: 'Coordinated campaign member',
    expected: 'flagged with multiple signal types',
    actual: `${campaignMember.outcome}, signals=${campaignMember.summary.signalTypes.length}`,
    passed:
      campaignMember.outcome === 'flagged' &&
      campaignMember.summary.signalTypes.length >= 2,
  });

  const sybilIgnored = campaignMember.reasons.find(
    (reason) =>
      reason.type === 'ignored_record' &&
      reason.references.some((ref) => ref.projectId === state.groundTruth.sybilProjectId) &&
      /zero effective trust/i.test(reason.message),
  );
  results.push({
    id: 'sybil-project-zero-weight',
    label: 'Fresh sybil project vouching for campaign accounts',
    expected: 'vouch weight is zero',
    actual: sybilIgnored ? 'zero-effective-trust reason present' : 'not observed',
    passed: Boolean(sybilIgnored),
  });

  let massDenounceReason = null;
  for (const record of state.snapshot.activeRecords) {
    if (record.issuerProjectId !== state.groundTruth.lowCredibilityProjectId) continue;
    if (record.type !== 'denounce') continue;
    const candidate = p10(record.subjectContributorId);
    const reason = candidate.reasons.find(
      (item) =>
        item.type === 'evidence_backed_denouncement' &&
        /down-weighted/i.test(item.message),
    );
    if (reason) {
      massDenounceReason = { subject: record.subjectContributorId, reason };
      break;
    }
  }
  results.push({
    id: 'low-credibility-downweighted',
    label: 'Low-credibility project issuing mass denouncements',
    expected: 'denouncement weight reduced',
    actual: massDenounceReason
      ? `down-weighted for ${massDenounceReason.subject}`
      : 'not observed',
    passed: Boolean(massDenounceReason),
  });

  return results;
}

export function computeMetricsForState(state) {
  const now = new Date(state.simulatedAt);
  const campaign = campaignMetrics(state);
  const newcomerFalseFlag = newcomerMetrics(state, now);
  const explanationCompleteness = explanationMetrics(state, now);
  const hardCases = hardCaseMetrics(state, now);

  return {
    seed: state.seed,
    size: state.size,
    campaignSize: state.campaignSize,
    simulatedAt: state.simulatedAt,
    generatedAt: new Date().toISOString(),
    campaign,
    newcomerFalseFlag,
    explanationCompleteness,
    hardCases,
    hardCasesPassed: hardCases.filter((item) => item.passed).length,
    hardCasesTotal: hardCases.length,
    counts: state.counts,
  };
}

function stats(values) {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, range: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    min: round(min),
    max: round(max),
    mean: round(mean),
    range: round(max - min),
  };
}

export function computeMetricsAcrossSeeds({ seeds, size, campaignSize }) {
  const results = seeds.map((seed) => {
    const state = buildSimulation({ seed, size, campaignSize });
    return computeMetricsForState(state);
  });

  const campaignPrecision = results.map((result) => result.campaign.precision);
  const campaignRecall = results.map((result) => result.campaign.recall);
  const falseFlagRates = results.map((result) => result.newcomerFalseFlag.rate);
  const explanationRates = results.map((result) => result.explanationCompleteness.rate);

  return {
    generatedAt: new Date().toISOString(),
    size,
    campaignSize,
    seeds: results.map((result) => ({
      seed: result.seed,
      campaignPrecision: result.campaign.precision,
      campaignRecall: result.campaign.recall,
      observableRecall: result.campaign.observableRecall,
      predictedCampaigns: result.campaign.predictedCampaigns,
      predictedMembers: result.campaign.predictedMembers,
      sleeperMembers: result.campaign.sleeperMembers,
      newcomerFalseFlagRate: result.newcomerFalseFlag.rate,
      flaggedNewcomers: result.newcomerFalseFlag.flagged,
      newcomersEvaluated: result.newcomerFalseFlag.total,
      explanationCompleteness: result.explanationCompleteness.rate,
      hardCasesPassed: result.hardCasesPassed,
      hardCasesTotal: result.hardCasesTotal,
    })),
    variance: {
      campaignPrecision: stats(campaignPrecision),
      campaignRecall: stats(campaignRecall),
      newcomerFalseFlagRate: stats(falseFlagRates),
      explanationCompleteness: stats(explanationRates),
    },
    aggregate: {
      seedsRun: results.length,
      campaignPrecisionMean: round(
        campaignPrecision.reduce((sum, value) => sum + value, 0) / campaignPrecision.length,
      ),
      campaignRecallMean: round(
        campaignRecall.reduce((sum, value) => sum + value, 0) / campaignRecall.length,
      ),
      observableRecallMean: round(
        results.reduce((sum, result) => sum + result.campaign.observableRecall, 0) /
          results.length,
      ),
      newcomerFalseFlagRateMax: round(Math.max(...falseFlagRates)),
      explanationCompletenessMin: round(Math.min(...explanationRates)),
      hardCasesPassedTotal: results.reduce((sum, result) => sum + result.hardCasesPassed, 0),
      hardCasesTotal: results.reduce((sum, result) => sum + result.hardCasesTotal, 0),
    },
    note: 'Each seed rebuilds the whole simulation independently. Metrics are measured against simulator ground truth, which real deployments would not have. Recall includes campaign sleeper accounts that never posted or signed; observable recall covers the members who left a trace.',
  };
}
