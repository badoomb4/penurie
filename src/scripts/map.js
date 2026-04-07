// Initialize Leaflet map on pages that have a #map element with data-stations
function initMap() {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  const stationsData = mapEl.dataset.stations;
  if (!stationsData) return;

  let stations;
  try {
    stations = JSON.parse(stationsData);
  } catch { return; }

  // Filter stations with valid coordinates
  const validStations = stations.filter(s => s.lat && s.lon);
  if (validStations.length === 0) {
    mapEl.innerHTML = '<p class="p-4 text-gray-500 text-center">Aucune coordonnee GPS disponible</p>';
    return;
  }

  // Load Leaflet dynamically
  const L = window.L;
  if (!L) {
    // Wait for Leaflet to load
    const check = setInterval(() => {
      if (window.L) {
        clearInterval(check);
        renderMap(window.L, mapEl, validStations);
      }
    }, 100);
    return;
  }

  renderMap(L, mapEl, validStations);
}

function renderMap(L, mapEl, stations) {
  // Calculate center from stations
  const lats = stations.map(s => s.lat);
  const lons = stations.map(s => s.lon);
  const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const centerLon = lons.reduce((a, b) => a + b, 0) / lons.length;

  const map = L.map(mapEl).setView([centerLat, centerLon], 10);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);

  // Create markers
  const markers = [];
  for (const s of stations) {
    const color = s.allRupture ? '#dc2626' : s.rupture ? '#f59e0b' : '#16a34a';
    const status = s.allRupture ? 'Rupture totale' : s.rupture ? 'Rupture partielle' : 'Disponible';

    const icon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const marker = L.marker([s.lat, s.lon], { icon });
    const popupHtml = `
      <div style="font-size:13px;min-width:180px">
        <strong>${s.adresse}</strong><br>
        <span style="color:#666">${s.cp} ${s.ville}</span><br>
        <span style="color:${color};font-weight:bold">${status}</span><br>
        ${s.deptSlug ? `<a href="/station-essence/${s.deptSlug}/${s.cp}/" style="color:#1e40af;text-decoration:underline">Voir les details</a>` : ''}
      </div>
    `;
    marker.bindPopup(popupHtml);
    markers.push(marker);
  }

  const group = L.featureGroup(markers).addTo(map);
  map.fitBounds(group.getBounds().pad(0.1));
}

// Leaflet script loader
if (!document.querySelector('script[src*="leaflet"]')) {
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
  script.crossOrigin = '';
  script.onload = initMap;
  document.head.appendChild(script);
} else {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
  } else {
    initMap();
  }
}
