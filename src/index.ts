import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'jobtrackr-backend' });
});

// Fase 1: aquí construimos juntos las rutas de /auth y /applications

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`JobTrackr backend escuchando en http://localhost:${PORT}`);
});
