import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import apiRouter from './routes/api.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

export const app = express();
app.disable('x-powered-by');
// Render proxies every request, so trust one hop to read the real client IP.
app.set('trust proxy', 1);

function isAllowedOrigin(origin) {
  if (!origin || origin === config.frontendOrigin) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    return (
      protocol === 'https:' &&
      hostname.startsWith('trustweave-') &&
      hostname.endsWith('.vercel.app')
    );
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      return callback(null, isAllowedOrigin(origin));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-TrustWeave-Session',
      'X-TrustWeave-World',
      'X-Verify-Token',
    ],
  }),
);
app.use(express.json({ limit: config.jsonBodyLimit }));

app.use('/api', apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
