import { describe, expect, it } from 'vitest';
import { EXPLAIN_MAX } from './constants';
import { moderateQuestion } from './moderation';
import {
  answerLabel,
  moderateAnswer,
  isCorrect,
  parseNumericAnswer,
  questionsTsv,
  sortTopics,
  suggestion,
  summarizeRound,
  tsvCell,
} from './rules';

describe('sortTopics', () => {
  it('orders by Me too, then by number of questions', () => {
    const topics = [
      { id: 'a', meTooCount: 2 },
      { id: 'b', meTooCount: 9 },
      { id: 'c', meTooCount: 2 },
    ];
    const questions = [{ topicId: 'c' }, { topicId: 'c' }, { topicId: 'a' }, { topicId: null }];
    expect(sortTopics(topics, questions).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('questions TSV', () => {
  const p1 = { id: 'p1', number: 1 };
  const p2 = { id: 'p2', number: 2 };
  const t = (id: string, partId: string, title: string, meTooCount = 0) => ({
    id,
    partId,
    title,
    meTooCount,
  });
  const q = (partId: string, topicId: string | null, text: string, min: number) => ({
    partId,
    topicId,
    text,
    createdAt: new Date(Date.UTC(2026, 0, 1, 10, min)).toISOString(),
  });

  it('never lets student text become a formula or break the grid', () => {
    expect(tsvCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(tsvCell('-1 + 2?')).toBe("'-1 + 2?");
    expect(tsvCell('a\tb\nc')).toBe('a b c');
    expect(tsvCell('ما هو الميل؟')).toBe('ما هو الميل؟');
  });

  it('one part: topic columns (sorted) + Ungrouped, oldest first', () => {
    const tsv = questionsTsv(
      [p1],
      [t('t1', 'p1', 'Slope', 1), t('t2', 'p1', 'r vs b', 5)],
      [
        q('p1', 't1', 'How is b computed?', 2),
        q('p1', null, 'Exam?', 3),
        q('p1', 't2', 'Is r the slope?', 1),
      ],
    );
    expect(tsv.split('\n')).toEqual([
      'r vs b\tSlope\tUngrouped',
      'Is r the slope?\tHow is b computed?\tExam?',
    ]);
  });

  it('several parts: leading Part column, one block per part', () => {
    const tsv = questionsTsv(
      [p2, p1],
      [t('t1', 'p1', 'Slope')],
      [q('p1', 't1', 'A', 1), q('p1', 't1', 'B', 2), q('p2', null, 'C', 30)],
    );
    expect(tsv.split('\n')).toEqual(['Part\tSlope\tUngrouped', 'Part 1\tA\t', 'Part 1\tB\t', 'Part 2\t\tC']);
  });
});

describe('isCorrect', () => {
  it('numeric tolerance edges', () => {
    expect(isCorrect(43.04, 43.04, 'NUMERIC', 0)).toBe(true);
    expect(isCorrect(43.14, 43.04, 'NUMERIC', 0.1)).toBe(true); // exactly at the edge (float noise)
    expect(isCorrect(42.94, 43.04, 'NUMERIC', 0.1)).toBe(true);
    expect(isCorrect(43.15, 43.04, 'NUMERIC', 0.1)).toBe(false);
    expect(isCorrect(0.3, 0.1 + 0.2, 'NUMERIC', 0)).toBe(true);
    expect(isCorrect(43, 43.04, 'NUMERIC', 0)).toBe(false);
    expect(isCorrect(-5, 5, 'NUMERIC', 9.99)).toBe(false);
  });
  it('MCQ index and True/False match exactly', () => {
    expect(isCorrect(1, 1, 'MCQ', null)).toBe(true);
    expect(isCorrect(2, 1, 'MCQ', null)).toBe(false);
    expect(isCorrect(false, false, 'TRUE_FALSE', null)).toBe(true);
    expect(isCorrect(true, false, 'TRUE_FALSE', null)).toBe(false);
  });
});

describe('suggestion thresholds (docs/09)', () => {
  it('29 → reExplain, 30 & 70 → discuss, 71 → moveOn', () => {
    expect(suggestion(0)).toBe('reExplain');
    expect(suggestion(29)).toBe('reExplain');
    expect(suggestion(29.9)).toBe('reExplain');
    expect(suggestion(30)).toBe('discuss');
    expect(suggestion(70)).toBe('discuss');
    expect(suggestion(70.1)).toBe('moveOn');
    expect(suggestion(71)).toBe('moveOn');
    expect(suggestion(100)).toBe('moveOn');
  });
});

describe('summarizeRound', () => {
  it('MCQ: % correct, sure-and-wrong, every option in order', () => {
    const s = summarizeRound(
      { kind: 'MCQ', options: ['a', 'b', 'c', 'd'], correct: 1, tolerance: null },
      [
        { answer: 1, confident: true },
        { answer: 1, confident: false },
        { answer: 1, confident: null },
        { answer: 0, confident: true }, // sure and wrong
        { answer: 2, confident: false },
        { answer: 2, confident: null },
        { answer: 2, confident: true }, // sure and wrong
        { answer: 1, confident: true },
      ],
      1,
    );
    expect(s).toEqual({
      round: 1,
      count: 8,
      percentCorrect: 50,
      sureWrong: 2,
      distribution: [
        { answer: 0, count: 1, correct: false },
        { answer: 1, count: 4, correct: true },
        { answer: 2, count: 3, correct: false },
        { answer: 3, count: 0, correct: false },
      ],
    });
  });
  it('TRUE_FALSE always lists both; no responses → 0 %', () => {
    const s = summarizeRound({ kind: 'TRUE_FALSE', options: [], correct: false, tolerance: null }, [], 2);
    expect(s).toEqual({
      round: 2,
      count: 0,
      percentCorrect: 0,
      sureWrong: 0,
      distribution: [
        { answer: true, count: 0, correct: false },
        { answer: false, count: 0, correct: true },
      ],
    });
  });
  it('NUMERIC: distinct values, most common first; tolerance marks near answers correct', () => {
    const s = summarizeRound(
      { kind: 'NUMERIC', options: [], correct: 43.04, tolerance: 0.1 },
      [43.04, 47.04, 43.04, 284, 43.1, 47.04, 43.04].map((answer) => ({ answer, confident: true })),
      1,
    );
    expect(s.distribution).toEqual([
      { answer: 43.04, count: 3, correct: true },
      { answer: 47.04, count: 2, correct: false },
      { answer: 43.1, count: 1, correct: true },
      { answer: 284, count: 1, correct: false },
    ]);
    expect(s.percentCorrect).toBe(57.1);
    expect(s.sureWrong).toBe(3);
  });
});

describe('answers on phones', () => {
  it('parses commas, Arabic-Indic digits and minus signs; rejects junk', () => {
    expect(parseNumericAnswer('43.04')).toBe(43.04);
    expect(parseNumericAnswer(' 43,04 ')).toBe(43.04);
    expect(parseNumericAnswer('٤٣٫٠٤')).toBe(43.04);
    expect(parseNumericAnswer('−2.5')).toBe(-2.5);
    expect(parseNumericAnswer('.5')).toBe(0.5);
    expect(parseNumericAnswer('1e3')).toBe(1000);
    expect(parseNumericAnswer('')).toBeNull();
    expect(parseNumericAnswer('12abc')).toBeNull();
    expect(parseNumericAnswer('1.2.3')).toBeNull();
    expect(parseNumericAnswer('1e99')).toBeNull();
  });
  it('labels answers', () => {
    expect(answerLabel('MCQ', ['r = 0.45', 'r = −0.92'], 1)).toBe('B · r = −0.92');
    expect(answerLabel('TRUE_FALSE', [], false)).toBe('False');
    expect(answerLabel('NUMERIC', [], 43.04)).toBe('43.04');
  });
});

describe('moderateAnswer (Explain answers, up to EXPLAIN_MAX)', () => {
  const long =
    'The slope b tells you how much y changes for each one-unit increase in x, in the units of y, ' +
    'while r only tells you how strong and in which direction the linear relationship is. '.repeat(4);
  it('accepts a long, clean answer (moderateQuestion would refuse it at 300 characters)', () => {
    expect(long.length).toBeGreaterThan(300);
    expect(moderateQuestion(long)).toEqual({ ok: false, reason: 'too_long' });
    expect(moderateAnswer(long, EXPLAIN_MAX)).toEqual({ ok: true, text: long.trim() });
  });
  it('still blocks the same words and characters; too long and empty are their own reasons', () => {
    expect(moderateAnswer(`${long} this is shit`, EXPLAIN_MAX)).toEqual({ ok: false, reason: 'blocked' });
    expect(moderateAnswer('nice 🙂', EXPLAIN_MAX)).toEqual({ ok: false, reason: 'blocked' });
    expect(moderateAnswer('x'.repeat(EXPLAIN_MAX + 1), EXPLAIN_MAX)).toEqual({
      ok: false,
      reason: 'too_long',
    });
    expect(moderateAnswer('   ', EXPLAIN_MAX)).toEqual({ ok: false, reason: 'empty' });
  });
});
