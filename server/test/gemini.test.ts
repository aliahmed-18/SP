// The real Gemini client against a fake Google endpoint (fetch stubbed): request shape, retries, errors.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env';
import type { HttpError } from '../src/lib/errors';
import { FALLBACK_MODEL, geminiClient, parseJsonLoose } from '../src/lib/gemini';

const REQ = { system: 'sys', prompt: 'prompt', schema: { type: 'OBJECT' } };
type Call = { url: string; init: RequestInit & { headers: Record<string, string> } };
let calls: Call[] = [];

function respond(...replies: (Response | Error)[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: Call['init']) => {
      calls.push({ url, init });
      const r = replies.shift();
      if (!r) throw new Error('unexpected extra call');
      if (r instanceof Error) throw r;
      return r;
    }),
  );
}
const ok = (text: string, extra: object[] = []) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [...extra, { text }] } }] }), {
    status: 200,
  });
const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { code: status, message } }), { status });
const sentBody = (i: number) => JSON.parse(calls[i]!.init.body as string);

let saved: { key?: string; model: string };
beforeEach(() => {
  calls = [];
  saved = { key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
  env.GEMINI_API_KEY = 'test-key';
  env.GEMINI_MODEL = 'gemini-old-model';
});
afterEach(() => {
  vi.unstubAllGlobals();
  env.GEMINI_API_KEY = saved.key;
  env.GEMINI_MODEL = saved.model;
});

async function error(p: Promise<unknown>) {
  try {
    await p;
  } catch (err) {
    return err as HttpError;
  }
  throw new Error('expected an error');
}

describe('Gemini client', () => {
  it('sends the key in a header (never the URL), JSON mode + schema, and parses the answer', async () => {
    respond(ok('{"topics":[]}', [{ thought: true, text: 'thinking…' }]));
    expect(await geminiClient(REQ)).toEqual({ topics: [] });
    const c = calls[0]!;
    expect(c.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-old-model:generateContent',
    );
    expect(c.url).not.toContain('test-key');
    expect(c.init.headers['x-goog-api-key']).toBe('test-key');
    const body = sentBody(0);
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.contents[0].parts[0].text).toBe('prompt');
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT' },
      thinkingConfig: { thinkingLevel: 'low' },
    });
  });

  it('a retired model (404) falls back to gemini-flash-latest', async () => {
    respond(fail(404, 'models/gemini-old-model is not found'), ok('{"a":1}'));
    expect(await geminiClient(REQ)).toEqual({ a: 1 });
    expect(calls[1]!.url).toContain(`/models/${FALLBACK_MODEL}:generateContent`);
  });

  it('a model that rejects the thinking setting is retried without it', async () => {
    respond(fail(400, 'Unknown name "thinkingLevel" at generation_config.thinking_config'), ok('{"a":1}'));
    expect(await geminiClient(REQ)).toEqual({ a: 1 });
    expect(sentBody(1).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('bad key, quota, timeout, other errors → readable errors that mention carrying on by hand', async () => {
    respond(fail(400, 'API key not valid. Please pass a valid API key. [API_KEY_INVALID]'));
    expect(await error(geminiClient(REQ))).toMatchObject({ status: 502, code: 'AI_KEY' });

    respond(fail(429, 'Resource has been exhausted'));
    expect(await error(geminiClient(REQ))).toMatchObject({ status: 429, code: 'AI_BUSY' });

    respond(new DOMException('timed out', 'TimeoutError'));
    expect(await error(geminiClient(REQ))).toMatchObject({ status: 504, code: 'AI_TIMEOUT' });

    respond(fail(500, 'internal'));
    const e = await error(geminiClient(REQ));
    expect(e).toMatchObject({ status: 502, code: 'AI_FAILED' });
    expect(e.message).toMatch(/carry on by hand/);

    respond(ok('Sorry, I cannot help with that.'));
    expect(await error(geminiClient(REQ))).toMatchObject({ code: 'AI_FAILED' });
  });

  it('never loops: a 404 on the fallback model itself stops', async () => {
    env.GEMINI_MODEL = FALLBACK_MODEL;
    respond(fail(404, 'not found'));
    expect(await error(geminiClient(REQ))).toMatchObject({ code: 'AI_FAILED' });
    expect(calls).toHaveLength(1);
  });

  it('no key → AI_OFF without any network call', async () => {
    env.GEMINI_API_KEY = '';
    respond();
    expect(await error(geminiClient(REQ))).toMatchObject({ status: 503, code: 'AI_OFF' });
    expect(calls).toHaveLength(0);
  });
});

describe('parseJsonLoose', () => {
  it('accepts plain JSON, ```json fences and text around the JSON', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Here you go: {"a":[1,2]} Hope it helps')).toEqual({ a: [1, 2] });
    expect(parseJsonLoose('no json here')).toBeUndefined();
  });
});
