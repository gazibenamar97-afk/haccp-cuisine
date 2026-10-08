# M&T HACCP — serveur passkeys (pilote administrateur)

Le site GitHub Pages reste inchangé. Déployer les fonctions Firebase dans le **même projet** que Firebase Auth et Firestore.

## Prérequis
- Projet Firebase existant, forfait Blaze pour déployer Cloud Functions.
- Firebase CLI et Node.js 22.
- Une origine WebAuthn autorisée : `https://gazibenamar97-afk.github.io`.
- RP ID : `gazibenamar97-afk.github.io`.
- Ne jamais utiliser le domaine `cloudfunctions.net` comme RP ID pour cette application.

## Configuration
1. Depuis la racine du dépôt, exécuter `firebase login` puis `firebase use --add` et sélectionner le projet Firebase actuel.
2. Exécuter `npm --prefix functions install`.
3. Déployer `firebase deploy --only functions`.
4. Après déploiement, définir `window.MT_PASSKEY_API_URL` sur l'URL HTTPS de la fonction `passkeys` **avant** de charger `passkeys-mobile.js` sur la page mobile.
5. Ne pas activer les boutons de connexion tant que les quatre endpoints ne sont pas testés.

## Routes prévues
- `POST /register/options` : exige un ID token Firebase administrateur.
- `POST /register/verify` : exige le même compte et vérifie l'attestation WebAuthn.
- `POST /login/options` : crée un challenge éphémère.
- `POST /login/verify` : vérifie la signature, puis émet un Firebase custom token.

Le pilote doit être réservé à `role=admin`, `site=main`. Une authentification locale (Face ID/empreinte) seule ne suffit jamais : la signature et le challenge doivent être vérifiés par le serveur.

**État actuel :** préparation de la configuration uniquement. Le service de production et les routes ne sont pas encore déployés.
