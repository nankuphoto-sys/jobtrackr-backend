import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';
import authRouter from './routes/auth';
import applicationsRouter from './routes/applications';
import { requireAuth } from './middleware/auth';

dotenv.config();

export const app = express();
// En dev no hay FRONTEND_URL seteada, así que acepta cualquier origen (igual
// que antes). En producción se restringe al dominio real del frontend.
app.use(cors(process.env.FRONTEND_URL ? { origin: process.env.FRONTEND_URL } : undefined));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'jobtrackr-backend' });
});

app.use('/auth', authRouter);
app.use('/applications', requireAuth, applicationsRouter);

// Debe ir después de las rutas, y antes de cualquier otro middleware de errores.
// No hace nada si Sentry.init() no corrió antes (ej. en los tests).
Sentry.setupExpressErrorHandler(app);
