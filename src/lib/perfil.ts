// Perfil del usuario para el puntaje de encaje (fase 2 del extractor).
// Vive en `profile.json` (en .gitignore; plantilla en profile.example.json) y
// solo existe en la PC: en producción no hay archivo y el puntaje no aparece.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';

export const perfilSchema = z.object({
  stack: z.array(z.string().trim().min(1)).min(1).max(100),
  modality: z.array(z.enum(['remote', 'hybrid', 'onsite'])).max(3),
  seniority: z.enum(['junior', 'mid', 'senior']),
});

export type Perfil = z.infer<typeof perfilSchema>;

export class PerfilInvalido extends Error {}

export function rutaPerfil() {
  return resolve(process.env.PROFILE_PATH ?? 'profile.json');
}

/**
 * Lee el perfil en cada llamada (es un archivo chico): así un cambio en
 * profile.json se ve sin reiniciar el servidor. Devuelve null si no existe;
 * lanza PerfilInvalido si existe pero está mal escrito.
 */
export async function leerPerfil(): Promise<Perfil | null> {
  let crudo: string;
  try {
    crudo = await readFile(rutaPerfil(), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(crudo);
  } catch {
    throw new PerfilInvalido('profile.json no es JSON válido.');
  }
  const r = perfilSchema.safeParse(json);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new PerfilInvalido(`profile.json: ${i.path.join('.') || '(raíz)'}: ${i.message}`);
  }
  return r.data;
}
