import { simulationHost } from '../services/simulation-host.js';
import { simulationMeta } from './helpers.js';

export function getHealth(req, res) {
  const state = simulationHost.ensureState();
  res.json({
    status: 'ok',
    service: 'trustweave-backend',
    simulationHost: true,
    authority: false,
    simulated: true,
    ...simulationMeta(state),
  });
}
