import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import apiRouter from './routes/index';
import prisma from './db/prisma';
import logger from './utils/logger';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

const app = express();

// Parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Swagger setup
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EMEC Route Optimization Service',
      version: '1.0.0',
      description:
        'Route optimization API using Google OR-Tools for VRP solving, OpenRouteService for road-level routing, and Leaflet.js for map display.',
    },
    servers: [{ url: '/' }],
    components: {
      schemas: {
        StopInput: {
          type: 'object',
          required: ['id', 'label', 'lat', 'lng', 'time_window_start', 'time_window_end', 'service_time_s'],
          properties: {
            id: { type: 'string', example: 'order-001' },
            label: { type: 'string', example: '12 Kemal Ataturk Ave, Banani' },
            lat: { type: 'number', example: 23.7946 },
            lng: { type: 'number', example: 90.405 },
            time_window_start: { type: 'string', example: '13:00' },
            time_window_end: { type: 'string', example: '15:00' },
            service_time_s: { type: 'integer', example: 180 },
          },
        },
        OptimizeRequest: {
          type: 'object',
          required: ['driver', 'stops'],
          properties: {
            driver: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'driver-001' },
                name: { type: 'string', example: 'Ahmed Hassan' },
                start_lat: { type: 'number', example: 23.8103 },
                start_lng: { type: 'number', example: 90.4125 }
              }
            },
            stops: {
              type: 'array',
              items: { $ref: '#/components/schemas/StopInput' },
              example: [
                {
                  id: "order-001",
                  label: "Banani",
                  lat: 23.7946,
                  lng: 90.4050,
                  time_window_start: "13:00",
                  time_window_end: "15:00",
                  service_time_s: 180
                },
                {
                  id: "order-002",
                  label: "Gulshan",
                  lat: 23.7808,
                  lng: 90.4147,
                  time_window_start: "14:00",
                  time_window_end: "16:30",
                  service_time_s: 120
                }
              ]
            },
            time_limit_ms: { type: 'integer', example: 5000 }
          }
        }
        
      },
    },
  },
  apis: ['./src/**/*.ts', './dist/**/*.js']
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

// Health check
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      db: 'connected',
      uptime_s: Math.floor(process.uptime()),
    });
  } catch {
    res.status(503).json({
      status: 'error',
      db: 'disconnected',
      uptime_s: Math.floor(process.uptime()),
    });
  }
});

// API routes
app.use('/api/v1', apiRouter);

// 404 fallback
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

export default app;
