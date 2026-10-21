---
name: ux-audit
description: Auditer un projet numérique accessible localement ou par SSH avec Labo UX, ou corriger ses défauts UX en mode débogage après un audit initial, puis retester. Une URL publique seule ne suffit pas.
---

Utiliser les outils MCP `inspect_project`, `check_capabilities`, `validate_audit_plan`,
`start_audit` et les outils de lecture des résultats du serveur Labo UX. Le CLI
`labo-ux` offre le même moteur si le MCP n’est pas connecté.

Choisir le mode selon la demande existante, sans redemander une autorisation déjà
claire. Par défaut, `mode: audit` et `permissions.codeModification: false` : lire
le projet, exécuter les tests autorisés et écrire les rapports, sans réécrire les
sources, dépendances ou fichiers de configuration du projet audité. Les tests
peuvent agir sur les seules données fictives autorisées par `dataMutation` ; ce
n’est pas une permission de modifier le code. Le moteur ne verrouille pas les
outils d’édition de l’agent hôte : celui-ci doit respecter cette limite.

Si le propriétaire demande des corrections, utiliser `mode: debug` avec
`permissions.codeModification: true`. Ce mode suit obligatoirement : audit initial
→ lecture des preuves → corrections par l’agent hôte → tests et nouvel audit →
compte rendu avant/après. Le CLI et le MCP n’éditent pas le code eux-mêmes.
Conserver une version volontairement cassée destinée à un exercice si le
propriétaire l’exige ; l’autorisation de développer le plugin ne permet pas de
corriger cet exercice.

Commencer par les informations existantes et le projet accessible. Conserver un
plan JSON reprenable : usage du produit, cibles techniques, objectif, parcours,
préconditions, résultat observable, comptes fictifs, autorisations, données
comportementales, vocabulaire et intention graphique. Ne demander que les éléments
manquants qui influencent les contrôles. Le type de produit suggère des parcours,
il ne décide pas de la technologie. Pour un site vitrine, proposer une recherche
d’information ou une prise de contact ; réserver le panier au commerce.

Faire vérifier la couverture avec `validate_audit_plan`. Présenter les parcours,
les préconditions, les actions qui modifient des données, et les contrôles prêts,
non applicables ou empêchés par leurs prérequis. Faire confirmer ce plan avant de
le lancer ; une confirmation explicite déjà fournie pour ce même plan reste valable.
Ne pas marquer `confirmed: true` sans cette confirmation. Les permissions runtime
et dataMutation doivent refléter les actions autorisées. Le kit ne vérifie pas
automatiquement l’identité du propriétaire ou la réalisation des préconditions.

Dans cette version, les outils natifs sont non livrés : annoncer l’analyse du code
et la couverture partielle. Ne pas lancer Lighthouse ou axe-core sur une vue native,
ni prétendre disposer d’un simulateur iOS Windows. Un outil installé ne prouve pas
que l’application est testable. L’adaptateur SSH collecte le code, il ne compile
pas, ne déploie pas et n’installe pas de worker distant.

Après `start_audit`, conserver runId et outputDir ; consulter la progression et les
résultats par cible/bloc. Lire les preuves utiles séparément. Une erreur ou un
contrôle ignoré ne doit pas interrompre l’interprétation des autres résultats.
Les fichiers de parcours décrivent des actions déclaratives, jamais du code arbitraire.

Restituer séparément les défauts du produit, erreurs d’outils, mesures avec unités
et environnement, hypothèses issues du code, et contrôles restants. Un constat
d’axe n’est pas une panne du moteur. Une absence supposée dans le code n’est pas
une absence observée à l’écran. Les inventaires de styles/textes ne suffisent pas
à valider un design system ou une microcopie. Ne pas inférer un taux sans données,
une cause à partir d’un abandon, une conformité depuis un arbre sémantique ou un
score universel entre web, Android et iOS. Marquer toute appréciation de l’IA comme
telle et citer les preuves qui la motivent. Respecter les termes métier intentionnels.

Comparer les audits uniquement lorsque leurs cibles, versions de règles, outils,
profils, unités et environnements sont compatibles. Si un résultat manque, ne pas
annoncer que son défaut a été corrigé. Pour une reprise, vérifier les versions et
préconditions ; une action à effet de bord n’est pas rejouée automatiquement.

En mode débogage, attendre la fin de l’audit initial puis appeler
`get_debugging_plan` (CLI : `debug-plan <runId>`). Lire les preuves avant de corriger ;
vérifier d’abord les hypothèses. Utiliser ensuite les outils d’édition propres à
l’agent hôte dans le périmètre autorisé. Conserver les changements préexistants.
Ne pas modifier les assertions, parcours ou données de référence pour obtenir un
rapport favorable. Reconstruire/redémarrer le projet si nécessaire et exécuter
les tests adaptés, puis lancer un nouvel audit avec le même protocole.

Terminer par `finish_debugging` avec before, after, outputDir et changes
(`[{file: "chemin/relatif", summary: "modification effectuée"}]`). Le CLI fournit
`debug-finish <before> <after> --changes fichiers.json`. Fournir le compte rendu
généré, les fichiers réellement modifiés, les contrôles restants et les erreurs
d’outils. Si aucune source n’a changé, utiliser une comparaison simple et ne pas
annoncer de réécriture. Si un contrôle manque ou devient non comparable, ne pas
présenter son défaut comme corrigé. Ne jamais conclure « tout est corrigé » sur
la seule base de l’exécution du workflow.
