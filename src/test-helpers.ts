import { prisma } from './lib/prisma';

export function uniqueEmail(prefix: string): string {
  return `${prefix}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@jobtrackr.dev`;
}

/** Borra usuarios de test y sus postulaciones (respeta la FK: applications antes que users). */
export async function cleanupTestUsers(emails: string[]) {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;
  await prisma.jobApplication.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
