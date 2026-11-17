import ExcelJS from 'exceljs';
import { answerLabel, type Answer } from '@getit/shared';
import type { Session } from '@prisma/client';
import { prisma } from '../db';
import { asAnswer } from '../realtime/dto';
import { statsFor } from './activities';

/**
 * Excel export (spec G). Sheets: Questions, Topics, Quick Checks, Explain. No identities: device hashes
 * are never selected. Cells are written as plain strings/numbers, never formulas.
 */
export async function buildWorkbook(s: Session): Promise<ExcelJS.Workbook> {
  const [parts, questions, topics, activities] = await Promise.all([
    prisma.part.findMany({ where: { sessionId: s.id } }),
    prisma.question.findMany({
      where: { sessionId: s.id },
      orderBy: { createdAt: 'asc' },
      select: { text: true, createdAt: true, addressed: true, partId: true, topicId: true },
    }),
    prisma.topic.findMany({
      where: { sessionId: s.id },
      orderBy: [{ meTooCount: 'desc' }, { createdAt: 'asc' }],
      include: { _count: { select: { questions: true } } },
    }),
    prisma.activity.findMany({ where: { sessionId: s.id }, orderBy: { position: 'asc' } }),
  ]);
  const partNo = new Map(parts.map((p) => [p.id, p.number]));
  const topicTitle = new Map(topics.map((t) => [t.id, t.title]));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Getit';
  wb.created = new Date();
  const sheet = (name: string, columns: { header: string; key: string; width: number }[]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columns;
    ws.getRow(1).font = { bold: true };
    return ws;
  };

  const q = sheet('Questions', [
    { header: 'Part', key: 'part', width: 8 },
    { header: 'Time', key: 'time', width: 18 },
    { header: 'Question', key: 'text', width: 70 },
    { header: 'Topic', key: 'topic', width: 30 },
    { header: 'Addressed', key: 'addressed', width: 11 },
  ]);
  for (const x of questions) {
    q.addRow({
      part: partNo.get(x.partId) ?? 1,
      time: x.createdAt,
      text: x.text,
      topic: x.topicId ? (topicTitle.get(x.topicId) ?? '') : '',
      addressed: x.addressed ? 'Yes' : 'No',
    });
  }
  q.getColumn('time').numFmt = 'yyyy-mm-dd hh:mm';

  const t = sheet('Topics', [
    { header: 'Topic', key: 'title', width: 36 },
    { header: 'Me too', key: 'meToo', width: 9 },
    { header: 'Questions', key: 'questions', width: 11 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Reply', key: 'reply', width: 70 },
  ]);
  const STATUS = { OPEN: 'Open', ANSWERED_IN_CLASS: 'Answered in class', REPLIED: 'Replied' } as const;
  for (const x of topics) {
    t.addRow({
      title: x.title,
      meToo: x.meTooCount,
      questions: x._count.questions,
      status: STATUS[x.status],
      reply: x.reply ?? '',
    });
  }

  const qc = sheet('Quick Checks', [
    { header: 'Question', key: 'prompt', width: 60 },
    { header: 'Type', key: 'kind', width: 16 },
    { header: 'Correct answer', key: 'correct', width: 22 },
    { header: 'Round', key: 'round', width: 8 },
    { header: 'Responses', key: 'responses', width: 11 },
    { header: '% correct', key: 'pct', width: 10 },
    { header: 'Sure and wrong', key: 'sureWrong', width: 15 },
    { header: 'Distribution', key: 'dist', width: 60 },
  ]);
  const KIND = { MCQ: 'Multiple choice', TRUE_FALSE: 'True / False', NUMERIC: 'Number' } as const;
  for (const a of activities.filter((x) => x.type === 'QUICK_CHECK' && x.status !== 'DRAFT')) {
    const options = Array.isArray(a.options) ? (a.options as string[]) : [];
    const correct = asAnswer(a.correct);
    const label = (v: Answer) => answerLabel(a.kind, options, v);
    for (const r of await statsFor(a)) {
      qc.addRow({
        prompt: a.prompt,
        kind: a.kind ? KIND[a.kind] : '',
        correct:
          correct === null
            ? ''
            : label(correct) + (a.kind === 'NUMERIC' && a.tolerance ? ` ± ${a.tolerance}` : ''),
        round: r.round,
        responses: r.count,
        pct: r.percentCorrect / 100,
        sureWrong: r.sureWrong,
        dist: r.distribution.map((d) => `${label(d.answer)}: ${d.count}`).join('; '),
      });
    }
  }
  qc.getColumn('pct').numFmt = '0%';

  const ex = sheet('Explain', [
    { header: 'Prompt', key: 'prompt', width: 50 },
    { header: 'Answer', key: 'text', width: 70 },
    { header: 'Tag', key: 'tag', width: 16 },
  ]);
  const TAG = { CORRECT: 'Correct', PARTIAL: 'Partial', MISCONCEPTION: 'Misconception' } as const;
  for (const a of activities.filter((x) => x.type === 'EXPLAIN')) {
    const rows = await prisma.response.findMany({
      where: { activityId: a.id, text: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { text: true, tag: true },
    });
    for (const r of rows) ex.addRow({ prompt: a.prompt, text: r.text, tag: r.tag ? TAG[r.tag] : '' });
  }
  return wb;
}

/** "getit-linear-regression-2026-11-16.xlsx" */
export function exportFileName(s: Session) {
  const slug = s.topic
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 40);
  return `getit-${slug || 'session'}-${s.startedAt.toISOString().slice(0, 10)}.xlsx`;
}
