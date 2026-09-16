import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './routes/auth';
import applicationsRouter from './routes/applications';
import { requireAuth } from './middleware/auth';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'jobtrackr-backend' });
});

app.use('/auth', authRouter);
app.use('/applications', requireAuth, applicationsRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`JobTrackr backend escuchando en http://localhost:${PORT}`);
});
