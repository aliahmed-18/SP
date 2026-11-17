import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { isProd } from './env';
import { errorHandler, notFoundApi } from './lib/errors';
import { authRouter } from './auth/routes';
import { activitiesRouter } from './routes/activities';
import { coursesRouter } from './routes/courses';
import { healthRouter } from './routes/health';
import { publicRouter } from './routes/public';
import { qaRouter } from './routes/qa';
import { takeawayRouter } from './routes/takeaway';
import { sessionsRouter } from './routes/sessions';

const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind the hosting platform's proxy (secure cookies, real IPs)
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"], // no inline scripts anywhere (theme-init.js is a file)
          styleSrc: ["'self'", "'unsafe-inline'"], // React style={} attributes + toast styles
          imgSrc: ["'self'", 'data:', 'blob:'], // QR codes + Take-away image are data: URLs
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'ws:', 'wss:'], // Socket.io (same host)
          manifestSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(healthRouter);
  api.use(authRouter);
  api.use(coursesRouter);
  api.use(sessionsRouter);
  api.use(publicRouter);
  api.use(qaRouter);
  api.use(activitiesRouter);
  api.use(takeawayRouter);
  api.use(notFoundApi);
  app.use('/api', api);

  // Production: one service serves the built client and falls back to index.html for client routes.
  if (isProd && existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) => {
      res.sendFile('index.html', { root: clientDist });
    });
  }

  app.use(errorHandler);
  return app;
}
