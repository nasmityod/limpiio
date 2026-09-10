import { defineConfig } from '@prisma/config';
import dotenv from 'dotenv';

// Carga las variables de entorno desde el archivo .env en la raíz
dotenv.config();

export default defineConfig({
  datasource: {
    // Prisma CLI (migrate deploy, etc.) usa conexión directa — nunca PgBouncer.
    // En prod: DIRECT_URL apunta a Postgres sin pooler. En CI/dev sin pooler, cae a DATABASE_URL.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
