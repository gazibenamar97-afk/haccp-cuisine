-- M&T HACCP : isolation des photos par établissement
-- PRÉREQUIS : chaque Firebase ID token doit porter les custom claims
-- role='authenticated', site='<ID permanent Firestore>', app_role='employe'|'haccp'|'responsable'
-- Les claims doivent être définis côté Firebase Admin (jamais par le navigateur)
-- Nouveau chemin : <site>/<uid>/<nom-fichier>
-- Les anciennes photos (<uid>/<nom-fichier>) restent accessibles uniquement à leur auteur
-- Ne pas exécuter avant la mise à jour coordonnée du code d'envoi et des claims
--
-- Supabase Storage SQL Editor :
DROP POLICY IF EXISTS "HACCP photos tenant insert v2" ON storage.objects;
DROP POLICY IF EXISTS "HACCP photos tenant select v2" ON storage.objects;
CREATE POLICY "HACCP photos tenant insert v2"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
 bucket_id = 'haccp-photos'
 AND (auth.jwt()->>'site') IS NOT NULL
 AND (auth.jwt()->>'site') <> ''
 AND (auth.jwt()->>'app_role') IN ('employe','haccp','responsable')
 AND (storage.foldername(name))[1] = (auth.jwt()->>'site')
 AND (storage.foldername(name))[2] = (auth.jwt()->>'sub')
);
CREATE POLICY "HACCP photos tenant select v2"
ON storage.objects FOR SELECT TO authenticated
USING (
 bucket_id = 'haccp-photos'
 AND (auth.jwt()->>'site') IS NOT NULL
 AND (auth.jwt()->>'site') <> ''
 AND (auth.jwt()->>'app_role') IN ('employe','haccp','responsable')
 AND (storage.foldername(name))[1] = (auth.jwt()->>'site')
 AND (
  (storage.foldername(name))[2] = (auth.jwt()->>'sub')
  OR (auth.jwt()->>'app_role') IN ('haccp','responsable')
 )
);
-- IMPORTANT : les politiques historiques de lecture/écriture par UID
-- doivent être conservées pour les anciennes photos, mais leur champ
-- doit rester limité à l'UID propre de l'utilisateur.
-- IMPORTANT : vérifier qu'aucune autre politique plus permissive n'existe.
