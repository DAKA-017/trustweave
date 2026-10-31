import { config } from '../config/index.js';
import { buildSimulation, refreshSimulation } from './simulator.js';
import { computeMetricsForState, computeMetricsAcrossSeeds } from './metrics.js';
import { badRequest, notFound } from '../utils/errors.js';
import { evaluateContributor } from './trust-engine.js';

export class SimulationHost {
  constructor({
    seed = config.simSeed,
    size = config.defaultProjectCount,
    campaignSize = config.defaultCampaignSize,
  } = {}) {
    this.defaults = { seed, size, campaignSize };
    this.state = null;
    this.metricsCache = null;
    this.multiMetricsCache = null;
  }

  ensureState() {
    if (!this.state) this.runSimulation(this.defaults);
    return this.state;
  }

  runSimulation({ seed, size, campaignSize } = {}) {
    const current = this.state;
    const params = {
      seed: seed ?? current?.seed ?? this.defaults.seed,
      size: size ?? current?.size ?? this.defaults.size,
      campaignSize: campaignSize ?? current?.campaignSize ?? this.defaults.campaignSize,
    };
    this.state = buildSimulation(params);
    this.defaults = { ...params };
    this.metricsCache = null;
    this.multiMetricsCache = null;
    return this.state;
  }

  getAssessment(projectId, contributorId) {
    const state = this.ensureState();
    const project = state.projects.get(projectId);
    if (!project) throw notFound(`Project ${projectId} was not found in this simulation`);
    const contributor = state.contributors.get(contributorId);
    if (!contributor) throw notFound(`Contributor ${contributorId} was not found in this simulation`);
    const assessment = evaluateContributor({
      evaluatingProject: project,
      contributorId,
      projects: state.projects,
      contributors: state.contributors,
      snapshot: state.snapshot,
      campaignData: state.campaignData,
      pullRequests: state.pullRequests,
      now: new Date(state.simulatedAt),
      trustCache: state.trustCache,
      clusterCache: state.clusterCache,
    });
    return { project, contributor, assessment, state };
  }

  appendRecord(input) {
    const state = this.ensureState();
    const project = state.projects.get(input.issuerProjectId);
    if (!project) throw notFound(`Project ${input.issuerProjectId} was not found in this simulation`);
    const contributor = state.contributors.get(input.subjectContributorId);
    if (!contributor) {
      throw notFound(`Contributor ${input.subjectContributorId} was not found in this simulation`);
    }

    if (input.type === 'revoke') {
      const target = state.records
        .getLog(project.id)
        .map((entry) => entry.record)
        .find((record) => record.id === input.subjectRecordId);
      if (!target) {
        throw badRequest(`Record ${input.subjectRecordId} was not found in ${project.id}'s log`);
      }
      if (target.subjectContributorId !== input.subjectContributorId) {
        throw badRequest('subjectContributorId does not match the record being revoked');
      }
    }

    const createdAt = input.createdAt ?? state.simulatedAt;
    if (input.expiresAt && new Date(input.expiresAt) <= new Date(createdAt)) {
      throw badRequest('expiresAt must be after createdAt');
    }

    const entry = state.records.append(
      project.id,
      {
        type: input.type,
        issuerProjectId: project.id,
        subjectContributorId: input.subjectContributorId,
        subjectRecordId: input.subjectRecordId,
        reasonCode: input.reasonCode,
        evidence: input.evidence ?? [],
        createdAt,
        expiresAt: input.expiresAt,
      },
      { now: new Date(state.simulatedAt) },
    );

    refreshSimulation(state);
    this.metricsCache = null;
    this.multiMetricsCache = null;

    const verifiedEntry = state.snapshot
      .verificationFor(project.id)
      ?.entries.find((item) => item.record.id === entry.record.id);

    return {
      entry,
      verification: verifiedEntry?.verification ?? null,
      state,
    };
  }

  getMetrics() {
    if (!this.metricsCache) {
      this.metricsCache = computeMetricsForState(this.ensureState());
    }
    return this.metricsCache;
  }

  getMultiMetrics() {
    const state = this.ensureState();
    if (!this.multiMetricsCache) {
      this.multiMetricsCache = computeMetricsAcrossSeeds({
        seeds: config.multiSeedList,
        size: state.size,
        campaignSize: state.campaignSize,
      });
    }
    return this.multiMetricsCache;
  }
}

export const simulationHost = new SimulationHost();
