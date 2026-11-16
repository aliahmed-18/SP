import { Router, type Request } from 'express';
import { codeParamSchema, deviceIdSchema, type PublicSessionInfo } from '@getit/shared';
import { HttpError } from '../lib/errors';
import { hashDevice } from '../lib/deviceHash';
import { parse } from '../lib/validate';
import { buildStudentState } from '../realtime/broadcast';
import { joinSession } from '../services/participants';
import { getPublicSession } from '../services/sessions';

export const publicRouter = Router();

function deviceHashOf(req: Request): string {
  const raw = req.header('x-device-id');
  const parsed = deviceIdSchema.safeParse(raw);
  if (!parsed.success)
    throw new HttpError(400, 'DEVICE_ID_REQUIRED', 'Please reload the page and try again.');
  return hashDevice(parsed.data);
}

publicRouter.get('/public/sessions/:code', async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const s = await getPublicSession(code);
  const body: PublicSessionInfo = { topic: s.topic, status: s.status };
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
