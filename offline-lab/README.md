# M&T HACCP — Laboratoire de mode hors ligne (branche de test)

## Étape actuelle
Prototype **isolé, non connecté à Firebase ni Supabase**. Aucune modification de l'application M&T HACCP de production. Les formulaires produisent uniquement des **données fictives chiffrées localement**.

Objectifs du prototype :
1. Mise en cache d'une interface PWA autonome sans dépendances CDN.
2. Création d'un coffre local IndexedDB chiffré avec Web Crypto / AES-GCM, clé dérivée d'une phrase secrète par PBKDF2.
3. Fermeture de la page, perte du réseau et déverrouillage local après réouverture.
4. Création de relevés fictifs de température et de nettoyage sans Internet ; persistance et affichage d'un historique local.
5. État de synchronisation clairement indiqué : **en attente (aucune synchronisation serveur encore implémentée)**.

## Contraintes de test
La branche `test-offline-secure-20261015` n'est **pas** publiée sur GitHub Pages tant qu'un environnement de test sécurisé et indépendant n'a pas été prévu. **Ne pas naviguer dans un sous-dossier du site principal** pour tester sans avoir auparavant corrigé la règle de cache trop large de son Service Worker de production : actuellement, il met en cache toute navigation sous le nom du fichier d'accueil.

Ne pas saisir de vraies informations de clients ou employés. Le mode déverrouillage local n'est **pas encore lié à un compte Firebase**, à une autorisation d'appareil signée, ni à une expiration/revocation du serveur. La phrase secrète protège des données fictives dans ce laboratoire : ne pas considérer ce prototype comme une solution de sécurité opérationnelle.

## Prochaines étapes avant intégration
- Environnement de déploiement de test sur une origine / un scope séparé sans collision avec le Service Worker existant.
- Test sur iPhone, Android, Windows (dans le raccourci installé, pas uniquement Safari/Chrome).
- Autorisation du dispositif en ligne liée à l'UID, au site, au rôle, signée et limitée dans le temps ; déverrouillage local correctement sécurisé, tests d'expiration et de désactivation du compte.
- Refactorisation des écritures Firestore (éviter l'écrasement du document global), file d'opérations idempotentes et gestion des conflits.
- Tests d'écriture/réémission/absence de doublons et photos différées Supabase.
- Validation des règles Firestore et des séparations des données locales par compte et par établissement.

## Dépendances
Aucune. Fichiers `index.html`, `sw.js`, `manifest.webmanifest`, `icon.svg`.
