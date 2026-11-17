import type { Activity } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { NO_RESULTS, toPresentActivity, toStudentActivity } from '../src/realtime/dto';

const base: Activity = {
  id: '00000000-0000-4000-8000-0000000000aa',
  sessionId: '00000000-0000-4000-8000-0000000000bb',
  type: 'QUICK_CHECK',
  kind: 'MCQ',
  prompt: 'Which r is strongest?',
  options: ['0.45', '-0.92'],
  correct: 1,
  tolerance: null,
  explanation: 'Size of r, ignoring the sign.',
  modelAnswer: null,
  status: 'LIVE',
  round: 1,
  position: 1,
  closesAt: null,
  createdAt: new Date(),
};

describe('toStudentActivity (rule 3: no answer leaks)', () => {
  it.each(['DRAFT', 'LIVE', 'CLOSED'] as const)(
    '%s Quick Check has no correct / explanation / tolerance keys',
    (status) => {
      const dto = toStudentActivity({ ...base, status });
      for (const key of ['correct', 'explanation', 'tolerance', 'modelAnswer'])
        expect(dto).not.toHaveProperty(key);
      expect(JSON.stringify(dto)).not.toContain('ignoring the sign');
    },
  );

  it('REVEALED Quick Check has them', () => {
    const dto = toStudentActivity({ ...base, status: 'REVEALED' });
    expect(dto).toMatchObject({ correct: 1, explanation: 'Size of r, ignoring the sign.', tolerance: null });
  });

  it('numeric tolerance only after reveal', () => {
    const numeric = { ...base, kind: 'NUMERIC' as const, options: [], correct: 43.04, tolerance: 0.1 };
    expect(toStudentActivity(numeric)).not.toHaveProperty('tolerance');
    expect(toStudentActivity({ ...numeric, status: 'REVEALED' })).toMatchObject({
      correct: 43.04,
      tolerance: 0.1,
    });
  });

  it('Explain never has modelAnswer, in any status', () => {
    for (const status of ['LIVE', 'CLOSED', 'REVEALED'] as const) {
      const dto = toStudentActivity({
        ...base,
        type: 'EXPLAIN',
        kind: null,
        options: [],
        correct: null,
        explanation: null,
        modelAnswer: 'SECRET model answer',
        status,
      });
      expect(dto).not.toHaveProperty('modelAnswer');
      expect(JSON.stringify(dto)).not.toContain('SECRET');
    }
  });

  it('projector DTO never has modelAnswer', () => {
    expect(toPresentActivity({ ...base, modelAnswer: 'SECRET' }, NO_RESULTS)).not.toHaveProperty(
      'modelAnswer',
    );
  });
});
