import { Hash, ListChecks, MessageSquareText, ToggleLeft } from 'lucide-react';
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

/** Label + icon for any activity (Explain has no kind). */
export function activityKind(a: { type: string; kind: QuickCheckKind | null }) {
  if (a.type === 'EXPLAIN') return { label: 'Explain', Icon: MessageSquareText };
  const k = a.kind ?? 'MCQ';
  return { label: KIND_LABEL[k], Icon: KIND_ICON[k] };
}
