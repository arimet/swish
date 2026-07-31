# Déploiement (Vercel) & suivi spectateur temps réel

L'app fonctionne **100 % en local** (IndexedDB) sans rien configurer. Le suivi
spectateur **multi-appareils** est optionnel et s'active avec un store Redis.

## 1. Déployer le front sur Vercel

- Importer le repo dans Vercel (preset **Vite** détecté automatiquement).
- Build : `pnpm build`, output : `dist/`.
- Le dossier `api/` est déployé en **fonctions serverless** (dont le flux SSE en
  runtime Edge) — rien à configurer.

Sans variable d'env supplémentaire, l'app tourne en mode local (le suivi
spectateur reste « même appareil »).

## 2. Activer le suivi temps réel (multi-appareils)

1. Dans le projet Vercel : **Storage → créer une base KV** (Upstash Redis).
   Vercel injecte alors `KV_REST_API_URL` et `KV_REST_API_TOKEN`.
2. Ajouter la variable d'environnement **`VITE_SYNC_URL=/api`** (Production).
3. Redéployer.

Optionnel : `VITE_ADMIN_PASSWORD` pour changer le mot de passe admin (défaut `admin`).

## 3. Données de démo

Pour une démo (déploiement avec équipes/championnat/matchs déjà remplis) :
ajouter **`VITE_SEED=1`** et redéployer. Chaque appareil qui ouvre l'app est
alors amorcé avec un jeu de données. Retirer la variable pour un usage réel.

➡️ Une fois `VITE_SYNC_URL=/api` + KV en place, les **données sont partagées
entre toutes les machines** : équipes, joueurs et calendrier créés sur un
appareil apparaissent sur les autres. L'app reste **local-first** (IndexedDB en
cache) : elle fonctionne hors-ligne et se resynchronise au retour du réseau.
Sans `VITE_SYNC_URL`, tout reste purement local à chaque appareil.

## Comment ça marche

- La **table de marque** (écran live) publie l'état complet du match
  (`PUT /api/match/:id`) à chaque action — best-effort, non bloquant : si le
  réseau tombe, la saisie continue en local et se resynchronise à l'action
  suivante (offline-first).
- Les **spectateurs** ouvrent `/(...)/match/:id/watch` et reçoivent les mises à
  jour en direct via **SSE** (`GET /api/match/:id/stream`), avec repli en
  polling si le flux est indisponible.
- Le store ne garde chaque match que **12 h** (TTL) puis l'oublie.

## Endpoints

| Méthode | Route | Rôle |
|--------|-------|------|
| `GET`  | `/api/match/:id` | Snapshot courant (JSON) |
| `PUT`  | `/api/match/:id` | Publier l'état (table de marque) |
| `GET`  | `/api/match/:id/stream` | Flux SSE temps réel (Edge) |
