# Plan de réalisation — Kit d’audit UX × IA

## 1. Objectif

Construire un kit modulaire capable d’auditer un projet numérique accessible :

- dans un dossier local ;
- ou sur une machine en SSH.

Le kit couvre les six blocs du cours :

1. Design system.
2. Friction.
3. Accessibilité.
4. Analyse comportementale.
5. Microcopie.
6. Performances et performance perçue.

Il doit fonctionner depuis un CLI, un serveur MCP local et un plugin pour agent IA.

**Principe central : une vérification indisponible ou défaillante ne bloque pas les autres.**

---

## 2. Périmètre des projets

### Types de produits

- Site vitrine.
- Site éditorial ou de contenu.
- Site e-commerce.
- Application SaaS.
- Application métier.
- Application mobile.
- Projet hybride combinant plusieurs interfaces.

Ces catégories servent à proposer des parcours pertinents. Elles ne déterminent pas les outils techniques.

### Technologies à prendre en charge

**Web**

- HTML/CSS/JavaScript.
- React, Next.js, Vue, Nuxt, Angular, Svelte, Astro.
- Applications web générées par un backend.
- CMS exécutables dans un environnement de test.
- PWA et interfaces web hybrides.

**Mobile**

- React Native et Expo.
- Flutter.
- Swift avec SwiftUI ou UIKit.
- Kotlin/Java avec Jetpack Compose ou vues Android.
- Applications hybrides avec WebViews.

### Condition d’entrée

L’accès au projet est nécessaire. Une simple URL publique ne suffit pas.

Pour les tests dynamiques, il faut également :

- pouvoir démarrer le site ;
- ou compiler et installer l’application ;
- puis disposer d’un navigateur, simulateur, émulateur ou appareil compatible.

**Si l’application ne peut pas être exécutée, conserver l’analyse du code et annoncer une couverture partielle.**

---

## 3. Séparer trois axes dans la configuration

### Axe A — Usage du produit

Exemples :

```text
showcase
content
ecommerce
saas
business-app
custom
```

### Axe B — Cibles techniques

Exemples :

```text
web
android
ios
webview
```

Un projet peut contenir plusieurs cibles : site React, application React Native Android et application iOS.

Chaque cible possède sa configuration, son environnement et ses résultats.

### Axe C — Capacités disponibles

Exemples :

```text
source.read
source.styles
source.strings
runtime.browser
runtime.android
runtime.ios
runtime.screenshot
runtime.semantics
runtime.network-control
audit.lighthouse
audit.axe
audit.native-accessibility
performance.native
behavior.events
```

Chaque vérification déclare les capacités nécessaires. Le moteur sélectionne celles qui peuvent réellement fonctionner.

### Conséquences

- Lighthouse sur une cible native : **non applicable**.
- Test iOS sans environnement Apple disponible : **non exécuté, prérequis manquant**.
- Analyse comportementale sans événements : **données absentes**.
- Comparaison de composants dans le code : possible même sans appareil.
- Technologie inconnue : analyse générique limitée, sans prétendre à une prise en charge complète.

Distinguer « non applicable » de « applicable mais impossible à exécuter ».

---

## 4. Architecture du dépôt

Utiliser un monorepo TypeScript pour le moteur. Les outils Dart, Swift ou Kotlin sont appelés via des adaptateurs.

```text
labo-ux/
├── packages/
│   ├── contracts/
│   ├── core/
│   ├── project-discovery/
│   ├── adapters/
│   │   ├── local/
│   │   ├── ssh/
│   │   ├── source/
│   │   ├── web/
│   │   ├── android/
│   │   ├── ios/
│   │   ├── react-native/
│   │   ├── flutter/
│   │   └── behavior/
│   ├── checks/
│   │   ├── design-system/
│   │   ├── friction/
│   │   ├── accessibility/
│   │   ├── behavior/
│   │   ├── microcopy/
│   │   └── performance/
│   ├── profiles/
│   ├── journeys/
│   ├── reports/
│   ├── cli/
│   └── mcp-server/
├── skills/
│   └── ux-audit/
├── plugins/
│   ├── claude/
│   └── codex/
├── fixtures/
│   ├── web-showcase/
│   ├── web-ecommerce/
│   ├── web-saas/
│   ├── react-native/
│   ├── flutter/
│   ├── android-native/
│   ├── ios-native/
│   └── ssh/
├── tests/
│   ├── integration/
│   ├── e2e/
│   └── resilience/
├── docs/
└── .github/workflows/
```

### Rôles des couches

- **Contrats** : formats communs.
- **Découverte** : identification des projets et cibles.
- **Adaptateurs** : accès aux technologies et outils.
- **Vérifications** : petites tâches indépendantes.
- **Profils** : suggestions selon le produit.
- **Moteur** : exécution, isolation, reprise.
- **CLI/MCP** : interfaces du même moteur.
- **Skill** : entretien et interprétation.
- **Plugins** : distribution.
- **Rapports** : restitution des résultats enregistrés.

Ne pas créer un microservice par contrôle. Commencer avec des modules et des processus isolés pour les outils qui le nécessitent.

---

## 5. Adaptateurs et outils

### Web

- **Playwright** : navigation, interactions, captures, inspection.
- **Lighthouse** : performance et qualité web.
- **Puppeteer** : parcours Lighthouse User Flows.
- **axe-core** : accessibilité.
- **Pa11y** : complément facultatif.

### Mobile — pilotage commun

- **Maestro** comme premier adaptateur pour les parcours Android/iOS.
- **Appium** comme adaptateur supplémentaire lorsque nécessaire.
- **ADB** pour les opérations Android compatibles.
- Outils Xcode pour les opérations iOS compatibles.

Maestro documente la prise en charge de React Native, Flutter et des interfaces natives. Cela ne dispense pas de vérifier les éléments exposés et l’environnement disponible. [Plateformes Maestro](https://docs.maestro.dev/get-started/supported-platform)

### React Native

- Lecture des composants, styles, chaînes et identifiants.
- Maestro pour l’application Android/iOS.
- Adaptation au mode Expo ou à une application compilée.
- Une cible React Native Web utilise l’adaptateur web.

### Flutter

- Lecture des widgets, thèmes et traductions.
- Maestro pour les éléments exposés dans l’arbre sémantique.
- `flutter test` et `integration_test` lorsqu’ils sont configurés.
- Accessibility Guideline API pour les contrôles intégrés au projet.

Les identifiants sémantiques exposés à l’automatisation et les `Key` Flutter sont des mécanismes différents. [Maestro et Flutter](https://docs.maestro.dev/get-started/supported-platform/flutter)

### Android natif

- Gradle et ADB.
- Maestro ou Appium pour les parcours.
- Tests et contrôles AndroidX adaptés à l’interface.
- Macrobenchmark et traces pour les performances, lorsque configurés.

### iOS natif

- `xcodebuild` et outils de simulateur.
- Maestro ou Appium selon la destination prise en charge.
- XCUITest pour les tests spécifiques.
- Audits d’accessibilité et mesures XCTest lorsque disponibles.

Les outils supplémentaires restent facultatifs. Leur absence réduit la couverture sans invalider les résultats déjà obtenus.

---

## 6. Contrat des nœuds

Un nœud réalise une tâche précise sur une cible précise.

### Déclaration

```text
id
version
block
supportedTargets
requiredCapabilities
requiredDependencies
optionalDependencies
inputSchema
outputSchema
timeout
retryPolicy
resourceRequirements
```

### Résultat

```text
runId
nodeId
targetId
executionStatus
duration
findings[]
measurements[]
evidence[]
limitations[]
error
toolVersions
```

### États d’exécution

- `completed`
- `partial`
- `error`
- `timed-out`
- `skipped`
- `not-applicable`
- `cancelled`

### Nature des preuves

- Mesure automatique.
- Observation à l’exécution.
- Analyse du code.
- Appréciation de l’IA.

### Règle importante

Un outil qui trouve un défaut a pu fonctionner correctement.

Exemples :

- Contraste insuffisant : constat sur le produit.
- Lighthouse plante : erreur du moteur de mesure.
- Émulateur absent : vérification non exécutée.
- Loader supposé absent d’après le code : hypothèse non confirmée à l’exécution.

---

## 7. Continuité et isolation

### Obligations

- Aucun arrêt global au premier échec.
- Résultats enregistrés immédiatement.
- Exceptions interceptées par nœud.
- Validation des résultats.
- Délais maximaux configurables.
- Rapport partiel en fin d’exécution.

### Isolation

- Processus enfants pour les outils susceptibles de planter.
- Contexte navigateur distinct pour les scénarios indépendants.
- Réinitialisation explicite de l’état des applications mobiles.
- Comptes et données de test isolés.
- Verrou par appareil ou simulateur partagé.
- Nettoyage limité aux ressources créées par l’exécution.

### Dépendances

Seules les dépendances obligatoires peuvent empêcher un nœud de démarrer.

- Lighthouse échoue → microcopie continue.
- Émulateur Android indisponible → cible web continue.
- Compilation iOS impossible → analyse des chaînes Swift continue.
- Parcours de connexion bloqué → écrans protégés déclarés non vérifiés.
- Import de données invalide → autres blocs inchangés.

### Reprises

- Réessayer les erreurs transitoires selon une limite.
- Ne pas répéter aveuglément une opération modifiant des données.
- Conserver l’historique des tentatives.
- Signaler les résultats instables.
- Rétablir les préconditions avant de rejouer un parcours.

### Concurrence

- File d’attente bornée.
- Limites distinctes pour navigateurs, compilations et appareils.
- Pas de scénarios concurrents sur le même appareil sans isolation.
- Mesures de performance isolées des autres tâches lourdes du kit.
- Ressources lourdes chargées uniquement pour les cibles concernées.

---

# 8. Les six blocs

## Bloc 1 — Design system

### Objectif

Comparer les composants et leur cohérence entre pages ou écrans.

### Outils

- Web : Playwright et styles calculés.
- Mobile : captures, arbre sémantique et informations exposées par le pilote.
- Code : adaptateurs de thèmes, composants et ressources.
- Modules de comparaison.
- IA pour l’interprétation.

### Nœuds

```text
design.collect-components
design.collect-styles
design.collect-tokens
design.compare-buttons
design.compare-headings
design.compare-fields
design.compare-feedback
design.check-adaptation
```

### Contrôles

- Typographie, couleurs, espacements.
- Boutons, champs, titres et messages.
- États normal, focus, désactivé, erreur et chargement.
- Cohérence des composants remplissant le même rôle.
- Adaptation à la taille d’écran.
- Texte agrandi, orientation et thème lorsque pris en charge.

### Particularités

- Ne pas appliquer les conventions web aux interfaces natives.
- Conserver les unités : CSS px, dp, points, pixels de capture.
- Ne pas déduire une valeur exacte d’une simple capture.
- Ne pas confondre différence Android/iOS légitime et incohérence.
- Si le rendu ne permet pas d’extraire les styles, utiliser les preuves disponibles et préciser la limite.

### Tests

- Variation involontaire.
- Variation intentionnelle.
- États différents d’un même composant.
- Texte agrandi provoquant un débordement.
- Données de style indisponibles sans arrêt du bloc.

---

## Bloc 2 — Friction

### Objectif

Tester les parcours correspondant aux objectifs des utilisateurs.

### Outils

- Web : Playwright.
- Mobile : Maestro, avec Appium en complément.
- Traces, captures et journaux.
- Tests spécifiques au projet si disponibles.
- IA pour l’analyse.

### Nœuds

```text
friction.validate-journey
friction.check-preconditions
friction.run-journey
friction.check-validation
friction.check-recovery
friction.check-navigation
friction.check-lifecycle
```

### Contrôles communs

- Actions accessibles et compréhensibles.
- Résultat observable après chaque étape.
- Erreurs de saisie.
- Conservation des données.
- Retour, annulation et reprise.
- Impasses et doubles actions.
- Navigation et redirections inattendues.

### Contrôles mobiles

- Clavier masquant un champ ou une action.
- Retour système.
- Permissions acceptées ou refusées.
- Passage en arrière-plan puis retour.
- Changement d’orientation.
- Liens profonds, si présents.

### Profils de parcours

- **Vitrine** : comprendre l’offre → trouver une information → contacter.
- **Contenu** : rechercher → consulter → naviguer vers un contenu lié.
- **E-commerce** : rechercher → choisir → panier → commande simulée.
- **SaaS** : connexion → première action utile → création → modification.
- **Application métier/mobile** : parcours défini avec le propriétaire du projet.

Ne pas imposer un tunnel d’achat à un site vitrine.

### Tests

- Action introuvable.
- Erreur bloquante.
- Perte de saisie.
- Refus de permission.
- Reprise après interruption.
- Échec d’un parcours sans blocage des autres.

---

## Bloc 3 — Accessibilité

### Objectif

Identifier les obstacles avec des outils adaptés à chaque cible.

### Outils web

- axe-core.
- Lighthouse.
- Scénarios clavier Playwright.
- Pa11y facultatif.

### Outils natifs

- Android : contrôles AndroidX adaptés au projet.
- iOS : Accessibility Inspector et audits XCUITest automatisables.
- Flutter : Accessibility Guideline API.
- Pilotes mobiles pour observer noms, rôles, états et interactions disponibles.

Les contrôles Flutter peuvent notamment porter sur les contrastes, les tailles de cibles et leurs labels. [Documentation Flutter](https://docs.flutter.dev/ui/accessibility/accessibility-testing)

### Nœuds

```text
a11y.scan-screen
a11y.scan-state
a11y.check-labels
a11y.check-focus
a11y.check-navigation
a11y.check-text-scaling
a11y.check-dialogs
a11y.review-alternatives
```

### Contrôles

- Contraste lorsque mesurable.
- Noms et descriptions utiles.
- Ordre et gestion du focus.
- Taille et disposition des cibles.
- Messages d’erreur.
- Agrandissement des textes.
- Menus et modales.
- Exposition sémantique des contrôles.

### Limites

- axe-core et Lighthouse n’analysent pas les vues natives.
- Une WebView est traitée séparément si son contenu est accessible au pilote.
- Un arbre d’accessibilité ne prouve pas à lui seul une utilisation correcte avec VoiceOver ou TalkBack.
- Les vérifications manuelles restantes doivent apparaître.

Apple distingue également les audits automatiques des essais avec les technologies d’assistance. [Audits d’accessibilité Apple](https://developer.apple.com/documentation/accessibility/performing-accessibility-audits-for-your-app)

### Tests

- Label absent ou vague.
- Contraste insuffisant.
- Focus perdu.
- Texte tronqué.
- Élément inaccessible au pilote.
- Outil spécifique indisponible sans faux résultat positif.

---

## Bloc 4 — Analyse comportementale

### Objectif

Analyser les événements disponibles, quelle que soit la technologie.

### Outils

- Import JSON/CSV.
- Validation de schéma.
- Calculs déterministes.
- IA pour les hypothèses.
- Connecteurs supplémentaires ajoutables.

### Nœuds

```text
behavior.validate-import
behavior.map-events
behavior.check-data-quality
behavior.compute-funnel
behavior.compare-segments
behavior.identify-signals
behavior.suggest-instrumentation
```

### Contrôles

- Définition de l’objectif.
- Événements manquants ou dupliqués.
- Ordre des étapes.
- Cohérence des identifiants.
- Abandons et reprises.
- Différences entre appareils et plateformes.

### Adaptation au produit

La conversion peut être :

- envoyer une demande ;
- réserver ;
- acheter ;
- créer un premier objet ;
- terminer une tâche ;
- activer une fonctionnalité.

### Sans données

- Aucun taux inventé.
- Proposition d’un plan de mesure.
- Jeux fictifs fournis pour les exercices.

### Tests

- Calculs sur données connues.
- Doublons.
- Événements désordonnés.
- Fenêtres temporelles.
- Sessions et utilisateurs distincts.
- Export incorrect sans blocage global.

---

## Bloc 5 — Microcopie

### Objectif

Évaluer les textes dans leurs états d’usage.

### Outils

- Web : Playwright.
- Mobile : Maestro ou Appium.
- Extraction des chaînes et traductions du projet.
- IA avec cible, vocabulaire et ton confirmés.

### Nœuds

```text
copy.collect-controls
copy.collect-validation
copy.collect-empty-states
copy.collect-confirmations
copy.collect-permissions
copy.compare-terminology
copy.review-context
copy.propose-alternatives
```

### Contrôles

- Boutons et labels.
- Consignes.
- Erreurs réparables.
- Confirmations.
- États vides.
- Explications des permissions.
- Cohérence du vocabulaire.
- Débordements et traduction.

### Règles

- Distinguer texte présent dans le code et texte observé à l’écran.
- Identifier les messages système que le projet ne maîtrise pas.
- Préserver les termes métier intentionnels.
- Ne pas traiter une appréciation éditoriale comme une mesure objective.

### Tests

- Erreur technique exposée.
- Message vague.
- Confirmation absente.
- Permission sans explication adaptée.
- Traduction longue.
- Chaîne inutilisée dans le code, absente du parcours réel.

---

## Bloc 6 — Performances et performance perçue

### Objectif

Mesurer les performances pertinentes et vérifier le retour pendant l’attente.

### Outils web

- Lighthouse.
- Lighthouse User Flows.
- Playwright.
- Instrumentation temporelle.

### Outils mobiles

- Android : Macrobenchmark et traces lorsque configurés.
- iOS : mesures XCTest et outils de profilage adaptés.
- Flutter : tests et outils de performance en configuration adaptée.
- Pilote mobile pour observer les états et interactions.

Macrobenchmark nécessite une configuration de test dédiée. Les performances sur émulateur ne doivent pas être présentées comme représentatives des appareils utilisateurs. [Documentation Android](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview)

### Nœuds

```text
performance.check-environment
performance.measure-web-load
performance.measure-startup
performance.measure-interaction
performance.collect-rendering-diagnostics
feedback.test-slow-response
feedback.test-error
feedback.check-loading
feedback.check-double-action
feedback.check-layout-stability
```

### Contrôles

- Chargement web ou démarrage de l’application.
- Réactivité des actions.
- Fluidité lorsque mesurable.
- Retour visible après une action.
- Loader, skeleton ou feedback approprié.
- Sortie du chargement.
- Double soumission.
- Reprise après échec.
- Stabilité de l’interface.

### Simulation réseau

- Web : interception contrôlée.
- Mobile : backend de test, réponses simulées ou dispositif réseau explicitement configuré.
- Si la simulation n’est pas disponible : la déclarer non exécutée.

Ne pas supposer que l’interception Playwright contrôle le trafic natif.

### Comparaisons

Conserver :

- version du code ;
- version de l’application ;
- profil debug/profile/release ;
- appareil ou simulateur ;
- OS ;
- réseau ;
- outils ;
- mesures individuelles.

Ne pas comparer directement un score Lighthouse avec une mesure native, ni une exécution debug sur simulateur avec une version release sur téléphone.

### Tests

- Attente avec et sans feedback.
- Loader bloqué.
- Double action.
- Échec réseau.
- Outil de mesure arrêté.
- Profil de compilation inadapté.
- Métrique non disponible correctement déclarée.

---

## 9. Entretien avec l’IA

### Informations à recueillir

- Projet et dossiers accessibles.
- Type de produit.
- Technologies et cibles.
- Objectif principal.
- Pages ou écrans importants.
- Parcours et résultats attendus.
- Préconditions et comptes fictifs.
- Environnement de démarrage ou compilation.
- Appareils disponibles.
- Intention graphique et ton.
- Données comportementales.
- Actions de préparation et de test autorisées.

### Déroulement

1. Inspecter les informations existantes.
2. Identifier les cibles.
3. Vérifier les capacités disponibles.
4. Poser les questions manquantes.
5. Proposer les parcours.
6. Faire confirmer le plan.
7. Afficher la couverture prévue.
8. Lancer les contrôles disponibles.

L’entretien doit être reprenable. Ne pas poser à nouveau les questions déjà résolues sans raison.

---

## 10. Format commun des parcours

Décrire l’intention sans dépendre directement de Playwright ou Maestro.

### Actions communes

```text
open-target
activate
enter-text
select
scroll
go-back
expect-visible
expect-text
expect-state
checkpoint
```

### Actions spécifiques facultatives

```text
open-url
launch-app
open-deep-link
set-orientation
background-app
foreground-app
handle-permission
```

Chaque pilote traduit les actions qu’il prend en charge.

### Règles

- Préconditions explicites.
- Résultat observable à chaque étape.
- Cibles stables.
- Libellés accessibles et identifiants de test.
- Pas de coordonnées fixes par défaut.
- Action non prise en charge signalée.
- Aucun remplacement silencieux par une action approximative.
- Pas de code arbitraire dans les fichiers de parcours.

---

## 11. Exécution locale et SSH

### Mode local web

- Identifier la procédure existante.
- Préparer une instance de test.
- Démarrer et vérifier sa disponibilité.
- Tester l’adresse locale.
- Nettoyer les ressources créées.

### Mode local mobile

- Identifier les cibles et variantes de compilation.
- Vérifier SDK, outils et appareils.
- Construire ou utiliser un artefact de test correspondant au code.
- Installer et lancer l’application.
- Exécuter les parcours.
- Remettre l’environnement de test dans son état attendu.

### Mode SSH

Séparer :

- l’hôte du code ;
- l’hôte de compilation ;
- l’hôte du navigateur ou de l’appareil ;
- l’hôte du backend de test.

Ils peuvent être identiques ou différents.

### Web distant

- Instance de test distante.
- Tunnel vers le navigateur local.
- Conditions réseau explicitement enregistrées.

### Mobile distant

- Worker sur une machine compatible.
- Appareil ou émulateur associé à ce worker.
- Commandes et résultats transmis par l’adaptateur SSH.
- Métadonnées prouvant la correspondance entre source et application testée.

Pour iOS, prévoir un hôte macOS avec l’environnement Apple nécessaire, local ou accessible à distance. Ne pas promettre de simulateur iOS local sous Windows. [Exécution des applications Apple](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices)

### Dégradation

Compilation impossible ou appareil absent :

- conserver les analyses du code ;
- signaler les contrôles dynamiques non exécutés ;
- poursuivre les autres cibles.

---

## 12. CLI, MCP et plugins

### CLI à développer

```text
labo-ux doctor
labo-ux inspect
labo-ux init
labo-ux plan
labo-ux run
labo-ux status
labo-ux resume
labo-ux report
labo-ux compare
labo-ux checks list
labo-ux adapters list
```

Permettre la sélection par cible, bloc, parcours et vérification.

### MCP local

```text
inspect_project
list_targets
check_capabilities
validate_audit_plan
list_checks
start_audit
get_audit_status
get_audit_results
cancel_audit
compare_audits
```

- Même moteur que le CLI.
- Tâches longues identifiées.
- Progression et résultats consultables.
- Réponses filtrables.
- Preuves accessibles séparément.
- Journaux distincts du canal protocolaire.

### Plugins

- Une source commune pour le skill.
- Distributions adaptées à Claude et Codex.
- Aucun moteur dupliqué dans les plugins.
- Installation des outils lourds selon les plateformes nécessaires.
- Pas d’installation de l’environnement Android ou Flutter pour auditer un simple site vitrine.

---

## 13. Persistance et rapports

Enregistrer progressivement :

- plan confirmé ;
- cibles ;
- capacités ;
- versions ;
- journal d’exécution ;
- résultats par nœud ;
- preuves ;
- limitations ;
- rapports bruts.

### Reprise

- Écritures atomiques.
- Schémas versionnés.
- Résultats corrompus isolés.
- Nœuds interrompus identifiés.
- Reprise respectant les préconditions.
- Invalidation des résultats incompatibles avec la version du projet.

### Rapport

Formats JSON, Markdown et HTML local.

Afficher séparément :

- résultats par cible ;
- résultats des six blocs ;
- problèmes du produit ;
- erreurs des outils ;
- couverture et contrôles restants ;
- recommandations ;
- comparaison avant/après.

Ne pas fusionner artificiellement les mesures web, Android et iOS en un score universel.

---

## 14. Tests du kit

### Tests unitaires — Vitest

- Contrats et schémas.
- Détection des cibles.
- Sélection selon les capacités.
- Dépendances et cycles.
- Délais et reprises.
- Comparaison des composants.
- Calcul des tunnels.
- Déduplication.
- Rapports partiels.
- Compatibilité des versions.

### Tests de contrat des adaptateurs

Chaque adaptateur doit passer une suite commune :

- disponibilité ;
- entrée valide/invalide ;
- résultat normalisé ;
- erreur ;
- délai ;
- annulation ;
- nettoyage ;
- preuve produite ou limite déclarée.

### Tests d’intégration

- Playwright.
- Lighthouse.
- axe-core.
- Maestro.
- Adaptateurs natifs spécialisés.
- Imports de données.
- SSH et workers.
- Équivalence des chemins CLI/MCP.

### Tests end-to-end

Prévoir des fixtures minimales pour :

- site vitrine ;
- e-commerce ;
- SaaS ;
- React Native ;
- Flutter ;
- Android natif ;
- iOS natif.

Pour chaque technologie annoncée comme prise en charge :

- un projet exécutable ;
- un parcours de référence ;
- des défauts activables ;
- des données fictives ;
- une remise à zéro ;
- une vérification des résultats attendus.

Une technologie ne devient pas « prise en charge » uniquement parce qu’elle est détectée dans un manifeste.

### Tests de résilience

Simuler :

- outil absent ;
- exception ;
- processus arrêté ;
- délai dépassé ;
- résultat invalide ;
- navigateur fermé ;
- appareil déconnecté ;
- simulateur indisponible ;
- compilation cassée ;
- tunnel interrompu ;
- fichier corrompu ;
- annulation ;
- rapport HTML impossible à générer.

**Attendu : les tâches indépendantes continuent et les preuves enregistrées restent disponibles.**

### Tests du skill

- Pas de questions redondantes.
- Parcours confirmé avant lancement.
- Aucun tunnel d’achat imposé à un site vitrine.
- Aucun audit Lighthouse lancé sur une interface native.
- Absence d’appareil annoncée.
- Aucun résultat inventé.
- Couverture partielle clairement restituée.

Les tests déterministes du moteur doivent fonctionner sans appel à un modèle IA.

---

## 15. Maintenance et ajout d’outils

### Ajouter une vérification

1. Créer son module.
2. Déclarer les capacités nécessaires.
3. Implémenter son contrat.
4. Ajouter ses tests.
5. L’enregistrer.
6. Documenter son périmètre.

Aucune modification du moteur ne doit être nécessaire.

### Ajouter une technologie

1. Détecter ses cibles.
2. Fournir les adaptateurs nécessaires.
3. Déclarer les capacités réellement exposées.
4. Réutiliser les vérifications compatibles.
5. Ajouter les contrôles spécifiques.
6. Ajouter une fixture et des tests end-to-end.

### Versionnement

- Identifiants stables.
- Versions des règles et schémas.
- Dépendances verrouillées.
- Migrations explicites.
- Changelog.
- Compatibilité documentée par plateforme.
- Mise à jour testée sur les fixtures.

Publier une matrice distinguant : détecté, analysable dans le code, testable à l’exécution et limites connues.

---

## 16. GitHub et CI

### À chaque pull request

- TypeScript et lint.
- Tests unitaires.
- Tests de contrat.
- Intégrations essentielles.
- End-to-end représentatifs.
- Validation des plugins.
- Vérification des paquets distribués.

### Suites par plateforme

- Web : Windows, Linux et macOS pour le socle.
- Android : runner disposant du SDK et d’une destination de test.
- iOS : runner macOS équipé.
- Flutter/React Native : destinations explicitement sélectionnées.
- SSH : environnement isolé avec interruption simulable.

Ne pas faire dépendre toute la CI d’un appareil unique ou d’un score de performance exact.

### Publication

- CLI/MCP versionné.
- Plugins.
- Documentation.
- Exemples de configuration.
- Compatibilité.
- Diagnostic d’installation.
- Procédure de mise à jour et de retour arrière.

---

## 17. Ordre de réalisation

### Lot 1 — Socle et résilience

Contrats, capacités, ordonnanceur, persistance et faux outils.

**Acceptation :** un nœud plante, les autres terminent, le rapport partiel existe.

### Lot 2 — Web complet

Site vitrine, e-commerce et SaaS ; Playwright, Lighthouse, axe-core et six blocs.

**Acceptation :** audit local reproductible et résultats attendus sur les fixtures.

### Lot 3 — Mobile Android

Pilote mobile, appareil/émulateur, parcours et preuves.

**Acceptation :** premières fixtures React Native, Flutter et Android natif testées ; limites documentées.

### Lot 4 — Mobile iOS

Worker macOS, simulateur, pilotes et contrôles spécifiques.

**Acceptation :** fixtures iOS natives et multiplateformes effectivement exécutées.

### Lot 5 — Analyses spécialisées

Accessibilité native, mesures de performance et extraction du code par technologie.

**Acceptation :** chaque contrôle spécialisé dispose de tests et se désactive proprement.

### Lot 6 — SSH et projets multicibles

Code, compilation, backend et appareils distribués.

**Acceptation :** coupure d’un hôte sans perte des autres résultats ni arrêt des autres cibles.

### Lot 7 — Distribution

MCP, plugins, rapports, comparaison, CI et publication.

**Acceptation :** installation et audit réalisables en suivant uniquement la documentation.

Prévoir les contrats mobiles dès le premier lot, même si leurs adaptateurs sont livrés ensuite.

---

## 18. Critères de réussite finaux

- Les six blocs fonctionnent indépendamment.
- Le type de produit ne limite pas la technologie.
- Plusieurs cibles peuvent appartenir au même projet.
- Les outils sont sélectionnés selon leurs capacités.
- L’accès local et SSH est prévu.
- Une panne reste isolée.
- Les résultats sont persistants et reprenables.
- Les contrôles non applicables et non exécutés sont distingués.
- Chaque technologie annoncée dispose d’une fixture et de tests réels.
- Le CLI fonctionne sans modèle IA.
- MCP et plugins réutilisent le même moteur.
- L’ajout d’un outil ou d’une vérification ne nécessite pas de réécrire le socle.
- Le rapport distingue clairement ce qui est mesuré, observé, supposé et non vérifié.