import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { isProd } from './env';
import { errorHandler, notFoundApi } from './lib/errors';
import { healthRouter } from './routes/health';

const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind the hosting platform's proxy (secure cookies, real IPs)
  app.disable('x-powered-by');
  app.use(
    helmet({
      // The SPA uses inline SVG + data: QR images; tighten in Phase 7 once all screens exist.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(healthRouter);
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
