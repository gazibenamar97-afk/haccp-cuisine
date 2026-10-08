'use strict';
/* M&T HACCP — pilote WebAuthn réservé au compte administrateur.
   Le déploiement exige le projet Firebase mt-haccp (voir .firebaserc).
   Aucune connexion biométrique ne contourne Firebase Auth ou les règles Firestore.
*/
const {onRequest}=require('firebase-functions/v2/https');
const admin=require('firebase-admin');
const {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse}=require('@simplewebauthn/server');
const crypto=require('node:crypto');
admin.initializeApp();
const db=admin.firestore();
const ORIGIN='https://gazibenamar97-afk.github.io';
const RP_ID='gazibenamar97-afk.github.io';
const RP_NAME='M&T HACCP';
const EXPIRES_MS=5*60*1000;
const challenges=db.collection('_mt_passkey_challenges');
const credentials=db.collection('_mt_admin_passkeys');
function error(res,code,message){return res.status(code).json({error:message})}
function checkOrigin(req,res){
 const origin=req.headers.origin;
 if(origin===ORIGIN){res.set('Access-Control-Allow-Origin',ORIGIN);res.set('Vary','Origin');}
 else return false;
 res.set('Access-Control-Allow-Methods','POST, OPTIONS');
 res.set('Access-Control-Allow-Headers','Content-Type, Authorization');
 res.set('Cache-Control','no-store');
 return true;
}
async function getAdmin(req){
 const match=/^Bearer (.+)$/.exec(req.headers.authorization||'');
 if(!match)throw Error('Authentification Firebase requise.');
 const decoded=await admin.auth().verifyIdToken(match[1],true);
 const user=await db.collection('users').doc(decoded.uid).get();
 const profile=user.data();
 if(!user.exists||profile.active===false||profile.role!=='admin'||profile.site!=='main')
  throw Error('Compte administrateur non autorisé.');
 return decoded.uid;
}
function pathFor(req){return (req.path||'/').replace(/\/+$/,'')||'/'}
function challengeRef(id){return challenges.doc(id)}
async function issueChallenge(kind,challenge,uid){
 const id=crypto.randomUUID();
 await challengeRef(id).create({kind,challenge,uid:uid||null,expiresAt:admin.firestore.Timestamp.fromMillis(Date.now()+EXPIRES_MS),createdAt:admin.firestore.FieldValue.serverTimestamp()});
 return id;
}
async function consumeChallenge(id,kind){
 if(typeof id!=='string'||!/^[-0-9a-f]{36}$/.test(id))throw Error('Challenge invalide.');
 const ref=challengeRef(id);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref);if(!snap.exists)throw Error('Challenge expiré ou déjà utilisé.');
  const data=snap.data();
  if(data.kind!==kind||data.expiresAt.toMillis()<Date.now())throw Error('Challenge expiré.');
  tx.delete(ref);return data;
 });
}
async function listCredentials(uid){
 const q=await credentials.where('uid','==',uid).get();
 return q.docs.map(d=>({id:d.id,...d.data()}));
}
exports.passkeys=onRequest({region:'europe-west9',cors:false,maxInstances:5,timeoutSeconds:30},async(req,res)=>{
 if(!checkOrigin(req,res))return error(res,403,'Origine non autorisée.');
 if(req.method==='OPTIONS')return res.status(204).send('');
 if(req.method!=='POST')return error(res,405,'Méthode non autorisée.');
 try{
  const route=pathFor(req),body=req.body||{};
  if(route==='/register/options'){
   const uid=await getAdmin(req);
   const existing=await listCredentials(uid);
   const publicKey=await generateRegistrationOptions({
    rpName:RP_NAME,rpID:RP_ID,userName:'Administrateur M&T HACCP',
    userID:Buffer.from(uid,'utf8'),attestationType:'none',
    authenticatorSelection:{residentKey:'required',userVerification:'required'},
    excludeCredentials:existing.map(c=>({id:c.id,transports:c.transports||[]}))
   });
   const challengeId=await issueChallenge('registration',publicKey.challenge,uid);
   return res.json({challengeId,publicKey});
  }
  if(route==='/register/verify'){
   const uid=await getAdmin(req);
   const challenge=await consumeChallenge(body.challengeId,'registration');
   if(challenge.uid!==uid)throw Error('Utilisateur incorrect.');
   const verification=await verifyRegistrationResponse({
    response:body.credential,expectedChallenge:challenge.challenge,
    expectedOrigin:ORIGIN,expectedRPID:RP_ID,requireUserVerification:true
   });
   if(!verification.verified||!verification.registrationInfo)throw Error('Enregistrement non vérifié.');
   const {credential,credentialDeviceType,credentialBackedUp}=verification.registrationInfo;
   await credentials.doc(credential.id).create({
    uid,publicKey:Buffer.from(credential.publicKey).toString('base64url'),
    counter:credential.counter,transports:body.credential.response.transports||[],
    deviceType:credentialDeviceType,backedUp:credentialBackedUp,
    createdAt:admin.firestore.FieldValue.serverTimestamp()
   });
   return res.json({verified:true});
  }
  if(route==='/login/options'){
   // Challenge sans identification préalable ; les credentials sont découverts par le mobile.
   if(body.site&&body.site!=='main')return error(res,403,'Pilote administrateur uniquement.');
   const publicKey=await generateAuthenticationOptions({
    rpID:RP_ID,userVerification:'required',allowCredentials:[]
   });
   const challengeId=await issueChallenge('authentication',publicKey.challenge,null);
   return res.json({challengeId,publicKey});
  }
  if(route==='/login/verify'){
   const challenge=await consumeChallenge(body.challengeId,'authentication');
   const id=body.credential&&body.credential.id;
   if(typeof id!=='string'||id.length>1024)throw Error('Passkey invalide.');
   const ref=credentials.doc(id);
   const snap=await ref.get();
   if(!snap.exists)throw Error('Passkey non reconnue.');
   const stored=snap.data();
   const profileSnap=await db.collection('users').doc(stored.uid).get();
   const profile=profileSnap.data();
   if(!profileSnap.exists||profile.active===false||profile.role!=='admin'||profile.site!=='main')
    throw Error('Compte administrateur désactivé ou non autorisé.');
   const authUser=await admin.auth().getUser(stored.uid);
   if(authUser.disabled)throw Error('Compte Firebase désactivé.');
   const verification=await verifyAuthenticationResponse({
    response:body.credential,expectedChallenge:challenge.challenge,
    expectedOrigin:ORIGIN,expectedRPID:RP_ID,requireUserVerification:true,
    credential:{id,publicKey:Buffer.from(stored.publicKey,'base64url'),counter:stored.counter,transports:stored.transports||[]}
   });
   if(!verification.verified)throw Error('Signature biométrique invalide.');
   // Mise à jour monotone pour les clés à compteur non nul.
   await db.runTransaction(async tx=>{
    const fresh=await tx.get(ref);if(!fresh.exists)throw Error('Passkey supprimée.');
    const old=fresh.data().counter||0,updated=verification.authenticationInfo.newCounter;
    if(old>0&&updated>0&&updated<=old)throw Error('Compteur de sécurité invalide.');
    tx.update(ref,{counter:updated,lastUsedAt:admin.firestore.FieldValue.serverTimestamp()});
   });
   const firebaseCustomToken=await admin.auth().createCustomToken(stored.uid);
   return res.json({firebaseCustomToken});
  }
  return error(res,404,'Route inconnue.');
 }catch(e){
  console.error('WebAuthn:',e.message);
  return error(res,401,'Vérification impossible. Réessayez ou utilisez le mot de passe.');
 }
});
