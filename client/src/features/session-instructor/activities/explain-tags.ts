import type { ExplainTag } from '@getit/shared';

export const TAG_LABEL: Record<ExplainTag, string> = {
  CORRECT: 'Correct',
  PARTIAL: 'Partial',
  MISCONCEPTION: 'Misconception',
};
export const TAG_STYLE: Record<ExplainTag, string> = {
  CORRECT: 'border-correct bg-correct/10 text-correct',
  PARTIAL: 'border-primary bg-accent text-accent-foreground',
  MISCONCEPTION: 'border-attention bg-attention/15 text-attention-foreground dark:text-attention',
};
