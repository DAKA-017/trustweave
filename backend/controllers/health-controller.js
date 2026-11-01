import { simulationHost } from '../services/simulation-host.js';
import { simulationMeta } from './helpers.js';

export function getHealth(req, res) {
  const { state, readOnly } = simulationHost.resolve(req);
  res.json({
    readOnly,
    status: 'ok',
    service: 'trustweave-backend',
    commit: process.env.RENDER_GIT_COMMIT || null,
    simulationHost: true,
    authority: false,
    simulated: true,
    ...simulationMeta(state),
  });
}
