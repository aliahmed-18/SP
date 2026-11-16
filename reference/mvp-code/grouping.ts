import { z } from "zod";

export const groupTitleSchema = z.string().trim().min(1).max(100)
  .refine((title) => title.split(/\s+/u).length <= 4, "Use 1–4 words");
export const classificationSchema = z.object({
  assignments: z.array(z.object({
    questionId: z.string().uuid(), groupId: z.string().uuid().nullable(), newGroupTitle: groupTitleSchema.nullable(),
  }).refine((item) => !(item.groupId && item.newGroupTitle), "Choose an existing or new group")),
  flagged: z.array(z.object({ questionId: z.string().uuid(), reason: z.enum(["toxic", "off_topic"]) })),
});
export type Classification = z.infer<typeof classificationSchema>;
export type Group = { id: string; title: string; me_too_count: number; status: string; reply: string | null; division_id: string | null };
export type GroupQuestion = { id: string; text: string; group_id: string | null; division_id: string | null; satisfied: boolean; created_at: string };
export type Division = { id: string; label: string; question_count: number; flagged_count: number };

export function validateClassification(draft: Classification, questions: { id: string; text: string }[], groups: { id: string }[], academic: boolean): Classification {
  const qids = new Set(questions.map((q) => q.id));
  const gids = new Set(groups.map((g) => g.id));
  const seen = new Set<string>();
  for (const item of [...draft.assignments, ...draft.flagged]) {
    if (!qids.has(item.questionId) || seen.has(item.questionId)) throw new Error("Invalid question assignment");
    seen.add(item.questionId);
  }
  for (const item of draft.assignments) {
    if (item.groupId && !gids.has(item.groupId)) throw new Error("Invalid group assignment");
    if (item.newGroupTitle && questions.some((q) => q.text.trim().toLowerCase() === item.newGroupTitle?.toLowerCase())) {
      throw new Error("Group titles must describe a concept, not quote a student");
    }
  }
  return { assignments: draft.assignments, flagged: draft.flagged.filter((q) => academic || q.reason !== "off_topic") };
}

/** Repairs AI grouping output: drops unknown/duplicate ids, trims long titles, never fails the whole draft for one slip. */
export function repairClassification(raw: unknown, questions: { id: string; text: string }[], groups: { id: string }[], academic: boolean): Classification {
  const r = (raw && typeof raw === "object" ? raw : {}) as { assignments?: unknown; flagged?: unknown };
  const qids = new Set(questions.map((q) => q.id)), gids = new Set(groups.map((g) => g.id)), seen = new Set<string>();
  const texts = new Set(questions.map((q) => q.text.trim().toLowerCase()));
  const flagged: Classification["flagged"] = [];
  for (const f of Array.isArray(r.flagged) ? r.flagged : []) {
    const id = (f as { questionId?: unknown })?.questionId, reason = (f as { reason?: unknown })?.reason;
    if (typeof id !== "string" || !qids.has(id) || seen.has(id) || (reason !== "toxic" && reason !== "off_topic")) continue;
    if (reason === "off_topic" && !academic) continue;
    seen.add(id); flagged.push({ questionId: id, reason });
  }
  const assignments: Classification["assignments"] = [];
  for (const a of Array.isArray(r.assignments) ? r.assignments : []) {
    const o = (a ?? {}) as { questionId?: unknown; groupId?: unknown; newGroupTitle?: unknown };
    if (typeof o.questionId !== "string" || !qids.has(o.questionId) || seen.has(o.questionId)) continue;
    seen.add(o.questionId);
    const groupId = typeof o.groupId === "string" && gids.has(o.groupId) ? o.groupId : null;
    let title = !groupId && typeof o.newGroupTitle === "string" ? o.newGroupTitle.trim().split(/\s+/u).slice(0, 4).join(" ").slice(0, 100) : null;
    if (title && texts.has(title.toLowerCase())) title = null;
    assignments.push({ questionId: o.questionId, groupId, newGroupTitle: title || null });
  }
  return validateClassification({ assignments, flagged }, questions, groups, academic);
}

export function sortGroups<T extends { id: string; me_too_count: number }>(groups: T[], questions: { group_id: string | null }[]) {
  const counts = new Map<string, number>();
  questions.forEach((q) => { if (q.group_id) counts.set(q.group_id, (counts.get(q.group_id) ?? 0) + 1); });
  return [...groups].sort((a, b) => b.me_too_count - a.me_too_count || (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
}
const cell = (value: string) => {
  const cleaned = value.replace(/[\t\r\n]+/g, " ").trim();
  // Spreadsheet exports must not interpret student text as a formula.
  return /^[=+\-@]/u.test(cleaned) ? `'${cleaned}` : cleaned;
};
export function exportQuestionsTsv(groups: Group[], questions: GroupQuestion[], divisions: Division[], unclassified = "Unclassified", partLabel = "Part") {
  const parts = [...divisions.map((d) => ({ id: d.id as string | null, label: d.label })), { id: null, label: `Part ${divisions.length + 1}` }];
  const ordered = parts.flatMap((part) => sortGroups(groups.filter((g) => g.division_id === part.id), questions.filter((q) => q.division_id === part.id)));
  const headers = [...(divisions.length ? [partLabel] : []), ...ordered.map((g) => cell(g.title)), unclassified];
  const rows: string[][] = [];
  for (const part of parts) {
    const qs = questions.filter((q) => q.division_id === part.id);
    const columns = [...ordered.map((g) => qs.filter((q) => q.group_id === g.id).map((q) => cell(q.text))), qs.filter((q) => !q.group_id).map((q) => cell(q.text))];
    for (let i = 0; i < Math.max(0, ...columns.map((c) => c.length)); i++) {
      rows.push([...(divisions.length ? [part.label] : []), ...columns.map((c) => c[i] ?? "-")]);
    }
  }
  return [headers, ...rows].map((row) => row.join("\t")).join("\n");
}