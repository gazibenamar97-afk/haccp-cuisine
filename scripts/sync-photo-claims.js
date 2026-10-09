/**
 * M&T HACCP — synchronisation sécurisée des autorisations photo
 * Exécution locale dans le dossier mt-haccp-admin, avec firebase-admin installé.
 * Ne jamais publier serviceAccountKey.json sur GitHub.
 *
 * node sync-photo-claims.js
 *
 * Lit Firestore /users/{uid} (source de vérité), puis inscrit les claims signés
 * role='authenticated' (Supabase), site (ID permanent), app_role (rôle métier).
 * Préserve les autres claims existants.
 * Pour les utilisateurs désactivés, retire site et app_role.
 * À relancer après création, changement de rôle ou changement d'établissement.
 */
'use strict';
const {initializeApp,cert} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');
const fs = require('fs');
const path = require('path');
const keyPath = path.join(process.cwd(), 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
 console.error('Fichier serviceAccountKey.json introuvable dans le dossier courant');
 process.exit(1);
}
initializeApp({credential:cert(require(keyPath))});
const allowed = new Set(['employe','haccp','responsable']);
async function run(){
 const db=getFirestore(),auth=getAuth();
 const users=await db.collection('users').get();
 let updated=0,skipped=0,revoked=0;
 for(const doc of users.docs){
  const profile=doc.data()||{},uid=doc.id;
  let account;
  try{account=await auth.getUser(uid)}catch(e){
   if(e.code==='auth/user-not-found'){console.warn('Compte Auth absent pour',uid);skipped++;continue}
   throw e;
  }
  const claims={...(account.customClaims||{}),role:'authenticated'};
  const valid=profile.active===true&&typeof profile.site==='string'&&profile.site.trim()&&profile.site!=='main'&&allowed.has(profile.role);
  if(valid){claims.site=profile.site;claims.app_role=profile.role}
  else{delete claims.site;delete claims.app_role;revoked++}
  if(JSON.stringify(account.customClaims||{})===JSON.stringify(claims)){skipped++;continue}
  await auth.setCustomUserClaims(uid,claims);
  updated++;
  console.log('Claims synchronisés :',uid,'site:',claims.site||'(aucun)','rôle:',claims.app_role||'(aucun)');
 }
 console.log('Terminé — mis à jour:',updated,'inchangés:',skipped,'sans droits photos:',revoked);
 console.log('Les utilisateurs doivent renouveler leur jeton (reconnexion ou rafraîchissement).');
}
run().catch(e=>{console.error(e);process.exitCode=1});
