# Changelog

## 0.2.0 — 2026-10-21

- PROMPT.md autonome pour l’installation par un agent, script setup et audit réel
  de vérification avant de déclarer le moteur prêt.

- Modes `audit` / `debug` explicites et permission de modification du code séparée
  des mutations de données de test. Mode audit par défaut et compatibilité des
  anciens plans conservée.
- Workflow debug : audit initial obligatoire, passage de relais à l’agent hôte,
  nouvel audit et bilan vérifié. Aucune édition automatique dans le moteur.
- Synthèse en français et priorités avec liens vers les preuves dans les rapports.
  Commande `serve-report` pour consulter un rapport sur loopback.

- Nouveau contrôle isolé `performance.inspect-resources` : réponses réellement
  observées, octets connus, cache des images, dimensions et preuve JSON.
- Diagnostics Lighthouse de performance rendus visibles dans les rapports ;
  version du contrôle portée à 1.1.0 pour empêcher une comparaison trompeuse avec
  les anciens résultats. Les cinq mesures existantes sont conservées.
- Nouveau contrôle `a11y.scan-journey-states` : axe aux checkpoints atteints,
  captures et limites explicites. Rejeu déclaré non idempotent et soumis aux
  permissions ; aucune mutation interdite n’est exécutée.
- Tests unitaires de tri des diagnostics et test navigateur réel des ressources,
  états du formulaire et permissions. Qualification sur un exercice Next.js
  volontairement défectueux, sans créer de version corrigée.

## Séparation des dépôts — 2026-10-17

- Plugin, moteur, CLI, MCP et tests conservés dans `labo-ux`.
- Apps et parcours pédagogiques déplacés dans le dépôt autonome
  [labo-ux-demos](https://github.com/clement8426/labo-ux-demos).
- Installation du plugin indépendante de React, Vite et Expo ; CI à la racine.

## 0.1.0 — 2026-10-16

- Premier moteur TypeScript, contrats et schémas version 1.
- Capacités par cible, nœuds indépendants, persistance et reprise.
- CLI et MCP local, skill commun et distributions locales.
- Contrôles statiques, import comportemental et première intégration web.
- Rapports JSON/Markdown/HTML, comparaison prudente et tests de résilience.

Les adaptateurs natifs et workers distribués ne sont pas livrés.

### Démos pédagogiques facultatives

- React/Vite et React Native/Expo : marque fictive Les mains libres, versions
  cassée/corrigée, faux service et panneau formateur.
- Catalogue commun de 24 défauts, jeux d’événements et plans d’audit de référence.
- Qualification par le CLI et le MCP réels, sondes propres aux démos et liste des
  contrôles manuels/natifs restants. Dépendances et CI facultatives séparées.
