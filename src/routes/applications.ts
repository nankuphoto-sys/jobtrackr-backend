import { Router, Request } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { calcularRecordatorio, zonaHorariaValida } from '../lib/recordatorios';

const router = Router();

const VALID_STATUSES = ['POR_APLICAR', 'APLICADO', 'ENTREVISTA', 'OFERTA', 'RECHAZADO'];

// Trae solo el último cambio de estado de cada postulación (no el historial
// entero) para los recordatorios del tablero.
const ultimoCambio = {
  statusChanges: { orderBy: { changedAt: 'desc' }, take: 1, select: { changedAt: true } },
} as const;

type ConUltimoCambio = {
  status: string;
  appliedAt: Date | null;
  createdAt: Date;
  lastFollowUpAt: Date | null;
  deadline: Date | null;
  statusChanges: { changedAt: Date }[];
};

/**
 * Agrega `statusChangedAt` (desde cuándo está en su estado actual) y `aviso`
 * (el recordatorio de hoy, o null), y quita el array de statusChanges. Las
 * postulaciones creadas antes de que existiera el historial no tienen ningún
 * cambio: se usa appliedAt o createdAt.
 */
function conFechaDeEstado<T extends ConUltimoCambio>(application: T, zonaHoraria: string) {
  const { statusChanges, ...resto } = application;
  const statusChangedAt = statusChanges[0]?.changedAt ?? application.appliedAt ?? application.createdAt;
  return {
    ...resto,
    statusChangedAt,
    aviso: calcularRecordatorio({ ...application, statusChangedAt }, new Date(), zonaHoraria),
  };
}

/** Zona horaria del usuario (header X-Timezone que manda el frontend). */
function zonaDe(req: Request): string {
  return zonaHorariaValida(req.get('X-Timezone'));
}

router.get('/', async (req, res) => {
  const applications = await prisma.jobApplication.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    include: ultimoCambio,
  });
  const zona = zonaDe(req);
  res.json(applications.map((a) => conFechaDeEstado(a, zona)));
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
    include: ultimoCambio,
  });
  if (!application) {
    return res.status(404).json({ error: 'Postulación no encontrada' });
  }
  res.json(conFechaDeEstado(application, zonaDe(req)));
});

// Campos de la oferta (los que completa el extractor o el usuario a mano).
// Todos opcionales; en PUT, un campo ausente no se toca y `null` lo borra.
const camposOferta = z
  .object({
    location: z.string().trim().max(200).nullable(),
    modality: z.enum(['remote', 'hybrid', 'onsite']).nullable(),
    seniority: z.enum(['junior', 'mid', 'senior']).nullable(),
    salaryMin: z.number().int().nonnegative().nullable(),
    salaryMax: z.number().int().nonnegative().nullable(),
    salaryCurrency: z.string().trim().max(10).nullable(),
    salaryPeriod: z.enum(['month', 'year', 'hour']).nullable(),
    stack: z.array(z.string().trim().min(1).max(60)).max(40),
    deadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/)
      // El formato solo no alcanza: "2026-13-45" pasaba y Prisma fallaba con 500.
      .refine((d) => !Number.isNaN(Date.parse(d)), 'fecha inválida')
      .transform((d) => new Date(d))
      .nullable(),
    summary: z.string().trim().max(1000).nullable(),
  })
  .partial();

function leerCamposOferta(body: unknown) {
  const r = camposOferta.safeParse(body ?? {});
  if (r.success) return { ok: true as const, data: r.data };
  const i = r.error.issues[0];
  return { ok: false as const, error: `${i.path.join('.')}: ${i.message}` };
}

router.post('/', async (req, res) => {
  const { company, role, status, link, notes, appliedAt } = req.body ?? {};

  if (typeof company !== 'string' || typeof role !== 'string') {
    return res.status(400).json({ error: 'company y role son requeridos' });
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status debe ser uno de: ${VALID_STATUSES.join(', ')}` });
  }
  const extra = leerCamposOferta(req.body);
  if (!extra.ok) return res.status(400).json({ error: extra.error });

  const application = await prisma.jobApplication.create({
    data: {
      company,
      role,
      status: status ?? 'POR_APLICAR',
      link: link ?? null,
      notes: notes ?? null,
      appliedAt: appliedAt ? new Date(appliedAt) : null,
      ...extra.data,
      userId: req.userId as string,
      statusChanges: {
        create: { fromStatus: null, toStatus: status ?? 'POR_APLICAR' },
      },
    },
    include: ultimoCambio,
  });

  res.status(201).json(conFechaDeEstado(application, zonaDe(req)));
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
  const extra = leerCamposOferta(req.body);
  if (!extra.ok) return res.status(400).json({ error: extra.error });

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
      ...extra.data,
      ...(statusChanged && {
        statusChanges: { create: { fromStatus: existing.status, toStatus: newStatus } },
      }),
    },
    include: ultimoCambio,
  });

  res.json(conFechaDeEstado(application, zonaDe(req)));
});

// "Hice seguimiento": reinicia el recordatorio sin cambiar el estado.
router.post('/:id/follow-up', async (req, res) => {
  const existing = await prisma.jobApplication.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'Postulación no encontrada' });
  }

  const application = await prisma.jobApplication.update({
    where: { id: existing.id },
    data: { lastFollowUpAt: new Date() },
    include: ultimoCambio,
  });
  res.json(conFechaDeEstado(application, zonaDe(req)));
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
