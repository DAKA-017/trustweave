import { app } from './app.js';
import { config } from './config/index.js';
import { simulationHost } from './services/simulation-host.js';

const state = simulationHost.ensureState();

const server = app.listen(config.port, () => {
  console.log(`TrustWeave backend (simulation host) listening on http://localhost:${config.port}`);
  console.log(
    `Simulated state: seed=${state.seed}, projects=${state.size}, campaignSize=${state.campaignSize}, PRs=${state.counts.pullRequests}, activeRecords=${state.counts.records}`,
  );
  console.log(`CORS restricted to ${config.frontendOrigin}`);
  console.log('No real repositories or GitHub credentials are used.');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. Set PORT in backend/.env to a free port.`);
  } else {
    console.error('Failed to start the backend:', error.message);
  }
  process.exitCode = 1;
});
