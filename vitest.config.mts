import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Cada test pega contra la base de datos real (Neon en dev, Postgres
    // efímero en CI) — más lento que mocks, pero es la misma filosofía que
    // ya se usó en los tests e2e del frontend: probar el mecanismo real.
    testTimeout: 15000,
    fileParallelism: false,
  },
});
