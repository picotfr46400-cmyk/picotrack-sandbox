# PicoTrack Security Refactor V15

- Masquage des comptes plateforme dans l’écran Utilisateurs.
- Exclusion serveur/front des comptes role `super_admin`, `platform_admin`, scope `platform` et environnement `GLOBAL`.
- Conservation de l’accès administrateur pour piloter l’app, sans affichage comme utilisateur client.
