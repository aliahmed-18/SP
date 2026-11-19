import { env } from '../env';
import { HttpError } from './errors';

/**
 * Minimal Gemini client (REST, no SDK): one prompt in, one JSON value out. Server-side only — the key
 * never reaches a browser. Every failure becomes an HttpError the instructor can read, so the manual
 * flow always stays available (docs/06: "Must fail gracefully").
 *
 * Model names change (gemini-2.5-flash shuts down on 2026-12-01), so the default is Google's alias for
 * the newest Flash model, and a retired model falls back instead of breaking the demo.
 */
export type AiRequest = {
  system: string;
  prompt: string;
  /** OpenAPI-style schema Gemini must follow (responseSchema). */
  schema: Record<string, unknown>;
};
export type AiClient = (req: AiRequest) => Promise<unknown>;

/** Quality first: Google's newest Flash model with its full thinking (a minute or two is fine). */
export const DEFAULT_MODEL = 'gemini-flash-latest';
/** A retired / unknown model (404) moves down this list instead of breaking the demo. */
export const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
/** Thinking models can take a while on a full lecture; the instructor sees a running timer. */
const TIMEOUT_MS = 150_000;
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export const aiTimeout = () =>
  new HttpError(504, 'AI_TIMEOUT', 'The AI took too long. Try again, or carry on by hand.');
export const aiFailed = () =>
  new HttpError(502, 'AI_FAILED', "The AI couldn't help this time. Try again, or carry on by hand.");
const aiKey = () =>
  new HttpError(
    502,
    'AI_KEY',
    "The AI key isn't valid. Check GEMINI_API_KEY in .env, then restart the server. You can carry on by hand.",
  );

function body({ system, prompt, schema }: AiRequest) {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });
}

async function call(req: AiRequest, model: string, key: string): Promise<Response> {
  try {
    return await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: body(req),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError'))
      throw aiTimeout();
    console.error('[getit] AI request failed', err);
    throw aiFailed();
  }
}

/** "```json … ```" or stray text around the JSON → the JSON value, or undefined. */
export function parseJsonLoose(text: string): unknown {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(t) as unknown;
  } catch {
    const start = t.search(/[[{]/);
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(t.slice(start, end + 1)) as unknown;
    } catch {
      return undefined;
    }
  }
}

/**
 * How long Google asks us to wait after a 429 (RetryInfo "retryDelay": "17s" or "retry in 17.3s"),
 * or null for a daily limit (waiting won't help today).
 */
export function retryAfterMs(detail: string): number | null {
  if (/PerDay|per day|daily/i.test(detail)) return null;
  const m =
    /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(detail) ?? /retry in (\d+(?:\.\d+)?)\s*s/i.exec(detail);
  return m ? Math.ceil(Number(m[1]) * 1000) : 5_000;
}
/** Longest we wait for a per-minute limit before moving to the next model. */
const MAX_WAIT_MS = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const geminiClient: AiClient = async (req) => {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new HttpError(503, 'AI_OFF', "AI isn't set up on this server.");
  const models = [...new Set([env.GEMINI_MODEL, ...FALLBACK_MODELS])];
  let m = 0;
  let waited = false;
  let lastBusy: string | null = null;
  while (m < models.length) {
    const model = models[m]!;
    const started = Date.now();
    const res = await call(req, model, key);
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      } | null;
      const text =
        json?.candidates?.[0]?.content?.parts
          ?.filter((p) => !p.thought)
          .map((p) => p.text ?? '')
          .join('') ?? '';
      // One line per AI call, so slowness can be measured on the instructor's machine.
      console.log(`[getit] AI ${model} answered in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      const value = parseJsonLoose(text);
      if (value === undefined) {
        console.error('[getit] AI returned no usable JSON');
        throw aiFailed();
      }
      return value;
    }
    // Log the provider's message for the team; never forward it (it can mention the key or quota).
    const detail = (await res.text().catch(() => '')).slice(0, 1000);
    console.error(`[getit] AI error ${res.status} (${model}): ${detail.slice(0, 500)}`);
    if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid/i.test(detail))
      throw aiKey();
    if (res.status === 429) {
      // Free tier: a per-minute limit passes if we wait a little; a daily one doesn't. Then try the next
      // model, which has its own (larger, for Flash-Lite) allowance.
      const wait = retryAfterMs(detail);
      lastBusy = wait === null ? 'daily' : 'minute';
      if (wait !== null && !waited && wait <= MAX_WAIT_MS) {
        waited = true;
        console.log(`[getit] AI ${model} busy; retrying in ${(wait / 1000).toFixed(0)} s`);
        await sleep(wait);
        continue;
      }
      m++;
      waited = false;
      if (m < models.length) console.log(`[getit] AI ${model} busy; trying ${models[m]}`);
      continue;
    }
    if (res.status === 404 && m < models.length - 1) {
      console.error(`[getit] AI model "${model}" not found; trying ${models[m + 1]}`);
      m++;
      continue;
    }
    throw aiFailed();
  }
  if (lastBusy)
    throw new HttpError(
      429,
      'AI_BUSY',
      lastBusy === 'daily'
        ? "Today's free AI limit is used up. It resets tomorrow — or turn on billing for the Gemini key."
        : 'The AI is busy right now (free limit reached). Try again in a minute.',
    );
  throw aiFailed();
};
