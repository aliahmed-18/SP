import { Hash, ListChecks, ToggleLeft } from 'lucide-react';
import type { QuickCheckKind } from '@getit/shared';

export const KIND_LABEL: Record<QuickCheckKind, string> = {
  MCQ: 'Multiple choice',
  TRUE_FALSE: 'True / False',
  NUMERIC: 'Write a number',
};

export const KIND_ICON: Record<QuickCheckKind, typeof ListChecks> = {
  MCQ: ListChecks,
  TRUE_FALSE: ToggleLeft,
  NUMERIC: Hash,
};
