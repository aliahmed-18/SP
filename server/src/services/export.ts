import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { answerLabel, suggestion, SUGGESTION_TEXT, type Answer, type RoundStats } from '@getit/shared';
import type { Activity, Session } from '@prisma/client';
import { prisma } from '../db';
import { asAnswer } from '../realtime/dto';
import { statsFor } from './activities';

/**
 * Excel export (spec G), branded like the rest of Getit: a "Summary" sheet first (logo, lecture details,
 * key numbers, Take-away, most-asked topics, Quick Check overview), then one sortable sheet per data set:
 * Questions, Topics, Quick Checks, Answers, Explain.
 *
 * Anonymous: device hashes are never selected. Every cell is a plain string/number/date — never a
 * formula, so a student question like =HYPERLINK(…) stays text.
 */

// Brand colours (brand/theme.css), as ARGB.
const C = {
  teal: 'FF0F766E',
  tealTint: 'FFE6F4F2',
  navy: 'FF1E293B',
  muted: 'FF64748B',
  line: 'FFE2E8F0',
  zebra: 'FFF8FAFC',
  white: 'FFFFFFFF',
  amber: 'FFF59E0B',
  amberTint: 'FFFEF3C7',
  amberText: 'FF92400E',
  blue: 'FF2563EB',
  blueTint: 'FFDBEAFE',
  redTint: 'FFFEE2E2',
  redText: 'FFB91C1C',
} as const;
const FONT = 'Calibri';
const KIND = { MCQ: 'Multiple choice', TRUE_FALSE: 'True / False', NUMERIC: 'Number' } as const;
const STATUS = { OPEN: 'Open', ANSWERED_IN_CLASS: 'Answered in class', REPLIED: 'Replied' } as const;
const TAG = { CORRECT: 'Correct', PARTIAL: 'Partial', MISCONCEPTION: 'Misconception' } as const;
const TAG_FILL = { CORRECT: C.blueTint, PARTIAL: C.tealTint, MISCONCEPTION: C.amberTint } as const;
const ANONYMOUS = 'Anonymous: no student names, devices or IP addresses are recorded.';

const LOGO = fileURLToPath(new URL('../../../brand/png/logo-teal-transparent.png', import.meta.url));
let logo: Buffer | null | undefined;
/** The brand logo (1200 × 454), read once; the export still works without it. */
function logoPng(): Buffer | null {
  if (logo === undefined) logo = existsSync(LOGO) ? readFileSync(LOGO) : null;
  return logo;
}

const ARABIC = /[؀-ۿݐ-ݿ]/;
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin' as const, color: { argb: C.line } };
const dateFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Right-to-left reading for Arabic text (student questions may be Arabic). */
function direction(cell: ExcelJS.Cell) {
  if (typeof cell.value === 'string' && ARABIC.test(cell.value))
    cell.alignment = { ...cell.alignment, readingOrder: 'rtl', horizontal: 'right' };
}

type Col = { header: string; key: string; width: number; numFmt?: string; center?: boolean };

/** A data sheet: branded header row, filters, frozen header, zebra rows, wrapped text, print setup. */
function dataSheet(wb: ExcelJS.Workbook, name: string, columns: Col[]) {
  const ws = wb.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: C.teal } },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    headerFooter: { oddFooter: `&L&8Getit · ${name}&R&8Page &P of &N` },
  });
  ws.columns = columns.map(({ header, key, width }) => ({ header, key, width }));
  const head = ws.getRow(1);
  head.height = 24;
  head.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.teal);
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { bottom: thin };
  });
  return {
    ws,
    add(values: Record<string, unknown>, rowFill?: string) {
      const row = ws.addRow(values);
      const zebra = row.number % 2 === 1;
      row.eachCell({ includeEmpty: true }, (cell, i) => {
        const col = columns[i - 1];
        cell.font = { name: FONT, color: { argb: C.navy } };
        cell.alignment = {
          vertical: 'top',
          wrapText: true,
          ...(col?.center ? { horizontal: 'center' } : {}),
        };
        if (col?.numFmt) cell.numFmt = col.numFmt;
        cell.border = { bottom: thin };
        if (rowFill) cell.fill = fill(rowFill);
        else if (zebra) cell.fill = fill(C.zebra);
        direction(cell);
      });
      return row;
    },
    finish() {
      if (ws.rowCount > 1)
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
      else {
        const row = ws.addRow([`Nothing here for this session.`]);
        row.getCell(1).font = { name: FONT, italic: true, color: { argb: C.muted } };
      }
    },
  };
}

/** % correct → the same colours the projector uses (re-explain / discuss / move on). */
function scoreFill(pct: number) {
  const s = suggestion(pct);
  return s === 'reExplain'
    ? { fill: C.redTint, font: C.redText }
    : s === 'discuss'
      ? { fill: C.amberTint, font: C.amberText }
      : { fill: C.blueTint, font: C.blue };
}

function duration(from: Date, to: Date | null) {
  if (!to) return null;
  const min = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

export async function buildWorkbook(s: Session): Promise<ExcelJS.Workbook> {
  const [owner, course, parts, questions, topics, activities, joined, takeaway] = await Promise.all([
    prisma.instructor.findUnique({ where: { id: s.instructorId }, select: { name: true } }),
    s.courseId ? prisma.course.findUnique({ where: { id: s.courseId }, select: { name: true } }) : null,
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
    prisma.participant.count({ where: { sessionId: s.id } }),
    prisma.takeaway.findUnique({ where: { sessionId: s.id } }),
  ]);
  const partNo = new Map(parts.map((p) => [p.id, p.number]));
  const topicTitle = new Map(topics.map((t) => [t.id, t.title]));
  const checks: { a: Activity; stats: RoundStats[] }[] = [];
  for (const a of activities.filter((x) => x.type === 'QUICK_CHECK' && x.status !== 'DRAFT'))
    checks.push({ a, stats: await statsFor(a) });
  const explains = await Promise.all(
    activities
      .filter((x) => x.type === 'EXPLAIN' && x.status !== 'DRAFT')
      .map(async (a) => ({
        a,
        rows: await prisma.response.findMany({
          where: { activityId: a.id, text: { not: null } },
          orderBy: { createdAt: 'asc' },
          select: { text: true, tag: true },
        }),
      })),
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Getit';
  wb.title = `Getit results — ${s.topic}`;
  wb.subject = 'Lecture results';
  wb.created = new Date();

  summarySheet(wb, s, {
    owner: owner?.name ?? null,
    course: course?.name ?? null,
    joined,
    questions: questions.length,
    topics,
    checks,
    explains,
    activitiesRun: activities.filter((a) => a.status !== 'DRAFT').length,
    takeaway: takeaway
      ? {
          published: takeaway.status === 'PUBLISHED',
          publishedAt: takeaway.publishedAt,
          keyPoints: (Array.isArray(takeaway.keyPoints) ? takeaway.keyPoints : []).filter(
            (k): k is string => typeof k === 'string' && k.trim() !== '',
          ),
        }
      : null,
  });

  const q = dataSheet(wb, 'Questions', [
    { header: 'Part', key: 'part', width: 7, center: true },
    { header: 'Time', key: 'time', width: 17, numFmt: 'yyyy-mm-dd hh:mm' },
    { header: 'Question', key: 'text', width: 70 },
    { header: 'Topic', key: 'topic', width: 30 },
    { header: 'Addressed', key: 'addressed', width: 11, center: true },
  ]);
  for (const x of questions)
    q.add({
      part: partNo.get(x.partId) ?? 1,
      time: x.createdAt,
      text: x.text,
      topic: x.topicId ? (topicTitle.get(x.topicId) ?? '') : '',
      addressed: x.addressed ? 'Yes' : 'No',
    });
  q.finish();

  const t = dataSheet(wb, 'Topics', [
    { header: 'Topic', key: 'title', width: 36 },
    { header: 'Me too', key: 'meToo', width: 9, center: true },
    { header: 'Questions', key: 'questions', width: 11, center: true },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Reply', key: 'reply', width: 70 },
  ]);
  for (const x of topics)
    t.add({
      title: x.title,
      meToo: x.meTooCount,
      questions: x._count.questions,
      status: STATUS[x.status],
      reply: x.reply ?? '',
    });
  t.finish();

  const qc = dataSheet(wb, 'Quick Checks', [
    { header: 'Question', key: 'prompt', width: 56 },
    { header: 'Type', key: 'kind', width: 16 },
    { header: 'Correct answer', key: 'correct', width: 24 },
    { header: 'Round', key: 'round', width: 8, center: true },
    { header: 'Responses', key: 'responses', width: 11, center: true },
    { header: '% correct', key: 'pct', width: 11, numFmt: '0%', center: true },
    { header: 'Sure and wrong', key: 'sureWrong', width: 15, center: true },
    { header: 'Distribution', key: 'dist', width: 50 },
    { header: 'Suggestion', key: 'suggestion', width: 30 },
  ]);
  const ans = dataSheet(wb, 'Answers', [
    { header: 'Question', key: 'prompt', width: 56 },
    { header: 'Round', key: 'round', width: 8, center: true },
    { header: 'Answer', key: 'answer', width: 36 },
    { header: 'Correct', key: 'correct', width: 10, center: true },
    { header: 'Responses', key: 'count', width: 11, center: true },
    { header: '% of responses', key: 'share', width: 15, numFmt: '0%', center: true },
  ]);
  for (const { a, stats } of checks) {
    const options = Array.isArray(a.options) ? (a.options as string[]) : [];
    const correct = asAnswer(a.correct);
    const label = (v: Answer) => answerLabel(a.kind, options, v);
    for (const r of stats) {
      const row = qc.add({
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
        suggestion: r.count ? SUGGESTION_TEXT[suggestion(r.percentCorrect)] : '',
      });
      if (r.count) {
        const sc = scoreFill(r.percentCorrect);
        const cell = row.getCell('pct');
        cell.fill = fill(sc.fill);
        cell.font = { name: FONT, bold: true, color: { argb: sc.font } };
      }
      for (const d of r.distribution) {
        const line = ans.add(
          {
            prompt: a.prompt,
            round: r.round,
            answer: label(d.answer),
            correct: d.correct ? '✓' : '',
            count: d.count,
            share: r.count ? d.count / r.count : 0,
          },
          d.correct ? C.blueTint : undefined,
        );
        if (d.correct) line.getCell('correct').font = { name: FONT, bold: true, color: { argb: C.blue } };
      }
    }
  }
  qc.finish();
  ans.finish();

  const ex = dataSheet(wb, 'Explain', [
    { header: 'Prompt', key: 'prompt', width: 46 },
    { header: 'Answer', key: 'text', width: 70 },
    { header: 'Tag', key: 'tag', width: 16, center: true },
  ]);
  for (const { a, rows } of explains)
    for (const r of rows) {
      const row = ex.add({ prompt: a.prompt, text: r.text, tag: r.tag ? TAG[r.tag] : '' });
      if (r.tag) row.getCell('tag').fill = fill(TAG_FILL[r.tag]);
    }
  ex.finish();
  return wb;
}

type SummaryData = {
  owner: string | null;
  course: string | null;
  joined: number;
  questions: number;
  topics: {
    title: string;
    meTooCount: number;
    status: keyof typeof STATUS;
    reply: string | null;
    _count: { questions: number };
  }[];
  checks: { a: Activity; stats: RoundStats[] }[];
  explains: { a: Activity; rows: { tag: keyof typeof TAG | null }[] }[];
  activitiesRun: number;
  takeaway: { published: boolean; publishedAt: Date | null; keyPoints: string[] } | null;
};

/** First sheet: what a professor reads first — like the PDF report, on one printable page. */
function summarySheet(wb: ExcelJS.Workbook, s: Session, d: SummaryData) {
  const ws = wb.addWorksheet('Summary', {
    properties: { tabColor: { argb: C.amber } },
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    headerFooter: { oddFooter: `&L&8${ANONYMOUS}&R&8Page &P of &N` },
  });
  ws.columns = [{ width: 50 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 32 }];
  const COLS = 6;
  let r = 1;
  const text = (
    value: string,
    opts: { size?: number; bold?: boolean; color?: string; merge?: boolean } = {},
  ) => {
    const row = ws.getRow(r++);
    const cell = row.getCell(1);
    cell.value = value;
    cell.font = { name: FONT, size: opts.size ?? 11, bold: opts.bold, color: { argb: opts.color ?? C.navy } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    direction(cell);
    if (opts.merge !== false) ws.mergeCells(row.number, 1, row.number, COLS);
    return row;
  };
  const section = (title: string) => {
    r++;
    const row = text(title, { size: 13, bold: true, color: C.teal });
    row.height = 22;
    for (let c = 1; c <= COLS; c++)
      ws.getRow(row.number).getCell(c).border = { bottom: { style: 'medium', color: { argb: C.teal } } };
  };
  const tableHead = (labels: string[]) => {
    const row = ws.getRow(r++);
    labels.forEach((l, i) => {
      const cell = row.getCell(i + 1);
      cell.value = l;
      cell.font = { name: FONT, bold: true, color: { argb: C.white } };
      cell.fill = fill(C.teal);
      cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center', wrapText: true };
    });
    row.height = 20;
  };
  const tableRow = (values: (string | number)[], i: number) => {
    const row = ws.getRow(r++);
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v;
      cell.font = { name: FONT, color: { argb: C.navy } };
      cell.alignment = {
        vertical: 'top',
        wrapText: true,
        horizontal: c === 0 || c === COLS - 1 ? 'left' : 'center',
      };
      cell.border = { bottom: thin };
      if (i % 2 === 1) cell.fill = fill(C.zebra);
      direction(cell);
    });
    return row;
  };

  // Header: logo + "Lecture results".
  const png = logoPng();
  if (png) {
    const id = wb.addImage({ buffer: png as never, extension: 'png' });
    ws.addImage(id, { tl: { col: 0.1, row: 0.2 }, ext: { width: 159, height: 60 } });
  }
  for (let i = 1; i <= 3; i++) ws.getRow(i).height = 18;
  const tag = ws.getRow(2).getCell(COLS);
  tag.value = 'Lecture results';
  tag.font = { name: FONT, size: 12, bold: true, color: { argb: C.muted } };
  tag.alignment = { horizontal: 'right', vertical: 'middle' };
  r = 5;

  // Lecture details.
  text(s.topic, { size: 20, bold: true }).height = 30;
  const who = [d.course, d.owner].filter(Boolean).join(' · ');
  if (who) text(who, { color: C.muted });
  const len = duration(s.startedAt, s.endedAt);
  text(
    `${dateFmt.format(s.startedAt)} · ${timeFmt.format(s.startedAt)}` +
      (s.endedAt ? ` – ${timeFmt.format(s.endedAt)}` : '') +
      (len ? ` (${len})` : '') +
      ` · Code ${s.code} · ${s.status === 'ENDED' ? 'Ended' : 'Live'}`,
    { color: C.muted },
  );

  // Key numbers as tiles.
  section('At a glance');
  const scored = d.checks.map((c) => c.stats.at(-1)).filter((x): x is RoundStats => !!x && x.count > 0);
  const avg = scored.length ? scored.reduce((n, x) => n + x.percentCorrect, 0) / scored.length / 100 : null;
  const tiles: [string, number | string, string?][] = [
    ['Students joined', d.joined],
    ['Questions asked', d.questions],
    ['Topics', d.topics.length],
    ['Activities run', d.activitiesRun],
    ['Average correct', avg ?? '—', avg === null ? undefined : '0%'],
    ['Flagged (hidden)', s.flaggedCount],
  ];
  const labels = ws.getRow(r++);
  const values = ws.getRow(r++);
  values.height = 34;
  tiles.forEach(([label, value, fmt], i) => {
    const l = labels.getCell(i + 1);
    l.value = label;
    l.font = { name: FONT, size: 9, color: { argb: C.muted } };
    l.fill = fill(C.tealTint);
    l.alignment = { horizontal: 'center' };
    const v = values.getCell(i + 1);
    v.value = value;
    if (fmt) v.numFmt = fmt;
    v.font = { name: FONT, size: 20, bold: true, color: { argb: C.teal } };
    v.fill = fill(C.tealTint);
    v.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Take-away.
  section('Take-away');
  if (!d.takeaway || d.takeaway.keyPoints.length === 0) text('No Take-away was written.', { color: C.muted });
  else {
    text(
      d.takeaway.published
        ? `Published to students${d.takeaway.publishedAt ? ` · ${timeFmt.format(d.takeaway.publishedAt)}` : ''}`
        : 'Draft — not published to students',
      { color: C.muted, size: 10 },
    );
    d.takeaway.keyPoints.forEach((k, i) => text(`${i + 1}.  ${k}`));
  }

  // Most asked.
  section('What the class asked most');
  if (d.topics.length === 0) text('No topics in this session.', { color: C.muted });
  else {
    tableHead(['Topic', 'Me too', 'Questions', 'Status', '', 'Reply']);
    d.topics
      .slice(0, 5)
      .forEach((t, i) =>
        tableRow([t.title, t.meTooCount, t._count.questions, STATUS[t.status], '', t.reply ?? ''], i),
      );
  }

  // Quick Checks.
  section('Quick Checks');
  if (d.checks.length === 0) text('No Quick Checks were run.', { color: C.muted });
  else {
    tableHead(['Question', 'Responses', '% correct', 'Sure & wrong', 'Rounds', 'Suggestion']);
    d.checks.forEach(({ a, stats }, i) => {
      const last = stats.at(-1);
      const rounds =
        stats.length > 1
          ? stats.map((x) => `${Math.round(x.percentCorrect)}%`).join(' → ')
          : String(stats.length);
      const row = tableRow(
        [
          `Q${i + 1}. ${a.prompt}`,
          last?.count ?? 0,
          last && last.count ? last.percentCorrect / 100 : '—',
          last?.sureWrong ?? 0,
          rounds,
          last && last.count ? SUGGESTION_TEXT[suggestion(last.percentCorrect)] : 'No answers',
        ],
        i,
      );
      if (last && last.count) {
        const cell = row.getCell(3);
        const sc = scoreFill(last.percentCorrect);
        cell.numFmt = '0%';
        cell.fill = fill(sc.fill);
        cell.font = { name: FONT, bold: true, color: { argb: sc.font } };
      }
    });
  }

  // Explain.
  if (d.explains.length) {
    section('Explain');
    tableHead(['Prompt', 'Answers', 'Correct', 'Partial', 'Misconception', '']);
    d.explains.forEach(({ a, rows }, i) => {
      const n = (t: keyof typeof TAG) => rows.filter((x) => x.tag === t).length;
      const row = tableRow([a.prompt, rows.length, n('CORRECT'), n('PARTIAL'), n('MISCONCEPTION'), ''], i);
      if (n('MISCONCEPTION')) row.getCell(5).fill = fill(C.amberTint);
    });
  }

  r++;
  text(`${ANONYMOUS} Details are in the other sheets. Made with Getit.`, { size: 9, color: C.muted });
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
