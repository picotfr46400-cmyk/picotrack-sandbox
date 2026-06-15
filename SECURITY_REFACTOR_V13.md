# PicoTrack SECURITY_REFACTOR_V13

Ajouts sécurité HTTP côté Vercel :

- Content-Security-Policy progressive adaptée à l’application actuelle.
- X-Content-Type-Options: nosniff.
- Referrer-Policy: strict-origin-when-cross-origin.
- Permissions-Policy: camera=(), microphone=(), geolocation=().
- Cache manifest ajusté.
- Bundle renommé en app.secured-v13.js pour éviter les anciens caches.

Attention : si la CSP bloque une ressource après déploiement, lire la console navigateur puis ajouter uniquement le domaine nécessaire.
