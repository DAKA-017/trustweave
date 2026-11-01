import { metricsQuerySchema } from '../models/schemas.js';
import { parseOrThrow } from '../utils/validate.js';
import { simulationHost } from '../services/simulation-host.js';
import { simulationMeta } from './helpers.js';

export function getMetrics(req, res) {
  const query = parseOrThrow(metricsQuerySchema, req.query);
  const { state, readOnly } = simulationHost.resolve(req);

  if (query.multi === '1') {
    const multi = simulationHost.getMultiMetrics(state);
    return res.json({
      simulation: simulationMeta(state),
      readOnly,
      multiSeed: multi.multiSeed,
      scenarios: multi.scenarios,
      note: 'Each seed rebuilds the whole simulation independently. Precision, recall and newcomer false-flag rates are measured for both the obvious and stealth scenarios against simulator ground truth; real deployments do not have those labels.',
    });
  }

  return res.json({
    simulation: simulationMeta(state),
    readOnly,
    metrics: simulationHost.getMetrics(state),
    note: 'Metrics compare detector and trust-engine output with the simulator ground truth for this seed.',
  });
}
