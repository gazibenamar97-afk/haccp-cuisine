/* M&T HACCP — client passkeys mobile (iOS et Android).
 * Module préparatoire : non chargé tant que le serveur WebAuthn n'est pas déployé.
 * Un serveur doit vérifier origin, rpId, challenge, signature, compteur,
 * appartenance du credential au UID Firebase et autorisations de l'établissement.
 * Ne jamais stocker de mot de passe, jeton Firebase ou secret dans localStorage.
 */
(function(global){
'use strict';
const mobile=()=>matchMedia('(max-width: 900px) and (pointer: coarse)').matches;
const supported=()=>mobile()&&isSecureContext&&!!global.PublicKeyCredential&&!!navigator.credentials;
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const normalizeOptions=(o,registration)=>{
 const p={...o,challenge:decode(o.challenge)};
 if(registration){
  p.user={...o.user,id:decode(o.user.id)};
  if(o.excludeCredentials)p.excludeCredentials=o.excludeCredentials.map(x=>({...x,id:decode(x.id)}));
 }else if(o.allowCredentials)p.allowCredentials=o.allowCredentials.map(x=>({...x,id:decode(x.id)}));
 return p;
};
const serialize=(cred,registration)=>({
 id:cred.id,type:cred.type,rawId:encode(cred.rawId),
 response:registration?{
  clientDataJSON:encode(cred.response.clientDataJSON),
  attestationObject:encode(cred.response.attestationObject),
  transports:cred.response.getTransports?.()||[]
 }:{
  clientDataJSON:encode(cred.response.clientDataJSON),
  authenticatorData:encode(cred.response.authenticatorData),
  signature:encode(cred.response.signature),
  userHandle:cred.response.userHandle?encode(cred.response.userHandle):null
 },
 clientExtensionResults:cred.getClientExtensionResults()
});
async function post(url,body,idToken){
 const response=await fetch(url,{method:'POST',credentials:'omit',headers:{
  'Content-Type':'application/json',...(idToken?{'Authorization':'Bearer '+idToken}:{})
 },body:JSON.stringify(body),cache:'no-store'});
 if(!response.ok)throw Error('Service biométrique indisponible ('+response.status+').');
 return response.json();
}
function endpoint(){
 const url=global.MT_PASSKEY_API_URL;
 if(!url)throw Error('Le serveur sécurisé de connexion biométrique doit être configuré.');
 const u=new URL(url,location.href);
 if(u.protocol!=='https:')throw Error('Le service biométrique doit utiliser HTTPS.');
 return u.href.replace(/\/$/,'');
}
async function register(auth){
 if(!supported())throw Error('Fonction disponible uniquement sur un mobile compatible.');
 const user=auth.currentUser;if(!user)throw Error('Connectez-vous avec votre mot de passe pour activer la biométrie.');
 const token=await user.getIdToken(true),base=endpoint();
 const start=await post(base+'/register/options',{},token);
 const credential=await navigator.credentials.create({publicKey:normalizeOptions(start.publicKey,true)});
 if(!credential)throw Error('Activation annulée.');
 const finish=await post(base+'/register/verify',{challengeId:start.challengeId,credential:serialize(credential,true)},token);
 if(!finish.verified)throw Error('Activation non confirmée par le serveur.');
 return true;
}
async function signIn(auth){
 if(!supported())throw Error('Fonction disponible uniquement sur un mobile compatible.');
 const base=endpoint();
 const start=await post(base+'/login/options',{site:global.SITE_ID||null});
 const credential=await navigator.credentials.get({publicKey:normalizeOptions(start.publicKey,false)});
 if(!credential)throw Error('Connexion annulée.');
 const finish=await post(base+'/login/verify',{challengeId:start.challengeId,credential:serialize(credential,false)});
 if(!finish.firebaseCustomToken)throw Error('La vérification du serveur a échoué.');
 // Le serveur émet un jeton Firebase uniquement après validation WebAuthn.
 return auth.signInWithCustomToken(finish.firebaseCustomToken);
}
global.MTHACCPMobilePasskeys=Object.freeze({supported,register,signIn});
})(window);
