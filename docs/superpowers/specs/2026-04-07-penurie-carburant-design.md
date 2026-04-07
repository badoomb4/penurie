# Penurie.fr — Specification

## Contexte

La France subit une penurie de carburant. Les utilisateurs cherchent "station essence ouverte pres de chez moi", "penurie carburant [ville]", etc. L'objectif est de creer un site SEO-first qui capte ce trafic en affichant l'etat des stations-service en temps reel, en exploitant l'API Open Data du gouvernement.

Le concurrent principal (penurie-carburant.fr) a un site PHP date avec des URLs en `.php`, pas de prix affiches, pas de geolocalisation auto, et un design vieillissant. On fait mieux sur tous les fronts.

## Architecture

### Vue d'ensemble

```
GitHub Actions (CRON toutes les 4h)
    |
    v
Fetch API Gouv --> Genere JSON par departement + code postal
    |
    v
Push sur branche 'data' (force push pour eviter bloat git)
    |
    v
Trigger build Astro (merge data dans main)
    |
    v
Astro genere ~6 200 pages statiques
    |
    v
Deploy sur Hostinger + Cloudflare CDN (gratuit) devant
```

### Pipeline de donnees

1. **GitHub Actions** execute un script Node.js toutes les 4 heures (6 builds/jour = ~60-90 min/jour, compatible tier gratuit 2000 min/mois)
2. Le script fetch `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records` avec pagination (limit=100, ~100 requetes pour ~10 000 stations)
3. **Validation** : refuse de commiter si < 8 000 stations recues (protection contre API down ou donnees partielles)
4. Transforme les donnees en fichiers JSON :
   - `data/departements/{code}.json` (101 fichiers)
   - `data/codes-postaux/{cp}.json` (~6 000 fichiers)
   - `data/meta.json` (stats globales : nb stations, nb ruptures, derniere MAJ)
   - `data/departements-list.json` (liste departements avec nom, code, slug)
5. **Force push sur branche `data`** (evite le bloat git — une seule version des JSON)
6. Merge `data` dans `main` → trigger build Astro → deploy

### Gestion des erreurs pipeline

- Si l'API retourne une erreur ou < 8 000 stations : le build est annule, les donnees precedentes restent en place
- Retry avec backoff exponentiel (3 tentatives) pour les erreurs reseau
- Notification GitHub Actions en cas d'echec (email automatique)
- Chaque page affiche "Donnees mises a jour le [date]" — si > 6h, banniere d'alerte "donnees potentiellement obsoletes"

### Donnees API disponibles

| Champ | Usage |
|-------|-------|
| `id` | Identifiant unique station |
| `adresse`, `ville`, `cp` | Localisation |
| `geom.lat`, `geom.lon` | Coordonnees GPS (carte Leaflet) |
| `gazole_prix`, `sp95_prix`, `e10_prix`, `sp98_prix`, `e85_prix`, `gplc_prix` | Prix par carburant |
| `gazole_maj`, `sp95_maj`, etc. | Date derniere MAJ prix |
| `rupture` | Tableau JSON des ruptures (temporaires/definitives) |
| `carburants_rupture_temporaire` | Liste carburants en rupture |
| `carburants_disponibles` | Liste carburants disponibles |
| `horaires_jour` | Horaires par jour |
| `horaires_automate_24_24` | Automate 24/24 (Oui/Non) |
| `services_service` | Services disponibles (lavage, relais colis, etc.) |

## Stack Technique

| Composant | Technologie | Role |
|-----------|-------------|------|
| Framework | Astro 5.x | Generation statique, routing, SEO |
| CSS | Tailwind CSS 4 | Styling responsive mobile-first |
| Carte | Leaflet + OpenStreetMap | Carte interactive avec marqueurs |
| Mesure texte | @chenglou/pretext | Mesure hauteur texte sans DOM reflow (pour virtualisation) |
| Virtual scroll | Custom vanilla JS | Virtualisation listes stations (utilise Pretext pour les hauteurs) |
| Backend | Supabase | Signalements de rupture utilisateurs |
| Signalement API | Supabase Edge Function | Hash IP cote serveur, rate limiting, anti-spam |
| Client API | @supabase/supabase-js | Communication avec Supabase |
| Anti-bot | Cloudflare Turnstile | CAPTCHA invisible sur signalements |
| Interactivite | Vanilla JS | Recherche, carte, formulaires (zero framework) |
| Pipeline | GitHub Actions | CRON toutes les 4h, build, deploy |
| Hebergement | Hostinger | Site statique via git deploy |
| CDN | Cloudflare (gratuit) | Cache, protection DDoS, headers, performance |
| Images | sharp (via Astro) | Optimisation images |

## Structure des Pages

### Arborescence des URLs

```
/                                              --> Accueil
/station-essence/{dept}-{nom}/                 --> Page departement
/station-essence/{dept}-{nom}/{cp}/            --> Page code postal
/carte/                                        --> Carte interactive plein ecran
/penurie-carburant/                            --> Etat des ruptures en France
/prix-carburants/                              --> Comparateur de prix
/a-propos/                                     --> Mentions legales, sources
/404                                           --> Page 404 custom
/sitemap.xml                                   --> Sitemap dynamique
```

**Slugification des departements** : caracteres speciaux normalises (ex: Cotes-d'Armor → `22-cotes-d-armor`, Corse-du-Sud → `2a-corse-du-sud`). Regle : lowercase, accents retires, apostrophes remplacees par tirets, espaces par tirets.

### Page Accueil `/`

- **H1** : "Penurie de carburant en France -- Trouvez une station ouverte pres de chez vous"
- `<html lang="fr">`
- Barre de recherche : code postal ou ville (autocomplete)
- Carte de France avec stats par departement
- Chiffres cles : X stations en rupture / Y ouvertes / prix moyen
- Top departements les plus touches (liens internes)
- Bloc contexte / actualite penurie
- **Schema** : `WebSite` avec `SearchAction`
- **Ads** : banniere header + rectangle mid-content

### Page Departement `/station-essence/75-paris/`

- **H1** : "Stations essence a Paris (75) -- Prix et disponibilite"
- **Meta description** : "Trouvez les stations essence ouvertes a Paris (75). Prix du gazole, SP95, E10 en temps reel. X stations en rupture sur Y."
- Stats departement : % rupture, prix moyen par carburant
- Carte Leaflet zoomee sur le departement
- Liste des codes postaux du departement (liens internes maillage)
- Tableau stations : nom, adresse, prix, statut, horaires (virtualise avec Pretext)
- Bouton "Signaler une rupture" par station
- Liens vers codes postaux voisins (maillage interne)
- **Schema** : `BreadcrumbList`, `ItemList` de `GasStation`
- **Ads** : rectangle mid-content + banniere footer

### Page Code Postal `/station-essence/75-paris/75001/`

- **H1** : "Stations essence 75001 Paris 1er -- Disponibilite et prix"
- Carte zoomee sur la zone
- Fiche detaillee par station :
  - Tous les carburants avec prix et date MAJ
  - Ruptures en cours (temporaires/definitives)
  - Horaires complets par jour
  - Services disponibles
  - Bouton "Signaler une rupture"
- Breadcrumb : Accueil > Paris (75) > 75001
- Liens vers codes postaux voisins du meme departement
- **Schema** : `BreadcrumbList`, `LocalBusiness` par station avec `offers`/`priceSpecification` pour les prix carburant
- **Ads** : affiliation (covoiturage, assurance auto) + AdSense

### Page Carte `/carte/`

- Carte Leaflet plein ecran
- Marqueurs colores : vert (OK), orange (rupture partielle), rouge (ferme/rupture totale)
- Popups au clic : nom, prix, statut, lien vers fiche
- Geolocalisation navigateur pour centrer sur l'utilisateur
- Filtres : type carburant, rayon de recherche
- **SEO** : page moins importante SEO, focus UX

### Page 404

- Message convivial + barre de recherche
- Liens vers accueil et departements populaires
- Pas de contenu duplique

### Page Penurie `/penurie-carburant/`

- Stats nationales avec visuels
- Classement departements par taux de rupture
- Evolution temporelle (si historique disponible)
- **SEO** : cible "penurie carburant france" et variantes

### Page Prix `/prix-carburants/`

- Comparateur de prix par departement/code postal
- Prix moyen par type de carburant
- Stations les moins cheres
- **SEO** : cible "prix carburant [ville]", "gazole pas cher [dept]"

## Signalement de Rupture (Supabase)

### Table `signalements`

```sql
CREATE TABLE signalements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id TEXT NOT NULL,
  carburant TEXT NOT NULL CHECK (carburant IN ('gazole', 'sp95', 'e10', 'sp98', 'e85', 'gplc')),
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '2 hours')
);

-- Index pour les requetes frequentes
CREATE INDEX idx_signalements_station ON signalements(station_id, expires_at);
CREATE INDEX idx_signalements_ip ON signalements(ip_hash, created_at);
```

### Supabase Edge Function `report-outage`

Le signalement passe par une Edge Function (pas d'insert direct client) :

1. Recoit `{ station_id, carburant, turnstile_token }` du client
2. Verifie le token Cloudflare Turnstile (anti-bot)
3. Extrait l'IP reelle depuis les headers de la requete
4. Hash l'IP cote serveur (SHA-256 + sel)
5. Verifie le rate limit : max 10 signalements par IP hash par heure
6. Insert dans la table `signalements`
7. Retourne succes ou erreur

### Nettoyage automatique

- pg_cron ou Supabase scheduled function : `DELETE FROM signalements WHERE expires_at < now()` toutes les heures
- Evite la croissance indefinie de la table

### RLS Policies

```sql
-- Lecture : uniquement signalements non expires
CREATE POLICY "select_active" ON signalements FOR SELECT
  USING (expires_at > now());

-- Pas d'INSERT direct (passe par Edge Function avec service_role key)
-- Pas de UPDATE/DELETE public
```

### Client-side

```javascript
// Signaler une rupture (via Edge Function)
const response = await fetch('https://<project>.supabase.co/functions/v1/report-outage', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ station_id, carburant, turnstile_token })
});

// Lire les signalements actifs (via supabase-js, RLS filtre automatiquement)
const { data } = await supabase
  .from('signalements')
  .select('carburant')
  .eq('station_id', stationId);
```

### Gestion d'erreur Supabase

- Si Supabase est down : le bouton signalement est grise avec message "service temporairement indisponible"
- Les signalements existants sont caches en localStorage (affichage degradé)

## SEO

### Meta Tags (par page)

- `<html lang="fr">`
- `<title>` : unique, < 60 chars, mot-cle principal en premier
- `<meta description>` : unique, < 155 chars, call-to-action
- `<link rel="canonical">` : URL canonique
- Open Graph : og:title, og:description, og:image, og:url
- Twitter Card : summary_large_image

### Schema Markup

- **Accueil** : `WebSite` + `SearchAction`
- **Departement** : `BreadcrumbList` + `ItemList`
- **Code postal** : `BreadcrumbList` + `LocalBusiness` par station + `offers`/`priceSpecification` pour les prix carburant
- **Toutes pages** : `Organization` (site)

### Sitemap XML

- Genere automatiquement par Astro au build
- Inclut toutes les ~6 200 pages avec `lastmod` = date du build
- Soumis a Google Search Console

### Maillage interne

- Page departement → tous ses codes postaux
- Page code postal → codes postaux voisins du meme departement
- Page code postal → page departement parent (breadcrumb)
- Accueil → top departements touches
- Toutes pages → accueil (logo/nav)

### robots.txt

```
User-agent: *
Allow: /
Disallow: /api/
Sitemap: https://penurie.fr/sitemap.xml
```

### Performance SEO

- Score Lighthouse > 95 (Astro statique + Tailwind purge)
- Images optimisees (sharp, WebP, lazy loading)
- Fonts : system fonts (zero web font loading)
- Zero JS par defaut (Astro), JS uniquement pour carte + recherche + signalement
- Cloudflare : cache HTML max-age=3600, assets immutables max-age=31536000

## Virtualisation des Listes (Pretext + Custom Virtualizer)

Pour les pages departement avec des centaines de stations :

1. **Pretext** mesure la hauteur exacte de chaque carte station via `prepare()` + `layout()` (sans toucher le DOM)
2. **Un virtualizer custom en vanilla JS** utilise ces hauteurs pour n'afficher que les stations visibles dans le viewport + un buffer de 5 elements au-dessus/en-dessous
3. Au scroll, les elements hors-ecran sont retires du DOM et les nouveaux sont injectes
4. Le HTML statique contient TOUTES les stations (pour le SEO), le JS les virtualise apres hydratation

Cela evite les reflows DOM sur les longues listes et garantit un scroll fluide meme avec 500+ stations, tout en gardant le contenu complet pour les crawlers.

## Monetisation

### Google AdSense

- Banniere header (728x90 desktop, 320x50 mobile)
- Rectangle mid-content (300x250)
- Banniere footer (728x90)
- Pas de pubs intrusives (pas d'interstitiel, pas de pop-up)

### Affiliation

- Liens vers services de covoiturage (BlaBlaCar)
- Comparateurs d'assurance auto
- Applications GPS / itineraire
- Placement naturel dans le contenu des pages code postal

## Structure des Fichiers du Projet

```
penurie/
  src/
    layouts/
      BaseLayout.astro          -- Layout principal (head, nav, footer, ads)
    pages/
      index.astro               -- Accueil
      carte.astro               -- Carte plein ecran
      penurie-carburant.astro   -- Stats penurie
      prix-carburants.astro     -- Comparateur prix
      a-propos.astro            -- Mentions legales
      404.astro                 -- Page 404 custom
      station-essence/
        [dept].astro            -- Page departement (dynamique)
        [dept]/[cp].astro       -- Page code postal (dynamique)
    components/
      SearchBar.astro           -- Barre de recherche
      StationCard.astro         -- Carte station (prix, statut, horaires)
      StationList.astro         -- Liste stations (shell pour virtualisation)
      Map.astro                 -- Composant carte Leaflet
      Stats.astro               -- Bloc statistiques
      Breadcrumb.astro          -- Fil d'Ariane
      SchemaMarkup.astro        -- JSON-LD schema
      AdSlot.astro              -- Emplacement publicitaire
      ReportButton.astro        -- Bouton signalement rupture
    scripts/
      map.js                    -- Init Leaflet + marqueurs
      search.js                 -- Autocomplete recherche
      report.js                 -- Logique signalement (Supabase Edge Function)
      virtualList.js            -- Virtualisation avec Pretext
    styles/
      global.css                -- Tailwind base + custom
  data/
    departements/               -- JSON par departement (branche data)
    codes-postaux/              -- JSON par code postal (branche data)
    meta.json                   -- Stats globales
    departements-list.json      -- Liste departements (nom, code, slug)
  scripts/
    fetch-data.mjs              -- Script CRON (fetch API + generation JSON)
  supabase/
    functions/
      report-outage/
        index.ts                -- Edge Function signalement
    migrations/
      001_signalements.sql      -- Schema table signalements
  .github/
    workflows/
      update-data.yml           -- GitHub Actions CRON toutes les 4h
  public/
    favicon.svg
    og-image.png                -- Image Open Graph par defaut
    robots.txt
  astro.config.mjs
  tailwind.config.mjs
  package.json
  .gitignore
```

## Verification

### Tests fonctionnels

- [ ] Build Astro sans erreur
- [ ] Pages departement generees correctement (verifier 3-4 departements)
- [ ] Pages code postal generees correctement
- [ ] Page 404 custom fonctionne
- [ ] Carte Leaflet s'affiche avec marqueurs
- [ ] Recherche par code postal fonctionne
- [ ] Signalement de rupture via Edge Function fonctionne
- [ ] Turnstile CAPTCHA bloque les bots
- [ ] Sitemap XML genere avec toutes les URLs
- [ ] Schema markup valide (Google Rich Results Test)
- [ ] Score Lighthouse > 90 sur mobile
- [ ] Responsive : mobile, tablette, desktop
- [ ] robots.txt correct
- [ ] Cloudflare CDN cache correctement

### Tests pipeline

- [ ] Script fetch-data.mjs recupere toutes les stations (~10 000)
- [ ] Validation : build refuse si < 8 000 stations
- [ ] JSON generes par departement et code postal
- [ ] Force push sur branche data fonctionne
- [ ] GitHub Actions s'execute correctement toutes les 4h
- [ ] Deploy sur Hostinger fonctionne
- [ ] Nettoyage pg_cron des signalements expires fonctionne
