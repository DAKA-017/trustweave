import {
  createRecordBodySchema,
  recordsQuerySchema,
} from '../models/schemas.js';
import { parseOrThrow } from '../utils/validate.js';
import { badRequest, notFound } from '../utils/errors.js';
import { simulationHost } from '../services/simulation-host.js';
import { projectSummary, simulationMeta } from './helpers.js';

export function getRecords(req, res) {
  const query = parseOrThrow(recordsQuerySchema, req.query);
  const state = simulationHost.ensureState();

  if (!query.projectId) {
    if (query.tamper !== 'none') {
      throw badRequest('The tamper demo requires a projectId');
    }
    const projects = [...state.projects.values()].map((project) => {
      const verification = state.snapshot.verificationFor(project.id);
      return {
        id: project.id,
        name: project.name,
        valid: verification?.valid ?? true,
        counts: verification?.counts ?? null,
      };
    });
    return res.json({
      simulation: simulationMeta(state),
      projects,
      defaultProjectId: projects[0]?.id ?? null,
      note: 'Pass ?projectId=... to inspect the full log. Pass &tamper=signature or &tamper=chain for the tamper demo.',
    });
  }

  const project = state.projects.get(query.projectId);
  if (!project) throw notFound(`Project ${query.projectId} was not found in this simulation`);

  const log = state.records.verifyProjectLog(project.id, {
    tamper: query.tamper,
    now: new Date(state.simulatedAt),
  });

  return res.json({
    simulation: simulationMeta(state),
    project: projectSummary(state, project),
    tamper: query.tamper,
    demoOnly: query.tamper !== 'none',
    note:
      query.tamper === 'none'
        ? 'Every log entry is verified against its Ed25519 signature and previous hash.'
        : 'Tamper mode verifies a modified copy of the log. The stored log is unchanged; this is a demonstration of rejection.',
    log,
  });
}

export function postRecord(req, res) {
  const body = parseOrThrow(createRecordBodySchema, req.body ?? {});
  const { entry, verification } = simulationHost.appendRecord(body);
  res.status(201).json({
    record: entry.record,
    hash: entry.hash,
    verification,
    note: 'Signed with the simulated project key and appended on the simulation host. Nothing was posted to a real repository.',
  });
}
