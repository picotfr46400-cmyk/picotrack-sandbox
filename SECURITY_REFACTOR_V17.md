# PicoTrack Security Refactor V17

## Objectif
Correction propre du `manifest.json 401` observé sur les URLs Vercel protégées.

## Correction
- Conservation du vrai `manifest.json` public.
- Ajout de `crossorigin="use-credentials"` sur le lien manifest afin que le navigateur envoie les cookies de session Vercel lorsque Deployment Protection/SSO est actif.
- Conservation des icônes PWA et favicon.
- Bundle renommé `app.secured-v17.js` pour casser le cache.

## Remarque
Sur un domaine public définitif `picotrack.fr` sans protection Vercel Preview, le manifest doit être servi sans 401. Cette correction évite les erreurs parasites sur les environnements de preview protégés.
