# Compatibilité de la version 0.1

## Web

HTML : collecte du code, Chromium, parcours déclaratifs, captures/traces,
inventaire des styles calculés, inventaire des textes/contrôles, axe sur l’état
d’entrée et mesures Lighthouse facultatives. Fixture vitrine exécutée sous Windows.
Une CI Windows/Linux/macOS est fournie ; ces deux dernières plateformes ne sont pas
présentées comme vérifiées sur cette machine.

React, Next, Vue, Nuxt, Angular, Svelte et Astro : détection de manifestes et analyse
statique générique. Une démo React/Vite exécutable est fournie dans
[labo-ux-demos/web](https://github.com/clement8426/labo-ux-demos/tree/main/web),
avec modes cassé/corrigé et cas de référence. Les autres frameworks
ne disposent pas encore de fixture propre ; leur instance démarrée peut être
visée par le pilote web, sans promesse de prise en charge intégrale. Même limite
pour les CMS et interfaces générées côté serveur.

PWA et WebView : uniquement le contenu accessible par une URL au navigateur du
kit. Les gestes natifs et l’accès à une WebView embarquée dans une application ne
sont pas livrés.

## Six blocs : couverture effective

- Design system : inventaire des couleurs littérales et styles de la page d’entrée.
  Comparaison des composants, états, adaptation, texte agrandi et thèmes à réaliser.
- Friction : validation du schéma et exécution des actions web déclarées, traces,
  assertions et captures. Préconditions métier, réinitialisation et détection
  automatique des effets de bord à réaliser.
- Accessibilité : signalement heuristique d’images sans alternative et axe sur la
  page d’entrée. Navigation clavier, focus, dialogues et lecture d’écran à réaliser.
- Comportement : import JSON/CSV validé, déduplication par id, segmentation par
  plateforme et tunnel ordonné par utilisateur/session dans une fenêtre. Aucun taux
  sans dénominateur, aucune cause UX déduite automatiquement.
- Microcopie : motifs vagues/techniques dans le code et inventaire des contrôles
  dans le DOM. Analyse des états, terminologie et appréciation éditoriale à réaliser
  avec le skill et le propriétaire.
- Performance : contexte déclaré et mesures Lighthouse individuelles, isolées des
  autres tâches de l’audit. Simulation lente, loader bloqué, double soumission,
  User Flows et feedback d’interaction à réaliser.

## Mobile

React Native/Expo, Flutter, Swift, Android natif : détection heuristique et lecture
générique des sources. Les styles natifs ne sont pas résolus ; les chaînes utilisées
ne sont pas distinguées des chaînes inutilisées. Une app React Native/Expo
exécutable est fournie dans
[labo-ux-demos/mobile](https://github.com/clement8426/labo-ux-demos/tree/main/mobile) : aperçu web vérifié et bundle Android
exporté, mais aucun APK installé ni test sur appareil natif effectué. Il n’y a
pas encore de pilote Maestro/Appium livré. Les contrôles natifs
du catalogue annoncent `skipped` avec prérequis non livré, jamais `completed`.

iOS demande un worker macOS équipé pour les futurs tests dynamiques. Aucun
simulateur iOS Windows n’est promis. Les performances sur simulateur ou en debug
ne seront pas assimilées à des mesures release sur téléphone.

## SSH et distribution

Le collecteur SSH de sources est expérimental : échappement testé, mais aucun
hôte SSH réel n’est fourni dans l’environnement de développement. Workers,
tunnels, compilations et architecture multi-hôtes restent à réaliser.

Le CLI et le MCP sont testés par un client MCP réel en stdio. Les distributions
Codex/Claude sont générées et vérifiées localement ; leur installation dans les
deux hôtes et leur publication restent à qualifier. Le moteur npm est empaquetable ;
aucun paquet n’a été publié.
