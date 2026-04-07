#!/usr/bin/env node

/**
 * Generate search-index.json for the autocomplete search bar.
 * Run after fetch-data.mjs, before astro build.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const deptList = JSON.parse(readFileSync(join(ROOT, 'data', 'departements-list.json'), 'utf-8'));

const index = [];

for (const dept of deptList) {
  const deptData = JSON.parse(readFileSync(join(ROOT, 'data', 'departements', `${dept.code}.json`), 'utf-8'));

  // Collect unique CP + ville pairs
  const seen = new Set();
  for (const station of deptData.stations) {
    const key = station.cp;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    index.push({
      cp: station.cp,
      ville: station.ville,
      dept: dept.code,
      deptSlug: dept.slug,
    });
  }
}

index.sort((a, b) => a.cp.localeCompare(b.cp));

writeFileSync(join(ROOT, 'public', 'search-index.json'), JSON.stringify(index));
console.log(`Search index: ${index.length} entries`);
