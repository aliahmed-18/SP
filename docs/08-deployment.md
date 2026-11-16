# 08 — Environment & Deployment

## Environment variables (`.env.example`)
```
# server
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://getit:getit@localhost:5432/getit
JWT_SECRET=change-me-to-a-long-random-string
DEVICE_SALT=change-me-to-another-long-random-string
CLIENT_ORIGIN=http://localhost:5173
# optional stretch
GEMINI_API_KEY=
```
Validate with zod in `server/src/env.ts`; crash on start with a clear message if something is missing.

## Local
- `docker-compose.yml`: `postgres:16`, user/pass/db `getit`, port 5432, named volume.
- Vite dev server proxies `/api` and `/socket.io` (with `ws: true`) to `http://localhost:4000` → same origin in dev, so cookies just work.
- Phones on the same Wi-Fi: run Vite with `--host` and open `http://<laptop-ip>:5173`. (For the real demo use the deployed URL instead.)

## Production — ONE service (simplest, no CORS problems)
- `npm run build` builds `client/dist`; Express serves it as static files and falls back to `index.html` for client routes. API under `/api`, Socket.io on the same server.
- Host on a platform that supports **long-lived WebSocket connections** and a always-on Node process, e.g. Render, Railway or Fly.io (not serverless functions — Socket.io needs a persistent server). Check the platform's current free/student plans and **avoid plans that sleep** when idle, or wake the service 10 minutes before the demo.
- Database: the platform's managed Postgres or a hosted Postgres (e.g. Neon). Run `prisma migrate deploy` on each deploy.
- HTTPS is required (cookies `secure`, phone cameras opening the QR link).
- Set `trust proxy` in Express behind the platform proxy.
- Single instance only (no horizontal scaling) — enough for a classroom and avoids needing a Socket.io adapter.

## Before the presentation (checklist)
- [ ] Deployed URL works on 3 different phones (iPhone Safari, Android Chrome) **on mobile data and on campus Wi-Fi**.
- [ ] QR opens `/join/CODE` directly.
- [ ] Seed data loaded on production for the dashboard history.
- [ ] Service is awake (open `/api/health`).
- [ ] Backup video + hotspot ready.
