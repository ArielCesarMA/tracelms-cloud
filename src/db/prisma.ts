import { PrismaClient } from '@prisma/client';

// Singleton — one connection pool shared across all route handlers.
const prisma = new PrismaClient();

export default prisma;
