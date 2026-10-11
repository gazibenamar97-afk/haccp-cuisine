# M&T HACCP — Assistant IA V3 (prototype sécurisé)

Ce dossier est indépendant de l'application principale `index.html`. Il ne change pas Firebase Spark et n'écrit aucune donnée dans Firestore.

## Architecture

- Cloudflare Worker : vérifie le jeton Firebase Auth avec les clés publiques Google et vérifie l'établissement actif dans `users/{uid}`.
- Lit **uniquement** `appState/{site}` avec le jeton de l'utilisateur (règles Firestore existantes appliquées).
- Calcule côté serveur des constats HACCP déterministes sur les réceptions, températures et nettoyages ; n'envoie à Gemini que les constats minimisés, sans noms d'opérateurs, photos ou fiches complètes.
- Retourne l'audit généré et les constats de référence `H001`, etc. Le texte de l'IA doit être vérifié par le responsable.
- Aucun secret n'est stocké dans GitHub.

## Déploiement (pas encore effectué)

1. Créer un compte Cloudflare et installer Node.js si nécessaire.
2. Dans `ai-worker/`, exécuter `npm install`, puis `npx wrangler login`.
3. Créer une clé Gemini API depuis un compte fournisseur approprié ; vérifier conditions de confidentialité et coûts avant toute donnée réelle.
4. Ajouter la clé côté Cloudflare : `npx wrangler secret put GEMINI_API_KEY` (ne jamais publier la clé dans GitHub).
5. Exécuter `npm run deploy` et noter l'URL HTTPS fournie par Cloudflare.
6. Configurer l'appel de test depuis la page indépendante une fois l'URL confirmée.

## API

`POST /` depuis `https://gazibenamar97-afk.github.io`, avec `Authorization: Bearer <Firebase ID token>` et `Content-Type: application/json`.

Corps : `{"from":"2026-10-01","to":"2026-10-11"}`.

Retour : `{site,engine,commentary,facts,warning}`. Le service rejette les requêtes non authentifiées, les utilisateurs inactifs, les administrateurs généraux et les périodes invalides.

## Limites et vérifications avant la production

- **Non déployé** : aucune véritable génération IA n'a encore été testée sur les données Grand Bleu.
- Vérifier que les règles Firestore autorisent les lectures strictement limitées à l'établissement et que le format du document `appState` est conforme.
- Configurer des limites de requêtes par compte et un budget fournisseur (la vérification d'identité seule ne protège pas des coûts).
- Tester la réponse du fournisseur, les délais, les erreurs et le contenu de l'audit.
- Valider le traitement des données professionnelles avec le fournisseur IA et les conditions de résidence/confidentialité.
- Le Worker n'analyse pas les photos, ne calcule pas un plan de nettoyage obligatoire et ne certifie aucune conformité.
- Ne pas déployer la V3 dans `index.html` sans validation explicite.
