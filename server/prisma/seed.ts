// Seed script (`npm run db:seed`). Phase 1: stub. Phase 2 adds the demo instructor
// (demo@getit.app / getit-demo-2026), the course, an ended session and activity templates.
import { prisma } from '../src/db';

async function main() {
  const instructors = await prisma.instructor.count();
  console.log(
    `[seed] Phase 1 stub — database reachable (${instructors} instructors). Demo data arrives in Phase 2.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
