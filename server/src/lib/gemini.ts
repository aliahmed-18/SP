import { env } from '../env';
import { HttpError } from './errors';

/**
 * Minimal Gemini client (REST, no SDK): one prompt in, one JSON value out. Server-side only — the key
 * never reaches a browser. Every failure becomes an HttpError the instructor can read, so the manual
 * flow always stays available (docs/06: "Must fail gracefully").
 *
 * Model names change (gemini-2.5-flash shuts down on 2026-12-01), so the default is Google's alias for
 * the newest Flash model, and a retired model falls back to that alias instead of breaking the demo.
 */
export type AiRequest = {
  system: string;
  prompt: string;
  /** OpenAPI-style schema Gemini must follow (responseSchema). */
  schema: Record<string, unknown>;
};
export type AiClient = (req: AiRequest) => Promise<unknown>;

export const FALLBACK_MODEL = 'gemini-flash-latest';
const TIMEOUT_MS = 45_000;
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

type Attempt = { model: string; thinking: boolean };

function body({ system, prompt, schema }: AiRequest, thinking: boolean) {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseSchema: schema,
      // Short tasks: little thinking = fast answers in class. Dropped if a model doesn't accept it.
      ...(thinking ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
    },
  });
}

async function call(req: AiRequest, a: Attempt, key: string): Promise<Response> {
  try {
    return await fetch(`${API}/${encodeURIComponent(a.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: body(req, a.thinking),
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

export const geminiClient: AiClient = async (req) => {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new HttpError(503, 'AI_OFF', "AI isn't set up on this server.");
  let attempt: Attempt = { model: env.GEMINI_MODEL, thinking: true };
  // At most 3 tries: as configured → without the thinking setting → on the fallback model.
  for (let tries = 0; tries < 3; tries++) {
    const res = await call(req, attempt, key);
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      } | null;
      const text =
        json?.candidates?.[0]?.content?.parts
          ?.filter((p) => !p.thought)
          .map((p) => p.text ?? '')
          .join('') ?? '';
      const value = parseJsonLoose(text);
      if (value === undefined) {
        console.error('[getit] AI returned no usable JSON');
        throw aiFailed();
      }
      return value;
    }
    // Log the provider's message for the team; never forward it (it can mention the key or quota).
    const detail = (await res.text().catch(() => '')).slice(0, 500);
    console.error(`[getit] AI error ${res.status} (${attempt.model}): ${detail}`);
    if (res.status === 429)
      throw new HttpError(
        429,
        'AI_BUSY',
        'The AI is busy right now (free limit reached). Try again in a minute.',
      );
    if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid/i.test(detail))
      throw aiKey();
    if (res.status === 400 && attempt.thinking && /thinking/i.test(detail)) {
      attempt = { ...attempt, thinking: false };
      continue;
    }
    if (res.status === 404 && attempt.model !== FALLBACK_MODEL) {
      console.error(`[getit] AI model "${attempt.model}" not found; using ${FALLBACK_MODEL}`);
      attempt = { model: FALLBACK_MODEL, thinking: attempt.thinking };
      continue;
    }
    throw aiFailed();
  }
  throw aiFailed();
};
