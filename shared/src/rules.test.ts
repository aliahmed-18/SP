import { describe, expect, it } from 'vitest';
import { questionsTsv, sortTopics, tsvCell } from './rules';

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
