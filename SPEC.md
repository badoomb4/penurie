# Plan d'implementation — Penurie.fr

## Contexte

Creer un site SEO-first pour afficher l'etat des stations-service en France pendant la penurie de carburant. Donnees de l'API Open Data du gouvernement, ~6 200 pages statiques generees par Astro, heberge sur Hostinger + Cloudflare CDN. Signalement participatif des ruptures via Supabase.

Spec complete : `docs/superpowers/specs/2026-04-07-penurie-carburant-design.md`

## Phase 1 : Scaffolding projet + Pipeline de donnees

### 1.1 Init projet Astro + GitHub repo
- `npm create astro@latest` dans le dossier Penurie
- Installer les dependances : `tailwindcss`, `@astrojs/tailwind`, `@astrojs/sitemap`, `leaflet`, `@chenglou/pretext`, `@supabase/supabase-js`
- Creer le repo GitHub `badoomb4/penurie` via `gh repo create`
- Init git, premier commit, push

### 1.2 Script de fetch des donnees (`scripts/fetch-data.mjs`)
- Fetch pagine de l'API gouv (limit=100, offset incremental)
- Validation : >= 8 000 stations sinon exit avec erreur
- Transformation : grouper par departement et code postal
- Generer `data/departements/{code}.json`, `data/codes-postaux/{cp}.json`, `data/meta.json`, `data/departements-list.json`
- Slugification des departements (accents, apostrophes, espaces)

### 1.3 GitHub Actions workflow (`.github/workflows/update-data.yml`)
- CRON toutes les 4h
- Execute `scripts/fetch-data.mjs`
- Force push sur branche `data`
- Trigger build si donnees changees

### 1.4 Verification Phase 1
- Executer `node scripts/fetch-data.mjs` localement
- Verifier que les JSON sont corrects (structure, nombre de stations)
- Verifier le workflow GitHub Actions

## Phase 2 : Layout de base + Pages statiques

### 2.1 Layout principal (`src/layouts/BaseLayout.astro`)
- `<html lang="fr">`, head SEO (meta, OG, canonical)
- Navigation responsive (hamburger mobile)
- Footer (mentions legales, liens)
- Emplacements AdSense (composant `AdSlot.astro`)
- Composant `SchemaMarkup.astro` pour JSON-LD

### 2.2 Page d'accueil (`src/pages/index.astro`)
- H1 SEO, barre de recherche, stats globales depuis `meta.json`
- Grille des departements les plus touches
- Schema `WebSite` + `SearchAction`

### 2.3 Pages departement (`src/pages/station-essence/[dept].astro`)
- `getStaticPaths()` depuis `departements-list.json`
- Charge `data/departements/{code}.json`
- H1, meta description dynamique, stats departement
- Liste stations (composant `StationCard.astro`)
- Liens codes postaux du departement
- Breadcrumb + Schema `BreadcrumbList` + `ItemList`

### 2.4 Pages code postal (`src/pages/station-essence/[dept]/[cp].astro`)
- `getStaticPaths()` depuis tous les JSON departements
- Fiche detaillee par station : prix, ruptures, horaires, services
- Schema `LocalBusiness` + `priceSpecification`
- Liens codes postaux voisins

### 2.5 Pages utilitaires
- `src/pages/penurie-carburant.astro` — stats nationales
- `src/pages/prix-carburants.astro` — comparateur prix
- `src/pages/a-propos.astro` — mentions legales
- `src/pages/404.astro` — page 404 custom
- `public/robots.txt`

### 2.6 Verification Phase 2
- `npm run build` sans erreur
- Verifier 3-4 pages departement + code postal dans le navigateur
- Valider schema markup avec Google Rich Results Test
- Verifier sitemap.xml
- Lighthouse > 90

## Phase 3 : Interactivite (carte, recherche, signalement)

### 3.1 Carte Leaflet (`src/components/Map.astro` + `src/scripts/map.js`)
- Init Leaflet avec tuiles OSM
- Marqueurs colores (vert/orange/rouge) depuis les donnees de la page
- Popups au clic avec resume station
- Geolocalisation navigateur (optionnel)
- Page `/carte/` avec carte plein ecran + filtres

### 3.2 Barre de recherche (`src/components/SearchBar.astro` + `src/scripts/search.js`)
- Input avec autocomplete sur codes postaux et villes
- Index JSON genere au build avec tous les CP + villes + slugs
- Redirection vers la page correspondante

### 3.3 Virtualisation des listes (`src/scripts/virtualList.js`)
- Utilise Pretext pour mesurer hauteur de chaque StationCard
- Virtualizer custom : affiche uniquement les elements visibles + buffer
- HTML complet pour SEO, JS virtualise apres hydratation

### 3.4 Signalement rupture (Supabase)
- Migration SQL : `supabase/migrations/001_signalements.sql`
- Edge Function : `supabase/functions/report-outage/index.ts`
  - Verification Turnstile, hash IP, rate limit, insert
- Client JS : `src/scripts/report.js`
  - Formulaire avec Turnstile, appel Edge Function, feedback UX
  - Gestion erreur si Supabase down (bouton grise)
- Composant `ReportButton.astro`
- RLS policies + pg_cron nettoyage

### 3.5 Verification Phase 3
- Carte fonctionnelle sur toutes les pages
- Recherche autocomplete operationnelle
- Signalement : test E2E (soumettre, verifier en base, affichage)
- Virtual scroll fluide sur pages avec 500+ stations

## Phase 4 : SEO, Monetisation, Deploy

### 4.1 SEO final
- Verifier tous les meta tags, canonical, OG sur chaque type de page
- Verifier schema markup valide
- Tester sitemap.xml complet
- Soumettre a Google Search Console

### 4.2 Monetisation
- Integrer AdSense (emplacements header, mid-content, footer)
- Ajouter liens affiliation dans les pages code postal
- Verifier que les pubs n'impactent pas le Lighthouse score

### 4.3 Deploy Hostinger + Cloudflare
- Configurer git deploy Hostinger
- Mettre Cloudflare en proxy devant
- Configurer cache headers : HTML max-age=3600, assets immutable
- Tester le deploy complet

### 4.4 Verification finale
- Build complet (~6 200 pages) sans erreur
- Lighthouse > 90 mobile sur accueil, departement, code postal
- Schema markup valide
- Signalements fonctionnels
- Carte fonctionnelle
- Responsive mobile/tablette/desktop
- Pipeline GitHub Actions fonctionne
- Cloudflare CDN cache correctement

## Fichiers critiques

| Fichier | Role |
|---------|------|
| `scripts/fetch-data.mjs` | Pipeline donnees (le coeur du systeme) |
| `src/pages/station-essence/[dept].astro` | Pages departement (~100 pages SEO) |
| `src/pages/station-essence/[dept]/[cp].astro` | Pages code postal (~6 000 pages SEO) |
| `src/layouts/BaseLayout.astro` | Layout commun (head SEO, nav, footer) |
| `src/scripts/map.js` | Carte Leaflet interactive |
| `src/scripts/virtualList.js` | Virtualisation listes avec Pretext |
| `supabase/functions/report-outage/index.ts` | Edge Function signalement |
| `.github/workflows/update-data.yml` | CRON GitHub Actions |
| `astro.config.mjs` | Config Astro (sitemap, tailwind) |
