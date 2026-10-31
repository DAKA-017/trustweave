import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import apiRouter from './routes/api.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

export const app = express();
app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === config.frontendOrigin) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }),
);
app.use(express.json({ limit: config.jsonBodyLimit }));

app.use('/api', apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
