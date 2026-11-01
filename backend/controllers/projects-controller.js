import { simulateBodySchema } from '../models/schemas.js';
import { parseOrThrow } from '../utils/validate.js';
import { notFound } from '../utils/errors.js';
import { simulationHost } from '../services/simulation-host.js';
import {
  effectiveTrustList,
  incomingAssessments,
  projectSummary,
  simulationMeta,
} from './helpers.js';

export function postSimulate(req, res) {
  const body = parseOrThrow(simulateBodySchema, req.body ?? {});
  const state = simulationHost.runSimulation(req, body);
  res.json({
    simulation: simulationMeta(state),
    readOnly: false,
    campaignsDetected: state.campaignData.campaigns.length,
    note: 'Simulation rebuilt in your own sandbox from the seed. State is in memory only; no repository was contacted.',
  });
}

export function getProjects(req, res) {
  const { state, readOnly } = simulationHost.resolve(req);
  res.json({
    simulation: simulationMeta(state),
    readOnly,
    projects: [...state.projects.values()].map((project) => projectSummary(state, project)),
  });
}

export function getProjectView(req, res) {
  const { state, readOnly } = simulationHost.resolve(req);
  const project = state.projects.get(req.params.id);
  if (!project) throw notFound(`Project ${req.params.id} was not found in this simulation`);
  const { items, summary } = incomingAssessments(state, project.id);
  res.json({
    simulation: simulationMeta(state),
    readOnly,
    project: projectSummary(state, project, { includeKey: true }),
    effectiveTrust: effectiveTrustList(state, project),
    incoming: items,
    summary,
  });
}
