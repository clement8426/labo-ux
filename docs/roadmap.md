# Réalisation par lots

Le texte d’origine est conservé dans [specification.md](specification.md).
Cette version implémente une première tranche utilisable, sans déclarer terminé
l’ensemble des sept lots.

1. **Socle et résilience : première implémentation vérifiée.** Contrats mobiles
   dès le départ, graphe, capacités, sélection, limites de concurrence, délais,
   reprises idempotentes, annulation, persistance atomique, corruption isolée et
   rapports partiels. Restent les migrations et la qualification de tous les
   adaptateurs externes selon une suite commune complète.
2. **Web : première tranche vérifiée.** Fixture vitrine, Playwright, axe, Lighthouse,
   parcours, axe aux checkpoints et observation des ressources/cache des images.
   Exercice Next.js Traverse uniquement cassé, avec qualification CLI/MCP et
   preuves des 31 points pédagogiques. Démo React/Vite facultative
   avec 24 défauts communs documentés, modes cassé/corrigé et auto-test de référence.
   À compléter : fixtures
   e-commerce/SaaS, comparaisons design, états UX, clavier et performance perçue.
3. **Android : non livré.** Maestro/Appium/ADB, remise à zéro, appareil partagé,
   exécution native et résultats attendus à réaliser. Une démo React Native/Expo
   facultative est fournie avec un export de bundle Android ; elle n’a pas été
   installée sur un appareil ici. Les fixtures Flutter/natif restent à ajouter.
4. **iOS : non livré.** Worker macOS, destinations Apple et fixtures exécutables.
5. **Analyses spécialisées : non livrées.** Extraction sémantique par framework,
   audits natifs, Macrobenchmark/XCTest/Flutter en profil adapté.
6. **SSH et multi-hôtes : amorce.** Collecte de sources en lecture seule et plans
   multicibles ; aucun test SSH réel ni worker distribué/tunnel livré.
7. **Distribution : première tranche vérifiée.** CLI, MCP, skill commun, générateur
   de distributions locales, rapports visuels, modes Audit/Débogage et workflow CI.
   Un PROMPT.md et le script setup préparent le moteur et lancent un audit réel de
   vérification sans commandes à taper par l’apprenant. Restent la
   qualification d’installation des hôtes, archives autonomes, publication,
   mises à jour et procédure de retour arrière d’une version publiée.

Les prochaines acceptations doivent s’appuyer sur de véritables applications
exécutables avec défauts activables et remise à zéro, jamais sur des manifestes
utilisés comme substituts à des tests d’intégration.
