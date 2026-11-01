import { config } from '../config/index.js';
import { buildSimulation, refreshSimulation } from './simulator.js';
import { computeMetricsForState, computeMetricsAcrossSeeds } from './metrics.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { parseOrThrow } from '../utils/validate.js';
import { worldQuerySchema } from '../models/schemas.js';
import { evaluateContributor } from './trust-engine.js';

const SESSION_HEADER = 'x-trustweave-session';
const WORLD_HEADER = 'x-trustweave-world';
const SESSION_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_SESSIONS = 200;
const MAX_READ_ONLY_WORLDS = 16;

function defaultWorld() {
  return {
    seed: config.simSeed,
    size: config.defaultProjectCount,
    campaignSize: config.defaultCampaignSize,
    scenario: 'obvious',
  };
}

function normalizeWorld(input = {}, base = {}) {
  const fallback = { ...defaultWorld(), ...base };
  return {
    seed: input.seed ?? fallback.seed,
    size: input.size ?? fallback.size,
    campaignSize: input.campaignSize ?? fallback.campaignSize,
    scenario: input.scenario ?? fallback.scenario,
  };
}

function sameWorld(a, b) {
  return (
    a.seed === b.seed &&
    a.size === b.size &&
    a.campaignSize === b.campaignSize &&
    a.scenario === b.scenario
  );
}

function worldKey(world) {
  return `${world.seed}:${world.size}:${world.campaignSize}:${world.scenario}`;
}

/**
 * Deterministic worlds plus per-visitor sandboxes.
 *
 * A request without a session identifier is served from a read-only world that
 * is rebuilt from the seed settings in the URL/header. It is identical for
 * every visitor and cannot be rebuilt or signed into. A request with a session
 * identifier gets its own sandbox; rebuilds and appended records live only
 * there and are never visible to another session or to the default world.
 */
export class SimulationHost {
  constructor({ seed, size, campaignSize } = {}) {
    this.defaults = normalizeWorld({ seed, size, campaignSize });
    this.sessions = new Map();
    this.readOnlyWorlds = new Map();
    this.metricsCache = new WeakMap();
    this.multiMetricsCache = new WeakMap();
  }

  readSessionId(req) {
    const raw = req.get?.(SESSION_HEADER);
    if (raw == null || raw === '') return null;
    const sessionId = String(raw).trim();
    if (!SESSION_PATTERN.test(sessionId)) {
      throw badRequest(
        'X-TrustWeave-Session must be 6-64 characters using letters, digits, "_" or "-"',
      );
    }
    return sessionId;
  }

  readExplicitWorld(req) {
    const fromQuery = parseOrThrow(worldQuerySchema, req.query ?? {});
    let fromHeader = {};
    const rawHeader = req.get?.(WORLD_HEADER);
    if (rawHeader) {
      let parsed;
      try {
        parsed = JSON.parse(rawHeader);
      } catch {
        throw badRequest('X-TrustWeave-World must be a JSON object');
      }
      fromHeader = parseOrThrow(worldQuerySchema, parsed);
    }
    const provided = Object.keys(fromQuery).length > 0 || Object.keys(fromHeader).length > 0;
    if (!provided) return { provided: false, params: null };
    return {
      provided: true,
      params: normalizeWorld({ ...fromQuery, ...fromHeader }, this.defaults),
    };
  }

  readOnlyState(world) {
    const key = worldKey(world);
    const cached = this.readOnlyWorlds.get(key);
    if (cached) {
      this.readOnlyWorlds.delete(key);
      this.readOnlyWorlds.set(key, cached);
      return cached;
    }
    const state = buildSimulation(world);
    state.readOnly = true;
    this.readOnlyWorlds.set(key, state);
    if (this.readOnlyWorlds.size > MAX_READ_ONLY_WORLDS) {
      this.readOnlyWorlds.delete(this.readOnlyWorlds.keys().next().value);
    }
    return state;
  }

  createSession(sessionId, world) {
    if (this.sessions.size >= MAX_SESSIONS) {
      let oldestId = null;
      let oldestAccess = Infinity;
      for (const [id, session] of this.sessions) {
        if (session.lastAccess < oldestAccess) {
          oldestAccess = session.lastAccess;
          oldestId = id;
        }
      }
      if (oldestId) this.sessions.delete(oldestId);
    }
    const state = buildSimulation(world);
    state.readOnly = false;
    const session = {
      id: sessionId,
      params: { ...world },
      state,
      lastAccess: Date.now(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  sessionForRead(req, explicit) {
    const sessionId = this.readSessionId(req);
    if (!sessionId) return null;
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createSession(
        sessionId,
        explicit.provided ? explicit.params : this.defaults,
      );
      return session;
    }
    if (explicit.provided && !sameWorld(session.params, explicit.params)) {
      const state = buildSimulation(explicit.params);
      state.readOnly = false;
      session.state = state;
      session.params = { ...explicit.params };
    }
    session.lastAccess = Date.now();
    return session;
  }

  /** Resolve the world for a read. Never mutates shared state. */
  resolve(req) {
    const explicit = this.readExplicitWorld(req);
    const session = this.sessionForRead(req, explicit);
    if (session) {
      return { state: session.state, sessionId: session.id, readOnly: false };
    }
    const world = explicit.provided ? explicit.params : this.defaults;
    return { state: this.readOnlyState(world), sessionId: null, readOnly: true };
  }

  /** Resolve a writable sandbox. The default world rejects writes. */
  sessionForWrite(req) {
    const sessionId = this.readSessionId(req);
    if (!sessionId) {
      throw forbidden(
        'This is the shared read-only world. Send X-TrustWeave-Session to rebuild or sign records in your own sandbox.',
      );
    }
    const explicit = this.readExplicitWorld(req);
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createSession(
        sessionId,
        explicit.provided ? explicit.params : this.defaults,
      );
    } else if (explicit.provided && !sameWorld(session.params, explicit.params)) {
      const state = buildSimulation(explicit.params);
      state.readOnly = false;
      session.state = state;
      session.params = { ...explicit.params };
    }
    session.lastAccess = Date.now();
    return session;
  }

  runSimulation(req, params = {}) {
    const session = this.sessionForWrite(req);
    const world = normalizeWorld(params, session.params);
    const state = buildSimulation(world);
    state.readOnly = false;
    session.state = state;
    session.params = world;
    session.lastAccess = Date.now();
    return state;
  }

  getAssessment(state, projectId, contributorId) {
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

  appendRecord(req, input) {
    const session = this.sessionForWrite(req);
    const state = session.state;
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
    this.metricsCache.delete(state);
    this.multiMetricsCache.delete(state);

    const verifiedEntry = state.snapshot
      .verificationFor(project.id)
      ?.entries.find((item) => item.record.id === entry.record.id);

    return {
      entry,
      verification: verifiedEntry?.verification ?? null,
      state,
    };
  }

  getMetrics(state) {
    let metrics = this.metricsCache.get(state);
    if (!metrics) {
      metrics = computeMetricsForState(state);
      this.metricsCache.set(state, metrics);
    }
    return metrics;
  }

  getMultiMetrics(state) {
    const cached = this.multiMetricsCache.get(state);
    if (cached) return cached;
    const params = {
      seeds: config.multiSeedList,
      size: state.size,
      campaignSize: state.campaignSize,
    };
    const scenarios = {};
    for (const scenario of ['obvious', 'stealth']) {
      scenarios[scenario] = computeMetricsAcrossSeeds({ ...params, scenario });
    }
    const result = {
      multiSeed: scenarios[state.scenario] ?? scenarios.obvious,
      scenarios,
    };
    this.multiMetricsCache.set(state, result);
    return result;
  }

  /** The shared default world, used for startup logging. */
  ensureState() {
    return this.readOnlyState(this.defaults);
  }
}

export const simulationHost = new SimulationHost();
