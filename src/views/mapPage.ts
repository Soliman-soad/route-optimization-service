import { OptimizedStop } from '../services/optimize.service';

interface MapPageData {
  requestId: string;
  driverId: string;
  driverName: string;
  driverStart: { lat: number; lng: number };
  optimizedSequence: OptimizedStop[];
  legs: Array<{ from: string; to: string; distance_m: number; duration_s: number }>;
  routeGeometry: { type: string; coordinates: [number, number][] };
  totalDistanceM: number;
  totalDurationS: number;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function formatDistance(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${metres} m`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function renderMapPage(record: any): string {
  const data: MapPageData = {
    requestId: record.id,
    driverId: record.driver_id,
    driverName: record.driver_name,
    driverStart: (() => {
      // Extract driver start from stops_input or first leg
      // We store driver coords in the DB via legs or we must re-derive from geometry first coordinate
      // Fallback: use first coordinate of route_geometry
      const geom = record.route_geometry as { coordinates: [number, number][] };
      const first = geom.coordinates[0];
      return { lat: first[1], lng: first[0] };
    })(),
    optimizedSequence: record.optimized_sequence as OptimizedStop[],
    legs: record.legs as MapPageData['legs'],
    routeGeometry: record.route_geometry as MapPageData['routeGeometry'],
    totalDistanceM: record.total_distance_m as number,
    totalDurationS: record.total_duration_s as number,
  };

  const stopsJson = JSON.stringify(data.optimizedSequence);
  const legsJson = JSON.stringify(data.legs);
  const geometryJson = JSON.stringify(data.routeGeometry);
  const driverJson = JSON.stringify({
    name: data.driverName,
    lat: data.driverStart.lat,
    lng: data.driverStart.lng,
  });

  const stopRows = data.optimizedSequence
    .map((s, i) => {
      const leg = data.legs[i];
      const dist = leg ? formatDistance(leg.distance_m) : '—';
      const dur = leg ? formatDuration(leg.duration_s) : '—';
      return `<tr>
        <td class="pos">${s.position}</td>
        <td>${escapeHtml(s.label)}</td>
        <td>${dist}</td>
        <td>${dur}</td>
      </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Route Map — ${escapeHtml(data.driverName)}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f6f9; color: #1a1a2e; }
    header { background: #1a1a2e; color: #fff; padding: 14px 20px; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 1.1rem; font-weight: 600; }
    header .badge { background: #4ecca3; color: #1a1a2e; font-size: 0.75rem; font-weight: 700; border-radius: 999px; padding: 2px 10px; }
    .layout { display: flex; height: calc(100vh - 52px); }
    #map { flex: 1; z-index: 1; }
    .sidebar { width: 340px; min-width: 280px; overflow-y: auto; background: #fff; border-left: 1px solid #e0e4ef; display: flex; flex-direction: column; }
    .summary { padding: 16px; border-bottom: 1px solid #e0e4ef; background: #f9fafc; }
    .summary h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 10px; }
    .stat-row { display: flex; gap: 12px; }
    .stat { flex: 1; background: #fff; border: 1px solid #e0e4ef; border-radius: 8px; padding: 10px 12px; }
    .stat .value { font-size: 1.25rem; font-weight: 700; color: #1a1a2e; }
    .stat .label { font-size: 0.72rem; color: #888; margin-top: 2px; }
    .stops-section { padding: 14px 16px; flex: 1; }
    .stops-section h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; padding: 6px 8px; background: #f4f6f9; color: #555; font-weight: 600; border-bottom: 1px solid #e0e4ef; }
    td { padding: 7px 8px; border-bottom: 1px solid #f0f2f7; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    td.pos { font-weight: 700; color: #3a86ff; font-size: 0.95rem; text-align: center; }
    .meta { padding: 10px 16px; border-top: 1px solid #e0e4ef; font-size: 0.73rem; color: #aaa; }
    .leaflet-popup-content { font-size: 0.88rem; line-height: 1.4; }
    .popup-num { font-weight: 700; color: #3a86ff; font-size: 1.1em; }
    @media (max-width: 700px) {
      .layout { flex-direction: column; }
      #map { height: 55vh; }
      .sidebar { width: 100%; height: auto; border-left: none; border-top: 1px solid #e0e4ef; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Route Map — ${escapeHtml(data.driverName)}</h1>
    <span class="badge">${data.optimizedSequence.length} stops</span>
  </header>
  <div class="layout">
    <div id="map"></div>
    <aside class="sidebar">
      <div class="summary">
        <h2>Summary</h2>
        <div class="stat-row">
          <div class="stat">
            <div class="value">${formatDistance(data.totalDistanceM)}</div>
            <div class="label">Total Distance</div>
          </div>
          <div class="stat">
            <div class="value">${formatDuration(data.totalDurationS)}</div>
            <div class="label">Est. Duration</div>
          </div>
        </div>
      </div>
      <div class="stops-section">
        <h2>Stop Summary</h2>
        <table>
          <thead><tr><th>#</th><th>Location</th><th>Dist</th><th>Time</th></tr></thead>
          <tbody>
            ${stopRows}
          </tbody>
        </table>
      </div>
      <div class="meta">Request ID: ${escapeHtml(data.requestId)}</div>
    </aside>
  </div>
  <script>
    var stops = ${stopsJson};
    var legs = ${legsJson};
    var routeGeometry = ${geometryJson};
    var driver = ${driverJson};

    var map = L.map('map');

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // Satellite layer switcher (bonus)
    var streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19
    });
    var satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri', maxZoom: 19
    });
    L.control.layers(
      { 'Street': streetLayer, 'Satellite': satelliteLayer },
      {},
      { position: 'topright' }
    ).addTo(map);

    // Draw route polyline from real road geometry
    if (routeGeometry && routeGeometry.coordinates && routeGeometry.coordinates.length > 0) {
      var latlngs = routeGeometry.coordinates.map(function(c) { return [c[1], c[0]]; });
      L.polyline(latlngs, { color: '#3a86ff', weight: 4, opacity: 0.85 }).addTo(map);
    }

    var allLatLngs = [];

    // Driver start marker
    var startIcon = L.divIcon({
      className: '',
      html: '<div style="background:#1a1a2e;color:#4ecca3;border:2px solid #4ecca3;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">&#9654;</div>',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -18]
    });
    var driverMarker = L.marker([driver.lat, driver.lng], { icon: startIcon }).addTo(map);
    driverMarker.bindPopup('<div class="leaflet-popup-content"><b>Driver Start</b><br>' + driver.name + '</div>');
    allLatLngs.push([driver.lat, driver.lng]);

    // Stop markers with numbers
    stops.forEach(function(stop) {
      var color = '#3a86ff';
      var numIcon = L.divIcon({
        className: '',
        html: '<div style="background:' + color + ';color:#fff;border:2px solid #fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">' + stop.position + '</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -16]
      });

      var leg = legs[stop.position - 1];
      var distText = leg ? (' &bull; ' + (leg.distance_m >= 1000 ? (leg.distance_m/1000).toFixed(1) + ' km' : leg.distance_m + ' m') + ' from prev') : '';
      var marker = L.marker([stop.lat, stop.lng], { icon: numIcon }).addTo(map);
      marker.bindPopup(
        '<div class="leaflet-popup-content"><span class="popup-num">#' + stop.position + '</span> ' + stop.label + distText + '</div>'
      );
      allLatLngs.push([stop.lat, stop.lng]);
    });

    // Auto-fit bounds
    if (allLatLngs.length > 0) {
      map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40] });
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
