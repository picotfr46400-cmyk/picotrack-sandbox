# PicoTrack Security Refactor V18

Correction ciblée écran Licences.

- `tenants` est maintenant explicitement whitelisté côté serveur.
- `environment_code` n’est plus ajouté automatiquement aux écritures `tenants` car cette colonne n’existe pas dans le schéma réel.
- `environment_license_limits` reste la table de référence pour les limites par environnement.
- `tenants.max_supervision` et `tenants.max_pad` peuvent être mis à jour sans colonne parasite.
- Bundle renommé `app.secured-v18.js` pour casser le cache navigateur.
