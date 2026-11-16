import { createHash } from 'node:crypto';
import { env } from '../env';

/** Rule 2: the server only ever stores sha256(deviceId + DEVICE_SALT). Never send the result to any client. */
export function hashDevice(deviceId: string): string {
  return createHash('sha256')
    .update(deviceId + env.DEVICE_SALT)
    .digest('hex');
}
