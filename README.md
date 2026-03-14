# EMEC Route Optimization Service

A Node.js + TypeScript backend service that solves the Vehicle Routing Problem (VRP) using Google OR-Tools, fetches real road-level routing via OpenRouteService, and renders an interactive Leaflet.js map.

---

## Setup & Run

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)
- An [OpenRouteService API key](https://openrouteservice.org/dev/#/signup) (free, email only — no credit card)

### Steps

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd route-optimization-service

# 2. Copy environment file and add your ORS API key
cp .env.example .env
# Edit .env and set ORS_API_KEY=<your_key>

# 3. Start the full stack (DB + app, migrations run automatically)
docker-compose up --build
```

The service will be available at `http://localhost:3000`.

- **Swagger UI**: http://localhost:3000/api-docs
- **Health check**: http://localhost:3000/health

> No other setup steps are needed. Database migrations run automatically on container startup.

---

## API Reference

### POST /api/v1/optimize

Runs OR-Tools VRP optimization, fetches road-level routing from ORS, persists the result, and returns the full response.

**Request:**
```json
POST /api/v1/optimize
Content-Type: application/json

{
  "driver": {
    "id": "driver-001",
    "name": "Ahmed Hassan",
    "start_lat": 23.8103,
    "start_lng": 90.4125
  },
  "stops": [
    {
      "id": "order-001",
      "label": "12 Kemal Ataturk Ave, Banani",
      "lat": 23.7946,
      "lng": 90.4050,
      "time_window_start": "13:00",
      "time_window_end": "15:00",
      "service_time_s": 180
    },
    {
      "id": "order-002",
      "label": "Road 90, House 14, Gulshan 2",
      "lat": 23.7808,
      "lng": 90.4147,
      "time_window_start": "14:00",
      "time_window_end": "16:30",
      "service_time_s": 120
    },
    {
      "id": "order-003",
      "label": "House 5, Sector 7, Uttara",
      "lat": 23.8759,
      "lng": 90.3795,
      "time_window_start": "12:30",
      "time_window_end": "14:00",
      "service_time_s": 300
    }
  ],
  "time_limit_ms": 5000
}
```

**Response (200):**
```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "driver_id": "driver-001",
  "optimized_sequence": [
    { "position": 1, "stop_id": "order-003", "label": "House 5, Sector 7, Uttara", "lat": 23.8759, "lng": 90.3795 },
    { "position": 2, "stop_id": "order-001", "label": "12 Kemal Ataturk Ave, Banani", "lat": 23.7946, "lng": 90.4050 },
    { "position": 3, "stop_id": "order-002", "label": "Road 90, House 14, Gulshan 2", "lat": 23.7808, "lng": 90.4147 }
  ],
  "legs": [
    { "from": "start",      "to": "order-003", "distance_m": 7210,  "duration_s": 980  },
    { "from": "order-003",  "to": "order-001", "distance_m": 9840,  "duration_s": 1340 },
    { "from": "order-001",  "to": "order-002", "distance_m": 2100,  "duration_s": 310  }
  ],
  "total_distance_m": 19150,
  "total_duration_s": 2630,
  "route_geometry": { "type": "LineString", "coordinates": [[90.4125, 23.8103], ["..."]] },
  "solver_time_ms": 284,
  "map_url": "/api/v1/optimize/550e8400-e29b-41d4-a716-446655440000/map",
  "created_at": "2025-05-01T10:32:00.000Z"
}
```

**Error responses:**

| Status | When |
|--------|------|
| 400 Bad Request | Missing fields, invalid coordinates, fewer than 2 stops, invalid time format |
| 422 Unprocessable | Duplicate stop IDs, empty stops array |
| 408 Timeout | OR-Tools solver exceeded `time_limit_ms` |
| 502 Bad Gateway | OpenRouteService API unavailable |
| 500 Internal Error | Unexpected server failure |

---

### GET /api/v1/optimize/:request_id

Returns a previously computed optimization result by its `request_id`. Same shape as POST 200 response.

```
GET /api/v1/optimize/550e8400-e29b-41d4-a716-446655440000
```

Returns **404** if not found.

---

### GET /api/v1/optimize/:request_id/map

Returns a self-contained HTML page rendering the optimized route on an interactive Leaflet map.

```
GET /api/v1/optimize/550e8400-e29b-41d4-a716-446655440000/map
```

Open this URL directly in a browser. The page shows:
- Numbered markers for each stop (1 = first delivery)
- A distinct start marker for the driver
- The actual road polyline from ORS
- Popup labels on each marker
- Auto-fitted bounds showing all stops
- A street/satellite tile layer switcher (bonus)

---

### GET /api/v1/optimize

List all past optimization requests with pagination.

```
GET /api/v1/optimize?page=1&limit=20
```

**Response:**
```json
{
  "data": [
    {
      "id": "550e8400-...",
      "driver_id": "driver-001",
      "driver_name": "Ahmed Hassan",
      "total_distance_m": 19150,
      "total_duration_s": 2630,
      "solver_time_ms": 284,
      "created_at": "2025-05-01T10:32:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "total_pages": 1 }
}
```

---

### GET /health

```json
{ "status": "ok", "db": "connected", "uptime_s": 42 }
```

---

## Architecture

```
POST /api/v1/optimize
        │
        ▼
┌─────────────────────────┐
│   optimize.controller   │  ← Validates input (Zod), HTTP handling
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   optimize.service      │  ← Orchestrates the three layers
└──┬──────────┬───────────┘
   │          │
   │  Layer 1 │  Layer 2
   ▼          ▼
┌──────────┐  ┌───────────────────┐
│vrp.solver│  │ routing.service   │
│(OR-Tools)│  │(OpenRouteService) │
└──────────┘  └───────────────────┘
   │          │
   └────┬─────┘
        │
        ▼
┌─────────────────────────┐
│   PostgreSQL (Prisma)   │  ← Persists result
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│   GET /:id/map          │  ← Layer 3: Leaflet.js HTML map
│   (mapPage.ts template) │
└─────────────────────────┘
```

### Layer 1 — OR-Tools (VRP Optimization)

The Python OR-Tools solver (`src/solver/vrp_solver.py`) is called via Node.js `child_process.execFile`. JSON is passed via stdin and the ordered sequence is returned via stdout. The solver:

1. Receives the full duration matrix (from ORS Matrix API) and stop time windows
2. Sets up a `RoutingIndexManager` + `RoutingModel` with a Time Dimension
3. Adds time window constraints (`time_window_start`/`time_window_end`) per stop
4. Adds `service_time_s` as slack at each node
5. Solves with `PATH_CHEAPEST_ARC` + `GUIDED_LOCAL_SEARCH` within `time_limit_ms`
6. Returns the ordered stop sequence and per-stop arrival times

### Layer 2 — OpenRouteService (Road Routing)

After OR-Tools returns the optimized sequence, `routing.service.ts`:

1. Calls **ORS Matrix API** (`/v2/matrix/driving-car`) to build the duration matrix before solving — gives real driving times, not straight-line Haversine distances
2. Calls **ORS Directions API** (`/v2/directions/driving-car`) with the ordered stops to get the actual road polyline and per-leg stats
3. Coordinates are always sent as `[longitude, latitude]` order as required by ORS

### Layer 3 — Leaflet.js (Map Display)

`src/views/mapPage.ts` is a pure TypeScript template function that generates a self-contained HTML page. The route data is embedded as a JavaScript variable. The page:
- Loads Leaflet 1.9.4 from CDN
- Draws the `route_geometry` GeoJSON polyline (actual roads from ORS)
- Renders numbered div markers with popups
- Calls `map.fitBounds()` on all coordinates
- Includes a bonus street/satellite tile layer switcher

---

## OR-Tools Approach

**Option B — Python via child_process** was chosen.

**Why:** The `@google/ortools` npm package uses native N-API bindings compiled for specific Node.js + platform combinations. It frequently fails on Alpine Linux (used by default Docker images), Apple Silicon, and mismatched Node versions. The Python bindings (`ortools` via pip) install reliably across all environments and are the approach recommended by Google's own OR-Tools documentation for production use.

The Python script accepts JSON on `stdin` and writes JSON to `stdout`, making the interface clean and easy to test independently.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | Environment |
| `OR_TOOLS_TIME_LIMIT_MS` | `5000` | Default solver time limit |
| `ORS_API_KEY` | — | OpenRouteService API key (required) |
| `LOG_LEVEL` | `info` | Winston log level |

---

## Running Tests

```bash
# Inside container
docker-compose exec app npm test

# Or locally (requires Node 20 + npm install)
npm install
npm test
```

Tests are organized as:
- `tests/optimize.test.ts` — 13 integration tests on the Express endpoints (service mocked)
- `tests/routing.service.test.ts` — 8 unit tests for ORS matrix + directions (axios mocked)
- `tests/vrp.solver.test.ts` — 5 unit tests for the solver wrapper (child_process mocked)

---

## Known Limitations

- **No authentication**: The API is open. A production deployment would need JWT or API key middleware.
- **Single vehicle only**: The VRP solver is configured for one driver. Multi-vehicle routing would require extending the `RoutingIndexManager` to `num_vehicles > 1`.
- **ORS free tier limits**: 2,000 requests/day on the free plan. High-volume production use would require a self-hosted ORS instance or a paid plan.
- **No geocoding**: Coordinates must be provided by the caller. Adding a geocoding step (e.g., Nominatim) would improve UX.
- **Solver cold start**: The Python process is spawned fresh for each request. For lower latency, a persistent Python worker with a message queue would be preferable.
- **No retry logic**: If ORS fails transiently, the request returns 502. Adding exponential backoff retries would improve reliability.
