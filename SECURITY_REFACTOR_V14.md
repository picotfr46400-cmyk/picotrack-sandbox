# PicoTrack Security Refactor V14

Correction CSP progressive.

## Problème V13
La CSP bloquait les dépendances externes chargées par le Service Worker :
- React CDN jsDelivr
- React DOM CDN jsDelivr
- XLSX CDN Cloudflare
- Google Fonts

Résultat : `React is not defined` et application partiellement cassée.

## Correction V14
- Ajout des CDN nécessaires dans `connect-src` pour éviter le blocage par le Service Worker.
- Conservation des protections principales : `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
- Bundle renommé en `app.secured-v14.js` pour casser le cache.

## Note
La CSP reste volontairement progressive car l'application utilise encore React via CDN. Une future étape plus propre consistera à embarquer React localement dans le bundle, puis à resserrer fortement la CSP.
