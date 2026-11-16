import { Router } from 'express';
import {
  codeParamSchema,
  createTopicSchema,
  idParamSchema,
  moveQuestionsSchema,
  updateQuestionSchema,
  updateTopicSchema,
} from '@getit/shared';
import { instructorId, requireInstructor } from '../auth/middleware';
import { parse } from '../lib/validate';
import { emitHostSnapshot, emitStudentTopics, emitToHost, safeEmit } from '../realtime/broadcast';
import { toHostTopic } from '../realtime/dto';
import { ownedQuestion, ownedTopic } from '../services/qa-access';
import { removeQuestion, updateQuestion } from '../services/questions';
import { getHostSession } from '../services/sessions';
import { createPart, createTopic, deleteTopic, moveQuestionsToTopic, updateTopic } from '../services/topics';

// Instructor Q&A management (docs/03 §Q&A). Each write emits what changed (rule 8).
export const qaRouter = Router();
qaRouter.use(['/questions', '/topics'], requireInstructor);

qaRouter.patch('/questions/:id', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const patch = parse(updateQuestionSchema, req.body);
  const q = await ownedQuestion(instructorId(res), id);
  const result = await updateQuestion(q.sessionId, q.id, q.partId, patch);
  if (patch.topicId !== undefined) {
    safeEmit(emitHostSnapshot(q.sessionId));
    safeEmit(emitStudentTopics(q.sessionId));
  } else {
    emitToHost(q.sessionId, 'question:updated', result);
  }
  res.json(result.question);
});

qaRouter.delete('/questions/:id', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const q = await ownedQuestion(instructorId(res), id);
  const result = await removeQuestion(q.sessionId, q.id, q.partId);
  emitToHost(q.sessionId, 'question:removed', { ...result, questionId: q.id });
  if (q.topicId) safeEmit(emitStudentTopics(q.sessionId));
  res.status(204).end();
});

qaRouter.post('/sessions/:code/parts', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const s = await getHostSession(instructorId(res), code);
  const { part } = await createPart(s.id);
  safeEmit(emitHostSnapshot(s.id));
  res.status(201).json({ id: part.id, number: part.number });
});

qaRouter.post('/sessions/:code/topics', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const input = parse(createTopicSchema, req.body);
  const s = await getHostSession(instructorId(res), code);
  const { topic } = await createTopic(s.id, input.title, input.questionIds);
  safeEmit(emitHostSnapshot(s.id));
  safeEmit(emitStudentTopics(s.id));
  res.status(201).json(toHostTopic(topic));
});

qaRouter.patch('/topics/:id', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const input = parse(updateTopicSchema, req.body);
  const t = await ownedTopic(instructorId(res), id);
  const { topic } = await updateTopic(t.sessionId, t, input);
  safeEmit(emitHostSnapshot(t.sessionId));
  safeEmit(emitStudentTopics(t.sessionId));
  res.json(toHostTopic(topic));
});

qaRouter.post('/topics/:id/questions', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const { questionIds } = parse(moveQuestionsSchema, req.body);
  const t = await ownedTopic(instructorId(res), id);
  await moveQuestionsToTopic(t.sessionId, t.id, questionIds);
  safeEmit(emitHostSnapshot(t.sessionId));
  safeEmit(emitStudentTopics(t.sessionId));
  res.status(204).end();
});

qaRouter.delete('/topics/:id', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const t = await ownedTopic(instructorId(res), id);
  await deleteTopic(t.sessionId, t.id);
  safeEmit(emitHostSnapshot(t.sessionId));
  safeEmit(emitStudentTopics(t.sessionId));
  res.status(204).end();
});
