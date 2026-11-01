import { app } from './app.js';
import { config } from './config/index.js';
import { simulationHost } from './services/simulation-host.js';
import { formatResultsTable } from './services/verification/index.js';
import { verificationAgent } from './services/verification/agent.js';

const state = simulationHost.ensureState();

const server = app.listen(config.port, () => {
  console.log(`TrustWeave backend (simulation host) listening on http://localhost:${config.port}`);
  console.log(
    `Simulated state: seed=${state.seed}, projects=${state.size}, campaignSize=${state.campaignSize}, PRs=${state.counts.pullRequests}, activeRecords=${state.counts.records}`,
  );
  console.log(`CORS restricted to ${config.frontendOrigin}`);
  console.log('No real repositories or GitHub credentials are used.');

  if (config.verifyOnStart) {
    setImmediate(async () => {
      console.log('Verifier: running startup checks in a worker…');
      const run = await verificationAgent.trigger('startup');
      if (run) console.log(formatResultsTable(run));
    });
  }

  if (config.verifyIntervalMinutes > 0) {
    verificationAgent.start();
    console.log(
      `Verifier agent: checking every ${config.verifyIntervalMinutes} minute(s); status at GET /api/verify/latest`,
    );
  } else {
    console.log('Verifier agent: scheduled runs disabled (VERIFY_INTERVAL_MINUTES=0).');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. Set PORT in backend/.env to a free port.`);
  } else {
    console.error('Failed to start the backend:', error.message);
  }
  process.exitCode = 1;
});
