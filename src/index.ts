import './instrument'; // debe cargarse antes que cualquier otro módulo (parchea Node para el auto-instrumentado)
import { app } from './app';

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`JobTrackr backend escuchando en http://localhost:${PORT}`);
});
