import type { AiClient } from './gemini';

/**
 * Deterministic stand-in for Gemini, for the end-to-end tests only (AI_FAKE=1, never in production).
 * It answers the generation prompt with valid drafts built from the material, after a short delay so
 * the "keep teaching while the AI works" flow can be tested. Other AI calls get empty answers.
 */
export const fakeAiClient: AiClient = async ({ prompt }) => {
  await new Promise((r) => setTimeout(r, Number(process.env.AI_FAKE_DELAY_MS ?? 1500)));
  const material = /<material>\n([\s\S]*?)\n<\/material>/.exec(prompt)?.[1];
  const answers = /<answers>\n([\s\S]*?)\n<\/answers>/.exec(prompt)?.[1]?.split('\n') ?? [];
  if (answers.length) {
    // Grading: the first half correct, the rest a misconception.
    const half = Math.ceil(answers.length / 2);
    const n = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i + 1);
    return {
      groups: [
        { label: 'Fake: right idea', tag: 'CORRECT', answers: n(0, half) },
        ...(answers.length > half
          ? [
              {
                label: 'Fake: confuses slope with strength',
                tag: 'MISCONCEPTION',
                answers: n(half, answers.length),
              },
            ]
          : []),
      ],
    };
  }
  if (!material) return { topics: [], keyPoints: [], groups: [] };
  const count = Number(/Write (\d+) question/.exec(prompt)?.[1] ?? 1);
  const kinds = (/Use only these types: ([A-Z_, ]+)\./.exec(prompt)?.[1] ?? 'TRUE_FALSE').split(', ');
  const part = (/part (\d) of/.exec(prompt) ?? /writer (\d) of/.exec(prompt))?.[1] ?? '1';
  const idea = (material.split(/[.\n]/).find((l) => l.trim().length > 10) ?? 'the lecture')
    .trim()
    .slice(0, 80);
  return {
    questions: Array.from({ length: count }, (_, i) => {
      const kind = kinds[i % kinds.length];
      const prompt = `Fake ${kind} ${part}.${i + 1}: ${idea}?`;
      if (kind === 'MCQ')
        return {
          kind,
          prompt,
          options: ['First', 'Second', 'Third'],
          correctOption: 1,
          explanation: 'Fake.',
        };
      if (kind === 'NUMERIC') return { kind, prompt, correctNumber: 42, tolerance: 0, explanation: 'Fake.' };
      if (kind === 'EXPLAIN') return { kind, prompt, explanation: 'A fake model answer.' };
      return { kind: 'TRUE_FALSE', prompt, correctTrue: true, explanation: 'Fake.' };
    }),
  };
};
