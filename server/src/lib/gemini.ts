import { env } from '../env';
import { HttpError } from './errors';

/**
 * Minimal Gemini client (REST, no SDK): one prompt in, one JSON value out. Server-side only — the key
 * never reaches a browser. Every failure becomes an HttpError the instructor can read, so the manual
 * flow always stays available (docs/06: "Must fail gracefully").
 */
export type AiRequest = {
  system: string;
  prompt: string;
  /** OpenAPI-style schema Gemini must follow (responseSchema). */
  schema: Record<string, unknown>;
};
export type AiClient = (req: AiRequest) => Promise<unknown>;

const TIMEOUT_MS = 20_000;
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export const aiTimeout = () =>
  new HttpError(504, 'AI_TIMEOUT', 'The AI took too long. Try again, or carry on by hand.');
export const aiFailed = () =>
  new HttpError(502, 'AI_FAILED', "The AI couldn't help this time. Try again, or carry on by hand.");

export const geminiClient: AiClient = async ({ system, prompt, schema }) => {
  if (!env.GEMINI_API_KEY) throw new HttpError(503, 'AI_OFF', "AI isn't set up on this server.");
  let res: Response;
  try {
    res = await fetch(`${API}/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError'))
      throw aiTimeout();
    console.error('[getit] AI request failed', err);
    throw aiFailed();
  }
  if (res.status === 429)
    throw new HttpError(
      429,
      'AI_BUSY',
      'The AI is busy right now (free limit reached). Try again in a minute.',
    );
  if (!res.ok) {
    // Log the provider's message for the team; never forward it (it can mention the key or quota details).
    console.error(`[getit] AI error ${res.status}: ${(await res.text().catch(() => '')).slice(0, 500)}`);
    throw aiFailed();
  }
  const body = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    return JSON.parse(text) as unknown;
  } catch {
    console.error('[getit] AI returned non-JSON output');
    throw aiFailed();
  }
};
