import { Router, type Request } from 'express';
import { codeParamSchema, deviceIdSchema, INVALID_CODE_MESSAGE, type PublicSessionInfo } from '@getit/shared';
import { HttpError } from '../lib/errors';
import { hashDevice } from '../lib/deviceHash';
import { publicUrl } from '../lib/public-url';
import { parse } from '../lib/validate';
import { buildStudentState } from '../realtime/broadcast';
import { joinSession } from '../services/participants';
import { findPublicSession, findScheduledPublic, getPublicSession } from '../services/sessions';

export const publicRouter = Router();

function deviceHashOf(req: Request): string {
  const raw = req.header('x-device-id');
  const parsed = deviceIdSchema.safeParse(raw);
  if (!parsed.success)
    throw new HttpError(400, 'DEVICE_ID_REQUIRED', 'Please reload the page and try again.');
  return hashDevice(parsed.data);
}

/** Where phones should go (QR): a tunnel / public address when the app runs on a laptop, else null. */
publicRouter.get('/public/config', (_req, res) => {
  res.setHeader('cache-control', 'no-store');
  res.json({ publicUrl: publicUrl() });
});

publicRouter.get('/public/sessions/:code', async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  // A phone that opens a planned lecture's code early gets its start time (waiting screen).
  const s = (await findPublicSession(code)) ?? (await findScheduledPublic(code));
  if (!s) throw new HttpError(404, 'NOT_FOUND', INVALID_CODE_MESSAGE);
  const body: PublicSessionInfo = {
    topic: s.topic,
    status: s.status,
    scheduledFor: s.status === 'SCHEDULED' ? (s.scheduledFor?.toISOString() ?? null) : null,
  };
  res.json(body);
});

/** Registers the device (LIVE only) and returns the student snapshot. */
publicRouter.post('/public/sessions/:code/join', async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const deviceHash = deviceHashOf(req);
  const s = await getPublicSession(code);
  if (s.status === 'LIVE') await joinSession(s.id, deviceHash);
  res.json(await buildStudentState(s.id, deviceHash));
});
