-- CreateTable
CREATE TABLE "optimization_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" VARCHAR NOT NULL,
    "driver_name" VARCHAR NOT NULL,
    "stops_input" JSONB NOT NULL,
    "optimized_sequence" JSONB NOT NULL,
    "legs" JSONB NOT NULL,
    "route_geometry" JSONB NOT NULL,
    "total_distance_m" INTEGER NOT NULL,
    "total_duration_s" INTEGER NOT NULL,
    "solver_time_ms" INTEGER NOT NULL,
    "time_limit_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "optimization_requests_pkey" PRIMARY KEY ("id")
);
