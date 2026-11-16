// `npm run db:seed` — demo data for the presentation (docs/02 §Seed). Safe to run again:
// the demo instructor is upserted and only the seeded records (fixed ids) are recreated.
// Sessions the demo account created during rehearsals are left alone.
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db';

const DEMO = { name: 'Dr. Demo', email: 'demo@getit.app', password: 'getit-demo-2026' };
const ID = {
  course: '00000000-0000-4000-8000-000000000001',
  session: '00000000-0000-4000-8000-000000000002',
  part: '00000000-0000-4000-8000-000000000003',
};
const SEED_CODE = 'DEMO2'; // only ever ENDED, so it never blocks a live code

// Fake, clearly-seeded device hashes (no real device ever produces these).
const devices = Array.from({ length: 40 }, (_, i) =>
  createHash('sha256').update(`getit-seed-device-${i}`).digest('hex'),
);

const minutesAfter = (start: Date, min: number) => new Date(start.getTime() + min * 60_000);

async function main() {
  const passwordHash = await bcrypt.hash(DEMO.password, 10);
  const instructor = await prisma.instructor.upsert({
    where: { email: DEMO.email },
    create: { name: DEMO.name, email: DEMO.email, passwordHash },
    update: { name: DEMO.name, passwordHash },
  });

  await prisma.session.deleteMany({ where: { id: ID.session } }); // cascades its questions, topics, activities…
  await prisma.course.upsert({
    where: { id: ID.course },
    create: { id: ID.course, instructorId: instructor.id, name: 'ITCS 444 — Mobile Development' },
    update: { instructorId: instructor.id, name: 'ITCS 444 — Mobile Development' },
  });

  // Last week's lecture, 75 minutes.
  const startedAt = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  startedAt.setHours(10, 0, 0, 0);
  const endedAt = minutesAfter(startedAt, 75);

  await prisma.session.create({
    data: {
      id: ID.session,
      instructorId: instructor.id,
      courseId: ID.course,
      code: SEED_CODE,
      topic: 'Linear regression and correlation',
      academicMode: true,
      status: 'ENDED',
      flaggedCount: 1,
      version: 42,
      startedAt,
      endedAt,
      participants: {
        create: devices.slice(0, 38).map((deviceHash) => ({ deviceHash, joinedAt: startedAt })),
      },
      parts: { create: { id: ID.part, number: 1, flaggedCount: 1, createdAt: startedAt } },
    },
  });

  // ─── Topics + questions ─────────────────────────────────────────────────
  const topics = [
    {
      title: 'Computing the slope',
      status: 'REPLIED' as const,
      reply: 'Use b = Sxy / Sxx. Compute Sxy = Σxy − (Σx)(Σy)/n from the table first, then divide by Sxx.',
      meToo: 14,
      questions: [
        'Why does the slope become negative when price goes up?',
        'How do we get S_xy from the table?',
      ],
    },
    {
      title: 'Least squares idea',
      status: 'ANSWERED_IN_CLASS' as const,
      reply: null,
      meToo: 11,
      questions: ['Why do we square the errors instead of just adding them?'],
    },
    {
      title: 'r vs b',
      status: 'REPLIED' as const,
      reply:
        'r measures strength and direction without units; b is the change in y per unit of x, so it depends on units.',
      meToo: 9,
      questions: ['Is r the same thing as the slope?', 'ما الفرق بين معامل الارتباط والميل؟'],
    },
  ];
  let minute = 5;
  for (const [ti, t] of topics.entries()) {
    const topic = await prisma.topic.create({
      data: {
        sessionId: ID.session,
        partId: ID.part,
        title: t.title,
        status: t.status,
        reply: t.reply,
        meTooCount: t.meToo,
        createdAt: minutesAfter(startedAt, 20 + ti),
        meToos: { create: devices.slice(0, t.meToo).map((deviceHash) => ({ deviceHash })) },
      },
    });
    for (const text of t.questions) {
      await prisma.question.create({
        data: {
          sessionId: ID.session,
          partId: ID.part,
          topicId: topic.id,
          text,
          deviceHash: devices[minute % devices.length]!,
          addressed: true, // every seeded topic was answered
          createdAt: minutesAfter(startedAt, minute),
        },
      });
      minute += 4;
    }
  }
  await prisma.question.create({
    data: {
      sessionId: ID.session,
      partId: ID.part,
      text: 'Will the regression formulas be given in the exam?',
      deviceHash: devices[30]!,
      createdAt: minutesAfter(startedAt, 60),
    },
  });

  // ─── Activities (also the templates for a new live session) ──────────────
  const mcq = await prisma.activity.create({
    data: {
      sessionId: ID.session,
      type: 'QUICK_CHECK',
      kind: 'MCQ',
      prompt: 'Which value of r shows the strongest linear relationship?',
      options: ['r = 0.45', 'r = −0.92', 'r = 0.80', 'r = 0'],
      correct: 1,
      explanation: 'Strength is the size of r, ignoring the sign: |−0.92| is the largest.',
      status: 'REVEALED',
      round: 2,
      position: 1,
      createdAt: startedAt,
    },
  });
  const tf = await prisma.activity.create({
    data: {
      sessionId: ID.session,
      type: 'QUICK_CHECK',
      kind: 'TRUE_FALSE',
      prompt: 'A strong correlation between two variables proves that one causes the other.',
      correct: false,
      explanation: 'Correlation is not causation: a third variable or coincidence can link them.',
      status: 'REVEALED',
      position: 2,
      createdAt: startedAt,
    },
  });
  const numeric = await prisma.activity.create({
    data: {
      sessionId: ID.session,
      type: 'QUICK_CHECK',
      kind: 'NUMERIC',
      prompt: 'Using ŷ = 327.04 − 14.2x, what is ŷ when x = 20?',
      correct: 43.04,
      tolerance: 0.1,
      explanation: '327.04 − 14.2 × 20 = 327.04 − 284 = 43.04.',
      status: 'REVEALED',
      position: 3,
      createdAt: startedAt,
    },
  });
  const explain = await prisma.activity.create({
    data: {
      sessionId: ID.session,
      type: 'EXPLAIN',
      prompt: "In one sentence: what does the slope b tell you that r doesn't?",
      modelAnswer:
        'b gives the size of the change in y for each one-unit increase in x, in the units of y; r only gives strength and direction.',
      status: 'CLOSED',
      position: 4,
      createdAt: startedAt,
    },
  });

  // Responses: [answer, confident] pairs spread over devices.
  type R = { answer: number | boolean; confident: boolean | null };
  const spread = (groups: [number | boolean, number, number][]): R[] =>
    groups.flatMap(([answer, sure, notSure]) => [
      ...Array.from({ length: sure }, () => ({ answer, confident: true })),
      ...Array.from({ length: notSure }, () => ({ answer, confident: false })),
    ]);
  const responses: { activityId: string; round: number; rows: R[] }[] = [
    {
      activityId: mcq.id,
      round: 1,
      rows: spread([
        [0, 2, 2],
        [1, 15, 10],
        [2, 5, 5],
        [3, 0, 1],
      ]),
    }, // 62.5 %
    {
      activityId: mcq.id,
      round: 2,
      rows: spread([
        [0, 0, 1],
        [1, 28, 5],
        [2, 2, 2],
      ]),
    }, // 87.5 %
    {
      activityId: tf.id,
      round: 1,
      rows: spread([
        [false, 25, 6],
        [true, 3, 4],
      ]),
    },
    {
      activityId: numeric.id,
      round: 1,
      rows: spread([
        [43.04, 14, 4],
        [47.04, 5, 3],
        [284, 3, 2],
      ]),
    },
  ];
  for (const { activityId, round, rows } of responses) {
    await prisma.response.createMany({
      data: rows.map((r, i) => ({
        activityId,
        round,
        deviceHash: devices[i]!,
        answer: r.answer,
        confident: r.confident,
      })),
    });
  }
  const explainAnswers: [string, 'CORRECT' | 'PARTIAL' | 'MISCONCEPTION'][] = [
    ['b tells how much y changes when x goes up by one.', 'CORRECT'],
    ['The slope has units, r does not.', 'PARTIAL'],
    ['b shows how strong the relationship is, r shows the direction.', 'MISCONCEPTION'],
    ['b is the rate of change of y per unit of x.', 'CORRECT'],
    ['A bigger b means a stronger correlation.', 'MISCONCEPTION'],
  ];
  await prisma.response.createMany({
    data: explainAnswers.map(([text, tag], i) => ({
      activityId: explain.id,
      deviceHash: devices[i]!,
      text,
      tag,
    })),
  });

  // ─── Published Take-away ────────────────────────────────────────────────
  const topTopics = await prisma.topic.findMany({
    where: { sessionId: ID.session },
    orderBy: { meTooCount: 'desc' },
    select: { id: true },
  });
  await prisma.takeaway.create({
    data: {
      sessionId: ID.session,
      status: 'PUBLISHED',
      publishedAt: endedAt,
      keyPoints: [
        'The least-squares line minimises the squared vertical errors.',
        'The slope b is the change in y for each one-unit increase in x.',
        'r measures strength and direction, from −1 to 1, and has no units.',
        'Predict by substituting x into ŷ = a + bx; avoid predicting far outside the data.',
        'Correlation is not causation.',
      ],
      topTopicIds: topTopics.map((t) => t.id),
    },
  });

  console.log(`[seed] Demo instructor: ${DEMO.email} / ${DEMO.password}`);
  console.log(
    '[seed] Course "ITCS 444 — Mobile Development" with one ended lecture (questions, topics, results, Take-away).',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
