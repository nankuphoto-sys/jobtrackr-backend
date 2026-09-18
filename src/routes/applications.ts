import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

const VALID_STATUSES = ['POR_APLICAR', 'APLICADO', 'ENTREVISTA', 'OFERTA', 'RECHAZADO'];

router.get('/', async (req, res) => {
  const applications = await prisma.jobApplication.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(applications);
});

// Alimenta el embudo de conversión y el tiempo promedio por estado en /account
// (Reportes). Va antes de '/:id' para que "status-history" no se confunda con un id.
router.get('/status-history', async (req, res) => {
  const changes = await prisma.statusChange.findMany({
    where: { application: { userId: req.userId } },
    orderBy: { changedAt: 'asc' },
  });
  res.json(changes);
});

router.get('/:id', async (req, res) => {
  const application = await prisma.jobApplication.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!application) {
    return res.status(404).json({ error: 'Postulación no encontrada' });
  }
  res.json(application);
});

router.post('/', async (req, res) => {
  const { company, role, status, link, notes, appliedAt } = req.body ?? {};

  if (typeof company !== 'string' || typeof role !== 'string') {
    return res.status(400).json({ error: 'company y role son requeridos' });
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status debe ser uno de: ${VALID_STATUSES.join(', ')}` });
  }

  const application = await prisma.jobApplication.create({
    data: {
      company,
      role,
      status: status ?? 'POR_APLICAR',
      link: link ?? null,
      notes: notes ?? null,
      appliedAt: appliedAt ? new Date(appliedAt) : null,
      userId: req.userId as string,
      statusChanges: {
        create: { fromStatus: null, toStatus: status ?? 'POR_APLICAR' },
      },
    },
  });

  res.status(201).json(application);
});

router.put('/:id', async (req, res) => {
  const existing = await prisma.jobApplication.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'Postulación no encontrada' });
  }

  const { company, role, status, link, notes, appliedAt } = req.body ?? {};

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status debe ser uno de: ${VALID_STATUSES.join(', ')}` });
  }

  const newStatus = status ?? existing.status;
  const statusChanged = newStatus !== existing.status;

  const application = await prisma.jobApplication.update({
    where: { id: existing.id },
    data: {
      company: company ?? existing.company,
      role: role ?? existing.role,
      status: newStatus,
      link: link !== undefined ? link : existing.link,
      notes: notes !== undefined ? notes : existing.notes,
      appliedAt: appliedAt !== undefined ? (appliedAt ? new Date(appliedAt) : null) : existing.appliedAt,
      ...(statusChanged && {
        statusChanges: { create: { fromStatus: existing.status, toStatus: newStatus } },
      }),
    },
  });

  res.json(application);
});

router.delete('/:id', async (req, res) => {
  const existing = await prisma.jobApplication.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'Postulación no encontrada' });
  }

  await prisma.jobApplication.delete({ where: { id: existing.id } });
  res.status(204).send();
});

export default router;
