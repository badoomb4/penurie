#!/usr/bin/env node

/**
 * Fetch fuel station data from the French government Open Data API.
 * Generates JSON files grouped by department and postal code.
 * Run: node scripts/fetch-data.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const DEPT_DIR = join(DATA_DIR, 'departements');
const CP_DIR = join(DATA_DIR, 'codes-postaux');

const API_BASE = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';
const PAGE_SIZE = 100;
const MIN_STATIONS = 1000; // Minimum acceptable (safety check)
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Department metadata for slug generation
const DEPT_NAMES = {
  '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence',
  '05': 'Hautes-Alpes', '06': 'Alpes-Maritimes', '07': 'Ardeche', '08': 'Ardennes',
  '09': 'Ariege', '10': 'Aube', '11': 'Aude', '12': 'Aveyron',
  '13': 'Bouches-du-Rhone', '14': 'Calvados', '15': 'Cantal', '16': 'Charente',
  '17': 'Charente-Maritime', '18': 'Cher', '19': 'Correze', '2A': 'Corse-du-Sud',
  '2B': 'Haute-Corse', '21': 'Cote-d\'Or', '22': 'Cotes-d\'Armor', '23': 'Creuse',
  '24': 'Dordogne', '25': 'Doubs', '26': 'Drome', '27': 'Eure',
  '28': 'Eure-et-Loir', '29': 'Finistere', '30': 'Gard', '31': 'Haute-Garonne',
  '32': 'Gers', '33': 'Gironde', '34': 'Herault', '35': 'Ille-et-Vilaine',
  '36': 'Indre', '37': 'Indre-et-Loire', '38': 'Isere', '39': 'Jura',
  '40': 'Landes', '41': 'Loir-et-Cher', '42': 'Loire', '43': 'Haute-Loire',
  '44': 'Loire-Atlantique', '45': 'Loiret', '46': 'Lot', '47': 'Lot-et-Garonne',
  '48': 'Lozere', '49': 'Maine-et-Loire', '50': 'Manche', '51': 'Marne',
  '52': 'Haute-Marne', '53': 'Mayenne', '54': 'Meurthe-et-Moselle', '55': 'Meuse',
  '56': 'Morbihan', '57': 'Moselle', '58': 'Nievre', '59': 'Nord',
  '60': 'Oise', '61': 'Orne', '62': 'Pas-de-Calais', '63': 'Puy-de-Dome',
  '64': 'Pyrenees-Atlantiques', '65': 'Hautes-Pyrenees', '66': 'Pyrenees-Orientales',
  '67': 'Bas-Rhin', '68': 'Haut-Rhin', '69': 'Rhone', '70': 'Haute-Saone',
  '71': 'Saone-et-Loire', '72': 'Sarthe', '73': 'Savoie', '74': 'Haute-Savoie',
  '75': 'Paris', '76': 'Seine-Maritime', '77': 'Seine-et-Marne', '78': 'Yvelines',
  '79': 'Deux-Sevres', '80': 'Somme', '81': 'Tarn', '82': 'Tarn-et-Garonne',
  '83': 'Var', '84': 'Vaucluse', '85': 'Vendee', '86': 'Vienne',
  '87': 'Haute-Vienne', '88': 'Vosges', '89': 'Yonne', '90': 'Territoire de Belfort',
  '91': 'Essonne', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis',
  '94': 'Val-de-Marne', '95': 'Val-d\'Oise',
  '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane',
  '974': 'La Reunion', '976': 'Mayotte',
};

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/['']/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getDeptCode(cp) {
  if (!cp) return null;
  const cp5 = cp.toString().padStart(5, '0');
  // Corsica
  if (cp5.startsWith('20')) {
    const num = parseInt(cp5.substring(0, 3));
    return num >= 201 && num <= 207 ? '2A' : '2B';
  }
  // DOM-TOM
  if (cp5.startsWith('97')) return cp5.substring(0, 3);
  return cp5.substring(0, 2);
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.error(`  Attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
}

function parseList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
  if (typeof val === 'string') return val.split(';').map(s => s.trim()).filter(Boolean);
  return [];
}

function parseStation(record) {
  const r = record;
  return {
    id: r.id,
    adresse: r.adresse || '',
    ville: r.ville || '',
    cp: r.cp || '',
    departement: getDeptCode(r.cp),
    lat: r.geom?.lat ?? r.latitude ?? null,
    lon: r.geom?.lon ?? r.longitude ?? null,
    prix: {
      gazole: r.gazole_prix ?? null,
      sp95: r.sp95_prix ?? null,
      e10: r.e10_prix ?? null,
      sp98: r.sp98_prix ?? null,
      e85: r.e85_prix ?? null,
      gplc: r.gplc_prix ?? null,
    },
    maj: {
      gazole: r.gazole_maj ?? null,
      sp95: r.sp95_maj ?? null,
      e10: r.e10_maj ?? null,
      sp98: r.sp98_maj ?? null,
      e85: r.e85_maj ?? null,
      gplc: r.gplc_maj ?? null,
    },
    ruptures: {
      temporaire: parseList(r.carburants_rupture_temporaire),
      definitive: parseList(r.carburants_rupture_definitive),
    },
    carburantsDisponibles: parseList(r.carburants_disponibles),
    horaires: r.horaires_jour || '',
    automate24h: r.horaires_automate_24_24 === 'Oui',
    services: Array.isArray(r.services_service) ? r.services_service : [],
  };
}

async function fetchAllStations() {
  console.log('Fetching stations from API...');
  const allStations = [];
  let offset = 0;
  let total = null;

  while (true) {
    const url = `${API_BASE}?limit=${PAGE_SIZE}&offset=${offset}`;
    console.log(`  Fetching offset=${offset}...`);
    const data = await fetchWithRetry(url);

    if (total === null) {
      total = data.total_count;
      console.log(`  Total stations in API: ${total}`);
    }

    if (!data.results || data.results.length === 0) break;

    for (const record of data.results) {
      const station = parseStation(record);
      if (station.departement) {
        allStations.push(station);
      }
    }

    offset += PAGE_SIZE;
    if (offset >= total) break;

    // Small delay to be nice to the API
    await new Promise(r => setTimeout(r, 100));
  }

  return allStations;
}

function groupByDepartement(stations) {
  const groups = {};
  for (const s of stations) {
    const dept = s.departement;
    if (!groups[dept]) groups[dept] = [];
    groups[dept].push(s);
  }
  return groups;
}

function groupByCodePostal(stations) {
  const groups = {};
  for (const s of stations) {
    const cp = s.cp;
    if (!cp) continue;
    if (!groups[cp]) groups[cp] = [];
    groups[cp].push(s);
  }
  return groups;
}

function computeStats(stations) {
  let totalRupture = 0;
  let totalStations = stations.length;
  const prixSum = { gazole: 0, sp95: 0, e10: 0, sp98: 0, e85: 0, gplc: 0 };
  const prixCount = { gazole: 0, sp95: 0, e10: 0, sp98: 0, e85: 0, gplc: 0 };

  for (const s of stations) {
    if (s.ruptures.temporaire.length > 0 || s.ruptures.definitive.length > 0) {
      totalRupture++;
    }
    for (const [fuel, price] of Object.entries(s.prix)) {
      if (price && price > 0) {
        prixSum[fuel] += price;
        prixCount[fuel]++;
      }
    }
  }

  const prixMoyen = {};
  for (const fuel of Object.keys(prixSum)) {
    prixMoyen[fuel] = prixCount[fuel] > 0
      ? Math.round((prixSum[fuel] / prixCount[fuel]) * 1000) / 1000
      : null;
  }

  return {
    totalStations,
    totalRupture,
    tauxRupture: totalStations > 0 ? Math.round((totalRupture / totalStations) * 100) : 0,
    prixMoyen,
  };
}

function writeJSON(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 0), 'utf-8'); // compact JSON for smaller files
}

async function main() {
  const startTime = Date.now();
  console.log(`\n=== Fetch Data - ${new Date().toISOString()} ===\n`);

  // Fetch all stations
  const stations = await fetchAllStations();
  console.log(`\nFetched ${stations.length} stations total.`);

  // Validate minimum count
  if (stations.length < MIN_STATIONS) {
    console.error(`\nERROR: Only ${stations.length} stations fetched (minimum: ${MIN_STATIONS}).`);
    console.error('API may be down or returning partial data. Aborting.');
    process.exit(1);
  }

  // Group by department
  const byDept = groupByDepartement(stations);
  console.log(`\nDepartements: ${Object.keys(byDept).length}`);

  // Group by postal code
  const byCP = groupByCodePostal(stations);
  console.log(`Codes postaux: ${Object.keys(byCP).length}`);

  // Generate department JSON files
  for (const [deptCode, deptStations] of Object.entries(byDept)) {
    const stats = computeStats(deptStations);
    const cps = [...new Set(deptStations.map(s => s.cp).filter(Boolean))].sort();
    writeJSON(join(DEPT_DIR, `${deptCode}.json`), {
      code: deptCode,
      nom: DEPT_NAMES[deptCode] || deptCode,
      slug: `${deptCode.toLowerCase()}-${slugify(DEPT_NAMES[deptCode] || deptCode)}`,
      stats,
      codesPostaux: cps,
      stations: deptStations,
    });
  }
  console.log(`Written ${Object.keys(byDept).length} department JSON files.`);

  // Generate postal code JSON files
  for (const [cp, cpStations] of Object.entries(byCP)) {
    const dept = getDeptCode(cp);
    const stats = computeStats(cpStations);
    writeJSON(join(CP_DIR, `${cp}.json`), {
      cp,
      departement: dept,
      deptNom: DEPT_NAMES[dept] || dept,
      deptSlug: `${dept?.toLowerCase()}-${slugify(DEPT_NAMES[dept] || dept || '')}`,
      ville: cpStations[0]?.ville || '',
      stats,
      stations: cpStations,
    });
  }
  console.log(`Written ${Object.keys(byCP).length} postal code JSON files.`);

  // Generate departments list
  const deptList = Object.entries(byDept)
    .map(([code, deptStations]) => ({
      code,
      nom: DEPT_NAMES[code] || code,
      slug: `${code.toLowerCase()}-${slugify(DEPT_NAMES[code] || code)}`,
      stats: computeStats(deptStations),
      codesPostaux: [...new Set(deptStations.map(s => s.cp).filter(Boolean))].sort(),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  writeJSON(join(DATA_DIR, 'departements-list.json'), deptList);

  // Generate meta
  const globalStats = computeStats(stations);
  writeJSON(join(DATA_DIR, 'meta.json'), {
    lastUpdate: new Date().toISOString(),
    ...globalStats,
    departements: Object.keys(byDept).length,
    codesPostaux: Object.keys(byCP).length,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s.`);
  console.log(`Stats: ${globalStats.totalStations} stations, ${globalStats.totalRupture} en rupture (${globalStats.tauxRupture}%)`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
