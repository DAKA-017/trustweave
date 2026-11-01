import { simulationHost } from '../services/simulation-host.js';
import {
  contributorBehavior,
  contributorSummary,
  prSummary,
  simulationMeta,
} from './helpers.js';

export function getExplainer(req, res) {
  const { state, readOnly } = simulationHost.resolve(req);
  const aiId = state.groundTruth.aiAssistedId;
  const spamId = state.groundTruth.humanSpamId;

  const aiPr = state.pullRequests.find((pr) => pr.contributorId === aiId);
  const spamPr = state.pullRequests.find((pr) => pr.contributorId === spamId);
  if (!aiPr || !spamPr) {
    return res.status(503).json({
      error: {
        code: 'EXPLAINER_UNAVAILABLE',
        message: 'The explainer examples are missing from the current simulation',
      },
    });
  }

  const aiAssessment = simulationHost.getAssessment(state, 'p10', aiId).assessment;
  const spamAssessment = simulationHost.getAssessment(state, 'p10', spamId).assessment;

  return res.json({
    simulation: simulationMeta(state),
    readOnly,
    title: 'Why AI-text detection is not enough',
    note: 'Both examples are simulated and judged only by submission behavior. No AI-text detector is used anywhere in TrustWeave.',
    aiAssisted: {
      contributor: contributorSummary(state.contributors.get(aiId)),
      pullRequest: prSummary(aiPr),
      behavior: contributorBehavior(state, aiId),
      assessment: aiAssessment,
      label: 'Legitimate contribution prepared with AI assistance',
    },
    humanSpam: {
      contributor: contributorSummary(state.contributors.get(spamId)),
      pullRequest: prSummary(spamPr),
      behavior: contributorBehavior(state, spamId),
      assessment: spamAssessment,
      label: 'Human-written spam',
    },
    whyAiTextDetectionFails: [
      'Text-origin detectors produce false positives, including on non-native English writers with unusual phrasing.',
      'AI-assisted work can be correct and valuable; how a patch was drafted is not evidence about whether it is good.',
      'Spam is a behavior pattern: volume, timing, cross-project similarity, account age, network structure and maintainer outcomes.',
      'TrustWeave never inspects text origin. The same behavioral rules run on both examples, and the outcomes and reasons are shown side by side.',
    ],
    caveat:
      'The human-written label comes from simulator ground truth. The system itself only sees PR behavior, signed records and network signals.',
  });
}
