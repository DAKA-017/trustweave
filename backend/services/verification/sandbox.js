import { SimulationHost } from '../simulation-host.js';

export const DEFAULT_VERIFY_WORLD = Object.freeze({
  seed: 42,
  size: 30,
  campaignSize: 12,
  scenario: 'obvious',
});

const SESSION_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

let sandboxCounter = 0;

function nextSessionId() {
  sandboxCounter += 1;
  return `verify-${Date.now().toString(36)}-${sandboxCounter.toString(36)}`;
}

/**
 * A private SimulationHost and visitor session for one check. Nothing here is
 * registered with the shared simulationHost, so rebuilds, tampering and
 * appended records cannot reach the demo world or another check.
 */
export class VerificationSandbox {
  constructor(world = {}) {
    this.world = { ...DEFAULT_VERIFY_WORLD, ...world };
    this.host = new SimulationHost({
      seed: this.world.seed,
      size: this.world.size,
      campaignSize: this.world.campaignSize,
    });
    this.sessionId = nextSessionId();
    if (!SESSION_PATTERN.test(this.sessionId)) {
      throw new Error('Generated verification session id is malformed');
    }
    this.state = this.host.runSimulation(this.request(), this.world);
  }

  /** A fresh request carrying the same session header, like a page refresh. */
  request() {
    const sessionId = this.sessionId;
    return {
      query: {},
      body: {},
      get(name) {
        return String(name).toLowerCase() === 'x-trustweave-session'
          ? sessionId
          : undefined;
      },
    };
  }

  /** Re-resolve the visitor session through the path the dashboard uses. */
  refresh() {
    return this.host.resolve(this.request()).state;
  }

  append(input) {
    return this.host.appendRecord(this.request(), input);
  }

  rebuild(params) {
    this.state = this.host.runSimulation(this.request(), {
      ...this.world,
      ...params,
    });
    return this.state;
  }

  dispose() {
    this.host.sessions.clear();
    this.host.readOnlyWorlds.clear();
    this.state = null;
  }
}
