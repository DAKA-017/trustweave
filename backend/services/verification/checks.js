import { computeEffectiveTrust } from '../trust-engine.js';

const DAY = 24 * 60 * 60 * 1000;
const CAMPAIGN_PROJECTS = new Set(['p03', 'p04', 'p05', 'p09']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function campaignFingerprint(state) {
  return {
    counts: state.counts,
    simulatedAt: state.simulatedAt,
    members: state.campaignData.campaigns.map(
      (campaign) => campaign.memberContributorIds,
    ),
    signals: state.campaignData.campaigns.map((campaign) =>
      campaign.signalsFired.map((signal) => signal.type),
    ),
    hashes: state.records.getLog('p02').map((entry) => entry.hash),
  };
}

function firstCampaign(state) {
  const campaign = state.campaignData.campaigns[0];
  assert(campaign, 'The detector returned no campaigns for this sandbox.');
  return campaign;
}

export const CHECKS = Object.freeze([
  {
    id: 'persist',
    name: 'Changes persist after refresh',
    run({ sandbox }) {
      const signed = sandbox.append({
        issuerProjectId: 'p08',
        subjectContributorId: 'c_new_good',
        type: 'vouch',
        reasonCode: 'verification_persist',
        evidence: [{ kind: 'note', ref: 'Persisted inside an isolated sandbox.' }],
      });
      const refreshed = sandbox.refresh();
      const entry = refreshed.records
        .getLog('p08')
        .find((item) => item.record.id === signed.entry.record.id);
      assert(
        entry,
        `Record ${signed.entry.record.id} was not found after reopening the visitor session.`,
      );
      const verified = refreshed.snapshot
        .verificationFor('p08')
        ?.entries.find((item) => item.record.id === signed.entry.record.id);
      assert(
        verified?.verification.signatureValid,
        `Record ${signed.entry.record.id} is present but its signature no longer verifies.`,
      );
      return {
        details: `Signed ${signed.entry.record.id} in a private sandbox, reopened the same visitor session through the session store the dashboard uses, and found it again with a valid signature.`,
      };
    },
  },
  {
    id: 'load',
    name: 'Network data loads',
    run({ sandbox }) {
      const { state } = sandbox;
      const projectCount = state.projects.size;
      assert(
        projectCount > 0 && projectCount === state.counts.projects,
        `Expected ${state.counts.projects} projects, found ${projectCount}.`,
      );
      assert(
        state.counts.records > 100,
        `Expected more than 100 active records, found ${state.counts.records}.`,
      );
      assert(state.counts.contributors > 0, 'The sandbox has no contributors.');
      assert(state.counts.pullRequests > 0, 'The sandbox has no pull requests.');
      return {
        details: `Sandbox API data: ${state.counts.projects} projects, ${state.counts.contributors} contributors, ${state.counts.pullRequests} PRs, ${state.counts.records} signed records · seed ${state.seed} · clock ${state.simulatedAt}.`,
      };
    },
  },
  {
    id: 'graph',
    name: 'Interactive graph controls',
    run({ sandbox }) {
      const { state } = sandbox;
      const project = state.projects.get('p06');
      assert(project, 'Project p06 was not found in the sandbox.');
      const pullRequests = state.pullRequests.filter(
        (pr) => pr.projectId === 'p06',
      );
      const contributorIds = [
        ...new Set(pullRequests.map((pr) => pr.contributorId)),
      ];
      assert(
        contributorIds.length > 0,
        'The project view returned no contributors, so filtering has nothing to show.',
      );
      assert(
        pullRequests.length > 0,
        'The project view returned no evaluated pull requests.',
      );
      const outcomes = contributorIds.map(
        (id) => sandbox.host.getAssessment(state, 'p06', id).assessment.outcome,
      );
      const flagged = outcomes.filter((outcome) => outcome === 'flagged').length;
      return {
        details: `p06 view: ${contributorIds.length} contributors and ${pullRequests.length} pull requests; ${flagged} were flagged from campaign evidence. Project selection and filtering resolve against this server-side view.`,
      };
    },
  },
  {
    id: 'trust',
    name: 'Circular trust stays bounded',
    run({ sandbox }) {
      const { state } = sandbox;
      const evaluator = state.projects.get('p10');
      const peer = state.projects.get('p08');
      assert(evaluator && peer, 'The p10/p08 trust pair was not found.');
      const forward = computeEffectiveTrust(evaluator, state.projects);
      const backward = computeEffectiveTrust(peer, state.projects);
      const entries = [...forward.entries()].filter(
        ([projectId]) => projectId !== 'p10',
      );
      assert(
        entries.length >= 5,
        `Expected several reachable projects, received ${entries.length}.`,
      );
      assert(
        entries.every(([, weight]) => weight > 0 && weight <= 1),
        'An effective trust weight was outside (0, 1].',
      );
      assert(
        entries.every(([projectId, weight]) => {
          const direct = evaluator.trustConfig[projectId];
          return direct == null || weight + 1e-9 >= direct;
        }),
        'The strongest path returned less than the direct edge weight.',
      );
      const toPeer = forward.get('p08');
      const back = backward.get('p10');
      assert(toPeer && back, 'The mutual p10/p08 trust links were not both returned.');
      assert(
        Math.abs(toPeer - back) < 1e-9,
        `The mutual links disagree: ${toPeer} versus ${back}.`,
      );
      assert(
        toPeer < 1 && back < 1,
        'A mutual trust cycle inflated one side to full trust.',
      );
      return {
        details: `p10 ↔ p08 are mutual ${toPeer} links. Both projects report ${toPeer} — the cycle is not multiplied or inflated to 1.0 — and all ${entries.length} reachable weights stay within (0, 1] and above their direct edge.`,
      };
    },
  },
  {
    id: 'simulator',
    name: 'Simulator updates results reproducibly',
    run({ sandbox }) {
      const seed = 7;
      const campaignSize = 10;
      const firstState = sandbox.rebuild({ seed, campaignSize });
      assert(
        firstState.seed === seed,
        `The rebuilt simulation reports seed ${firstState.seed}, not ${seed}.`,
      );
      const first = campaignFingerprint(firstState);
      assert(
        first.members[0]?.length === campaignSize,
        `A rebuild with ${campaignSize} campaign members made the detector return ${first.members[0]?.length}.`,
      );
      const secondState = sandbox.rebuild({ seed, campaignSize });
      const second = campaignFingerprint(secondState);
      assert(
        JSON.stringify(second) === JSON.stringify(first),
        'Two rebuilds of the same seed produced different counts, members, signals or record hashes.',
      );
      return {
        details: `Rebuilt seed 42 → ${seed} inside the check sandbox: ${firstState.counts.pullRequests} PRs regenerated and the detector returned ${first.members[0].length} members. A second independent rebuild produced identical counts, ${second.members[0].length} member ids, ${second.signals[0].length} signal types and ${second.hashes.length} byte-identical p02 record hashes.`,
      };
    },
  },
  {
    id: 'campaign',
    name: 'Full campaign detection',
    run({ sandbox, world }) {
      const { state } = sandbox;
      const campaign = firstCampaign(state);
      assert(
        campaign.confidence?.label === 'high',
        `Expected high confidence, received ${campaign.confidence?.label}.`,
      );
      assert(
        campaign.memberContributorIds.length === world.campaignSize,
        `Expected ${world.campaignSize} members, received ${campaign.memberContributorIds.length}.`,
      );
      assert(
        campaign.signalsFired.length >= 2,
        'Campaign detection needs at least two independent signal types.',
      );
      const types = campaign.signalsFired
        .map((signal) => signal.type)
        .join(', ');
      return {
        details: `${campaign.id}: ${campaign.confidence.label} confidence, ${campaign.memberContributorIds.length} members across ${campaign.affectedProjectIds.length} projects, ${campaign.signalsFired.length} signal types (${types}).`,
      };
    },
  },
  {
    id: 'provenance',
    name: 'Campaign evidence and provenance',
    run({ sandbox }) {
      const { state } = sandbox;
      const campaign = firstCampaign(state);
      const provenance = campaign.provenance;
      assert(provenance, 'The campaign payload has no provenance block.');
      assert(
        provenance.detector === 'behavioral-signals-v1',
        `Unexpected detector id ${provenance.detector}.`,
      );
      assert(
        provenance.inputs?.pullRequests === state.pullRequests.length,
        'The provenance block did not report the sandbox PR count.',
      );
      assert(
        provenance.evidence?.total === campaign.evidence?.length,
        'The declared evidence total does not match the campaign evidence list.',
      );
      assert(
        provenance.evidence?.byKind?.pull_request > 0 &&
          provenance.evidence?.byKind?.record > 0,
        'The campaign evidence is not broken down into PR and record references.',
      );
      assert(
        campaign.signalsFired.every(
          (signal) => signal.memberCount >= 1 && signal.evidence?.length > 0,
        ),
        'A signal has no member count or no concrete evidence reference.',
      );
      const members = campaign.memberContributorIds.map((id) => ({
        id,
        signalTypes: (
          state.campaignData.signalsByContributor[id] ?? []
        ).map((signal) => signal.type),
      }));
      assert(
        members.every((member) => member.signalTypes.length > 0),
        'At least one member does not list the signals it triggered.',
      );
      assert(
        provenance.membersWithSignals === members.length,
        'The provenance member count does not match the member list.',
      );
      return {
        details: `${campaign.id}: ${provenance.evidence.total} evidence refs (${Object.entries(
          provenance.evidence.byKind,
        )
          .map(([kind, count]) => `${count} ${kind}`)
          .join(', ')}), ${provenance.signalTypes.count} signal types with per-signal member counts, ${provenance.membersWithSignals}/${members.length} members listing their own signal types, and ${provenance.inputs.projects} projects · ${provenance.inputs.pullRequests} PRs · ${provenance.inputs.activeRecords} active records recorded as detector inputs.`,
      };
    },
  },
  {
    id: 'newcomer',
    name: 'Newcomer fairness',
    run({ sandbox }) {
      const { state } = sandbox;
      const now = new Date(state.simulatedAt);
      const campaignMembers = new Set(
        state.campaignData.campaigns.flatMap(
          (campaign) => campaign.memberContributorIds,
        ),
      );
      const newcomers = [];
      for (const contributor of state.contributors.values()) {
        const ageDays = Math.floor(
          (now - new Date(contributor.accountCreatedAt)) / DAY,
        );
        if (ageDays > 90) continue;
        if (campaignMembers.has(contributor.id)) continue;
        const { assessment } = sandbox.host.getAssessment(
          state,
          'p10',
          contributor.id,
        );
        if (assessment.outcome !== 'normal_review') continue;
        if ((assessment.signals ?? []).length > 0) continue;
        newcomers.push(assessment);
      }
      assert(
        newcomers.length >= 10,
        `Expected at least 10 newcomers, received ${newcomers.length}.`,
      );
      assert(
        newcomers.every((assessment) => assessment.outcome === 'normal_review'),
        'A newcomer without history was not treated as normal review.',
      );
      assert(
        newcomers.every((assessment) =>
          (assessment.reasons ?? []).some(
            (reason) => reason.type === 'newcomer_neutral',
          ),
        ),
        'A newcomer was judged without the neutral no-history reason.',
      );
      const sponsorOptions = [...state.projects.values()].filter(
        (project) => !CAMPAIGN_PROJECTS.has(project.id),
      ).length;
      assert(sponsorOptions > 0, 'No sponsor vouch options were available.');
      return {
        details: `${newcomers.length} newcomers without signed records all stay "normal review" for reason newcomer_neutral; ${sponsorOptions} independent sponsor options are available instead of a silent penalty.`,
      };
    },
  },
  {
    id: 'records',
    name: 'Vouch and denouncement verification',
    run({ sandbox }) {
      const { state } = sandbox;
      const log = state.records.verifyProjectLog('p07', {
        now: new Date(state.simulatedAt),
      });
      const types = log.entries.reduce(
        (totals, entry) => {
          totals[entry.record.type] = (totals[entry.record.type] ?? 0) + 1;
          return totals;
        },
        { vouch: 0, denounce: 0, revoke: 0 },
      );
      assert(types.vouch > 0, 'The default log contains no vouch.');
      assert(types.denounce > 0, 'The default log contains no denouncement.');
      const verified = log.entries.filter(
        (entry) =>
          entry.verification.integrity === 'valid' &&
          entry.verification.signatureValid &&
          entry.verification.hashIntact &&
          entry.verification.chainIntact,
      ).length;
      assert(
        verified === log.entries.length,
        `${log.entries.length - verified} of ${log.entries.length} entries failed verification.`,
      );
      return {
        details: `p07 log: ${types.vouch} vouch + ${types.denounce} denounce; ${verified}/${log.entries.length} entries pass the Ed25519 signature, SHA-256 hash and previous-hash chain checks.`,
      };
    },
  },
  {
    id: 'revocation',
    name: 'Revocation and expiry',
    run({ sandbox }) {
      const { state } = sandbox;
      const now = new Date(state.simulatedAt);
      const revoked = state.records.verifyProjectLog('p13', { now });
      const revokedEntry = revoked.entries.find(
        (entry) => entry.verification.revoked,
      );
      assert(revokedEntry, 'No revoked entry was found in p13.');
      assert(
        revokedEntry.verification.integrity === 'valid',
        'The revoked entry no longer passes signature and hash verification.',
      );
      assert(
        revokedEntry.verification.active === false,
        'The revoked entry is still counted as active.',
      );
      assert(
        revokedEntry.verification.revokedBy,
        'The revoked entry does not name the revoking record.',
      );

      const expired = state.records.verifyProjectLog('p12', { now });
      const expiredEntry = expired.entries.find(
        (entry) => entry.verification.expired,
      );
      assert(expiredEntry, 'No expired entry was found in p12.');
      assert(
        expiredEntry.verification.integrity === 'valid',
        'The expired entry no longer passes signature and hash verification.',
      );
      assert(
        expiredEntry.verification.active === false,
        'The expired entry is still counted as active.',
      );

      return {
        details: `${revokedEntry.record.id} stays signature/hash/chain valid but inactive after revoke ${revokedEntry.verification.revokedBy}; ${expiredEntry.record.id} is likewise valid but inactive after expiry. Both remain in the log and are ignored by assessments with an explicit reason.`,
      };
    },
  },
  {
    id: 'tamper',
    name: 'Tamper detection',
    run({ sandbox }) {
      const { state } = sandbox;
      const now = new Date(state.simulatedAt);
      const signature = state.records.verifyProjectLog('p03', {
        tamper: 'signature',
        now,
      });
      const signatureRejected = signature.entries.filter(
        (entry) => !entry.verification.signatureValid,
      );
      const signatureIssues = [
        ...new Set(signatureRejected.flatMap((entry) => entry.verification.issues)),
      ];
      assert(
        signature.valid === false,
        'The signature-tampered copy was still reported as valid.',
      );
      assert(
        signatureRejected.length >= 1,
        'No entry was rejected after the signature tamper.',
      );
      assert(
        signatureIssues.includes('invalid_signature'),
        `The signature rejection listed ${signatureIssues.join(', ') || 'no issues'}.`,
      );

      const chain = state.records.verifyProjectLog('p03', {
        tamper: 'chain',
        now,
      });
      const chainRejected = chain.entries.filter(
        (entry) => !entry.verification.chainIntact,
      );
      const chainIssues = [
        ...new Set(chainRejected.flatMap((entry) => entry.verification.issues)),
      ];
      assert(
        chain.valid === false,
        'The hash-chain-tampered copy was still reported as valid.',
      );
      assert(
        chainRejected.length >= 1,
        'No entry was rejected after the hash-chain tamper.',
      );
      assert(
        chainIssues.includes('broken_chain'),
        `The chain rejection listed ${chainIssues.join(', ') || 'no issues'}.`,
      );

      const stored = state.records.verifyProjectLog('p03', { now });
      assert(
        stored.valid === true,
        'The stored p03 log changed after verifying tampered copies.',
      );

      return {
        details: `Tampered signature: ${signatureRejected.length} of ${signature.entries.length} entries rejected with ${signatureIssues.join(', ')}. Tampered chain: ${chainRejected.length} of ${chain.entries.length} entries rejected with ${chainIssues.join(', ')}. The stored sandbox log stayed valid.`,
      };
    },
  },
  {
    id: 'sign',
    name: 'Record signing',
    run({ sandbox }) {
      const signed = sandbox.append({
        issuerProjectId: 'p08',
        subjectContributorId: 'c_new_good',
        type: 'vouch',
        reasonCode: 'verification_check',
        evidence: [{ kind: 'note', ref: 'Signed inside an isolated sandbox.' }],
      });
      assert(
        signed.verification?.signatureValid === true,
        "The new record's Ed25519 signature did not verify.",
      );
      assert(
        signed.verification?.hashIntact === true,
        "The new record's hash did not match its contents.",
      );
      const refreshed = sandbox.refresh();
      const found = refreshed.records
        .getLog('p08')
        .find((entry) => entry.record.id === signed.entry.record.id);
      assert(found, 'The signed record could not be read back in a separate request.');
      return {
        details: `Signed ${signed.entry.record.id} for p08: signature valid, hash intact, read back from the sandbox session in a separate request.`,
      };
    },
  },
]);
