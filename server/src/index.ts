import { createServer } from 'node:http';
import { createApp } from './app';
import { prisma } from './db';
import { env } from './env';
import { createSocketServer } from './realtime/socket';

const app = createApp();
const httpServer = createServer(app);
const io = createSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`[getit] server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string) {
  console.log(`[getit] ${signal} received, shutting down`);
  await io.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
