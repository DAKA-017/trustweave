import { simulationHost } from '../services/simulation-host.js';
import { simulationMeta } from './helpers.js';

export async function getSemanticClusters(req, res) {
  const { state, readOnly } = simulationHost.resolve(req);
  const result = await simulationHost.getSemanticClusters(state);
  res.json({
    simulation: simulationMeta(state),
    readOnly,
    ...result,
  });
}
