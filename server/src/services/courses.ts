import type { CourseDto, CourseInput } from '@getit/shared';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';

const NOT_FOUND = () => new HttpError(404, 'NOT_FOUND', 'Course not found.');

export async function listCourses(instructorId: string): Promise<CourseDto[]> {
  const rows = await prisma.course.findMany({
    where: { instructorId },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { sessions: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    createdAt: c.createdAt.toISOString(),
    sessionCount: c._count.sessions,
  }));
}

export async function createCourse(instructorId: string, input: CourseInput): Promise<CourseDto> {
  const c = await prisma.course.create({ data: { instructorId, name: input.name } });
  return { id: c.id, name: c.name, createdAt: c.createdAt.toISOString(), sessionCount: 0 };
}

export async function renameCourse(instructorId: string, id: string, input: CourseInput): Promise<void> {
  const { count } = await prisma.course.updateMany({
    where: { id, instructorId },
    data: { name: input.name },
  });
  if (count === 0) throw NOT_FOUND();
}

/** Sessions keep existing with courseId = null (schema: onDelete SetNull). */
export async function deleteCourse(instructorId: string, id: string): Promise<void> {
  const { count } = await prisma.course.deleteMany({ where: { id, instructorId } });
  if (count === 0) throw NOT_FOUND();
}

export async function assertOwnsCourse(instructorId: string, id: string): Promise<void> {
  const found = await prisma.course.findFirst({ where: { id, instructorId }, select: { id: true } });
  if (!found) throw NOT_FOUND();
}
