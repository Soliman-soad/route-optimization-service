import { z } from 'zod';

const timeWindowSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'must be in HH:MM format')
  .refine((v) => {
    const [h, m] = v.split(':').map(Number);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  }, 'must be a valid 24-hour time');

const stopSchema = z.object({
  id: z.string().min(1, 'stop id is required'),
  label: z.string().min(1, 'stop label is required'),
  lat: z
    .number({ required_error: 'lat is required', invalid_type_error: 'lat must be a number' })
    .min(-90, 'lat must be >= -90')
    .max(90, 'lat must be <= 90'),
  lng: z
    .number({ required_error: 'lng is required', invalid_type_error: 'lng must be a number' })
    .min(-180, 'lng must be >= -180')
    .max(180, 'lng must be <= 180'),
  time_window_start: timeWindowSchema,
  time_window_end: timeWindowSchema,
  service_time_s: z
    .number()
    .int('service_time_s must be an integer')
    .min(60, 'service_time_s must be >= 60')
    .max(1800, 'service_time_s must be <= 1800'),
}).refine(
  (s) => {
    const toSec = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 3600 + m * 60;
    };
    return toSec(s.time_window_end) > toSec(s.time_window_start);
  },
  { message: 'time_window_end must be after time_window_start', path: ['time_window_end'] }
);

const driverSchema = z.object({
  id: z.string().min(1, 'driver id is required'),
  name: z.string().min(1, 'driver name is required'),
  start_lat: z
    .number({ required_error: 'start_lat is required', invalid_type_error: 'start_lat must be a number' })
    .min(-90, 'start_lat must be >= -90')
    .max(90, 'start_lat must be <= 90'),
  start_lng: z
    .number({ required_error: 'start_lng is required', invalid_type_error: 'start_lng must be a number' })
    .min(-180, 'start_lng must be >= -180')
    .max(180, 'start_lng must be <= 180'),
});

export const optimizeRequestSchema = z
  .object({
    driver: driverSchema,
    stops: z
      .array(stopSchema)
      .min(2, 'stops must contain at least 2 stops')
      .max(15, 'stops must contain at most 15 stops'),
    time_limit_ms: z
      .number()
      .int()
      .min(1000, 'time_limit_ms must be >= 1000')
      .max(60000, 'time_limit_ms must be <= 60000')
      .optional(),
  })
  .refine(
    (data) => {
      const ids = data.stops.map((s) => s.id);
      return new Set(ids).size === ids.length;
    },
    { message: 'stop ids must be unique', path: ['stops'] }
  );

export type OptimizeRequestBody = z.infer<typeof optimizeRequestSchema>;
