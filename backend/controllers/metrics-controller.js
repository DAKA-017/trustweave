import { metricsQuerySchema } from '../models/schemas.js';
import { parseOrThrow } from '../utils/validate.js';
import { simulationHost } from '../services/simulation-host.js';
import { simulationMeta } from './helpers.js';

export function getMetrics(req, res) {
  const query = parseOrThrow(metricsQuerySchema, req.query);
  const state = simulationHost.ensureState();

  if (query.multi === '1') {
    return res.json({
      simulation: simulationMeta(state),
      multiSeed: simulationHost.getMultiMetrics(),
      note: 'Each seed rebuilds the whole simulation. Results are compared with simulator ground truth; real deployments do not have that.',
    });
  }

  return res.json({
    simulation: simulationMeta(state),
    metrics: simulationHost.getMetrics(),
    note: 'Metrics compare detector and trust-engine output with the simulator ground truth for this seed.',
  });
}
