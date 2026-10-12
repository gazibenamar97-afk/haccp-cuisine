# M&T HACCP — supervision technique (branche de test)

## État réel

Le fichier `worker.js` est préparé mais **n'est pas déployé automatiquement**.
La route publique `GET /health` indique `metricsConnected: false`.
La route privée `GET /api/metrics` :
1. vérifie la signature et les dates du jeton Firebase Authentication ;
2. consulte le profil Firestore `users/{uid}` avec ce jeton ;
3. exige `role=admin`, `site=main`, `active=true` ;
4. renvoie **503 metrics_not_connected** tant que Google Cloud Monitoring n'est pas relié.

**Aucune valeur simulée ne doit être présentée comme une métrique réelle.**

## Déploiement manuel du code (non effectué)

Dans Cloudflare Workers, ouvrir `mt-haccp-monitoring-api`, puis éditer le code
du Worker avec le contenu de `monitoring/worker.js` et déployer.
Conserver la variable existante `FIREBASE_PROJECT_ID=mt-hacqp`.

Tester ensuite :
- `GET /health` → HTTP 200 et `metricsConnected:false`
- `GET /api/metrics` sans jeton → HTTP 401
- jeton d'un utilisateur établissement → HTTP 403 (si lecture de son profil autorisée)
- jeton administrateur → HTTP 503 tant que la connexion Google est absente

## Étapes bloquantes restantes

- Valider en test que les règles Firestore autorisent la lecture de son propre
  profil via l'API REST Google Firestore.
- Choisir et configurer une authentification Google Cloud **côté Worker** :
  privilégier des identifiants de courte durée, sans clé JSON persistante.
  La simple attribution du rôle `Lecteur Monitoring` au compte de service
  ne fournit pas de jeton OAuth au Worker.
- Connecter les métriques Google Cloud Monitoring et vérifier leur type,
  leur période et leurs unités contre la console officielle.
- Sécuriser l'accès à Supabase et définir les statistiques réellement
  accessibles sur l'offre utilisée.
- Valider les tests administrateur, utilisateur établissement, mobile,
  PC et absence d'écran blanc avant toute modification de `main`.

## Sécurité

Ne jamais committer de clés, de jetons, de mots de passe ni de secrets.
Le CORS n'est pas un mécanisme d'authentification : le contrôle d'accès
est effectué par le Worker sur chaque requête privée.

## Connexion réelle Google Cloud Monitoring (préparée, non activée)

Le Worker récupère maintenant les métriques officielles sur 24 heures :
`firestore.googleapis.com/document/read_ops_count`,
`firestore.googleapis.com/document/write_ops_count` et
`firestore.googleapis.com/document/delete_ops_count`.

**Blocage d'authentification :** Cloudflare ne dispose pas automatiquement
d'une identité OIDC Google compatible. Le pool Workload Identity Federation
seul ne fournit pas de jeton utilisable au Worker.

**Option de déploiement disponible :** le code accepte un secret Cloudflare
`GOOGLE_MONITORING_SERVICE_ACCOUNT_JSON` contenant un compte de service Google
autorisé à lire Cloud Monitoring. Cette option utilise une clé privée
longue durée, donc elle doit être considérée comme une solution de repli,
avec rotation et révocation planifiées, et seulement après accord explicite.
Ne jamais transmettre cette clé dans le chat, dans GitHub ou dans un fichier
public. Préférer un mécanisme sans clé si une identité OIDC fiable peut être
fournie à Cloudflare.

La route `/health` indique si ce secret est présent, pas si l'API Google
répond réellement. La route `/api/metrics` exige un jeton Firebase
authentifié et un profil Firestore administrateur actif. Une erreur 503
n'est pas un succès.

Les résultats sont des compteurs Cloud Monitoring, pas une facture ni un
relevé exact des quotas Firebase Spark. Un résultat `null` indique
l'absence de points mesurés et ne doit pas être converti en zéro.

Deployment staging : GitHub Actions se déclenche lors des modifications du dossier `monitoring/` sur la branche de test. Les secrets Cloudflare restent dans GitHub Actions.
