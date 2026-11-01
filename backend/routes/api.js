import { Router } from 'express';
import { getHealth } from '../controllers/health-controller.js';
import { getProjectView, getProjects, postSimulate } from '../controllers/projects-controller.js';
import { getAssessment, getNewcomers } from '../controllers/contributors-controller.js';
import { getCampaigns } from '../controllers/campaigns-controller.js';
import { getSemanticClusters } from '../controllers/semantic-clusters-controller.js';
import { getRecords, postRecord } from '../controllers/records-controller.js';
import { getMetrics } from '../controllers/metrics-controller.js';
import { getExplainer } from '../controllers/demo-controller.js';
import {
  getVerifyHistory,
  getVerifyLatest,
  postVerifyRun,
} from '../controllers/verify-controller.js';
import { rateLimit } from '../middleware/rate-limit.js';

const router = Router();
const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
const limitSimulate = rateLimit({ max: 10 });
const limitRecord = rateLimit({ max: 20 });
const limitVerifyRun = rateLimit({ max: 3 });

router.get('/health', getHealth);
router.post('/simulate', limitSimulate, postSimulate);
router.get('/projects', getProjects);
router.get('/projects/:id/view', getProjectView);
router.get('/contributors/:id/assessment', getAssessment);
router.get('/newcomers', getNewcomers);
router.get('/campaigns', getCampaigns);
router.get('/semantic-clusters', wrap(getSemanticClusters));
router.get('/records', getRecords);
router.post('/records', limitRecord, postRecord);
router.get('/metrics', getMetrics);
router.get('/demo/explainer', getExplainer);
router.get('/verify/latest', getVerifyLatest);
router.get('/verify/history', getVerifyHistory);
router.post('/verify/run', limitVerifyRun, wrap(postVerifyRun));

export default router;
