import { Router } from 'express';
import { getHealth } from '../controllers/health-controller.js';
import { getProjectView, getProjects, postSimulate } from '../controllers/projects-controller.js';
import { getAssessment, getNewcomers } from '../controllers/contributors-controller.js';
import { getCampaigns } from '../controllers/campaigns-controller.js';
import { getRecords, postRecord } from '../controllers/records-controller.js';
import { getMetrics } from '../controllers/metrics-controller.js';
import { getExplainer } from '../controllers/demo-controller.js';

const router = Router();

router.get('/health', getHealth);
router.post('/simulate', postSimulate);
router.get('/projects', getProjects);
router.get('/projects/:id/view', getProjectView);
router.get('/contributors/:id/assessment', getAssessment);
router.get('/newcomers', getNewcomers);
router.get('/campaigns', getCampaigns);
router.get('/records', getRecords);
router.post('/records', postRecord);
router.get('/metrics', getMetrics);
router.get('/demo/explainer', getExplainer);

export default router;
