import 'dotenv/config';
import app from './app';
import logger from './utils/logger';
import prisma from './db/prisma';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

async function main() {
  // Verify DB connection
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (err) {
    logger.error('Failed to connect to database', { error: err });
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`Route Optimization Service running on port ${PORT}`);
    logger.info(`Swagger UI: http://localhost:${PORT}/api-docs`);
    logger.info(`Health: http://localhost:${PORT}/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await prisma.$disconnect();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received');
    await prisma.$disconnect();
    server.close(() => process.exit(0));
  });
}

main().catch((err) => {
  logger.error('Fatal error during startup', { error: err });
  process.exit(1);
});
