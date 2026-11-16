import { z } from 'zod';
import { CODE_REGEX } from './codes';

// Zod schemas shared by client and server. Feature schemas are added per phase.
export const joinCodeSchema = z.string().regex(CODE_REGEX, "That session doesn't exist or has expired.");
