import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

function signToken(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_SECRET as string, { expiresIn: '7d' });
}

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email y password son requeridos' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  if (name !== undefined && typeof name !== 'string') {
    return res.status(400).json({ error: 'name debe ser un texto' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, password: hashed, name: name || null } });

  const token = signToken(user.id);
  res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email y password son requeridos' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = signToken(user.id);
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }
  res.json({ id: user.id, email: user.email, name: user.name, createdAt: user.createdAt });
});

router.put('/me', requireAuth, async (req, res) => {
  const { name } = req.body ?? {};

  if (name !== undefined && typeof name !== 'string') {
    return res.status(400).json({ error: 'name debe ser un texto' });
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { name: name === '' ? null : name },
  });

  res.json({ id: user.id, email: user.email, name: user.name, createdAt: user.createdAt });
});

router.put('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'currentPassword y newPassword son requeridos' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

  res.status(204).send();
});

router.delete('/me', requireAuth, async (req, res) => {
  const { password } = req.body ?? {};

  if (typeof password !== 'string') {
    return res.status(400).json({ error: 'password es requerido para confirmar' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'La contraseña no es correcta' });
  }

  // onDelete: Cascade en el schema se encarga de borrar sus postulaciones
  // (y el historial de estado de esas postulaciones).
  await prisma.user.delete({ where: { id: user.id } });
  res.status(204).send();
});

export default router;
