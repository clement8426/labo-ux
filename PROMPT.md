# Labo UX — installation et premier audit par mon agent

## Ma demande

Je ne suis pas à l’aise avec les installations techniques. Installe et vérifie
Labo UX pour moi, puis accompagne-moi pour auditer un projet ou essayer l’exercice
Traverse. Fais les commandes toi-même : ne me demande pas de copier des commandes
npm, npx, Git ou des fichiers de configuration.

Tu dois disposer d’un accès autorisé au terminal, aux fichiers locaux et à un
navigateur de test. Un simple chat sans ces outils ne peut pas réaliser cette
installation : explique alors cette limite en une phrase et indique quel accès
local manque, sans prétendre avoir exécuté quoi que ce soit.

## Autorisation et limites

Je t’autorise à télécharger les dépôts officiels ci-dessous, installer leurs
dépendances dans un dossier de travail séparé, préparer Chromium, compiler le kit
et exécuter son test intégré avec des données fictives. Ces opérations concernent
Labo UX ; elles n’autorisent pas à réécrire le code du projet que je veux auditer.
N’envoie ni message, ni paiement, ni commande réelle. Ne publie rien.

Par défaut, utilise le **mode Audit**, sans modification du code du projet. Ne
passe en **mode Débogage** que si je demande explicitement des corrections. Même
en débogage, commence par un audit, conserve les preuves, corrige avec tes propres
outils, puis teste et réalise un nouvel audit équivalent.

Conserve les fichiers et changements existants. N’écrase pas un dossier déjà
présent et ne fais pas de reset Git. N’installe pas de dépendances globales si
une installation locale ou un runtime utilisateur compatible suffit. Les demandes
d’autorisation de ton environnement restent applicables.

## 1. Retrouver ou récupérer les bons projets

Sources officielles :

- Moteur et plugin : https://github.com/clement8426/labo-ux
- Exercices facultatifs : https://github.com/clement8426/labo-ux-demos

Cherche d’abord une installation existante. Sinon, crée un espace de travail
séparé contenant les deux dossiers voisins `labo-ux` et `labo-ux-demos`.
Ne les clone pas dans le code du projet à auditer. Git n’est pas obligatoire :
une archive du dépôt officiel est possible si tu peux la télécharger et l’extraire.

Vérifie l’identité du dépôt et lis son README avant de lancer ses scripts. Si une
copie existe déjà, vérifie sa branche, sa version et ses changements locaux. Mets
à jour seulement une copie propre, avec une avance rapide ; sinon conserve-la et
prépare une copie séparée après explication. Ne mélange pas une ancienne copie du
moteur incluse dans des démos avec le dépôt autonome actuel.

Les dépôts peuvent être privés. En cas de 401, 403, 404 ou échec d’authentification,
ne conclus pas immédiatement que le projet n’existe pas. Demande uniquement l’accès
GitHub au formateur ou une connexion autorisée. Ne réclame pas de jeton dans le
chat et ne change pas la visibilité d’un dépôt.

## 2. Préparer les outils sans me donner de commandes à taper

Vérifie le système, Node.js et le gestionnaire de paquets. Le kit demande Node.js
22 ou supérieur ; utilise de préférence Node.js 24 LTS compatible. Réutilise le
runtime local de ton environnement si possible. S’il manque, prépare un runtime
utilisateur depuis https://nodejs.org/en/download, en vérifiant l’origine et les
sommes de contrôle disponibles. Évite les installateurs inconnus ou les changements
système inutiles. Si ton environnement interdit l’installation, explique seulement
l’autorisation ou le prérequis manquant.

Depuis le dossier du plugin, exécute toi-même :

```sh
node scripts/setup.mjs
```

Le script installe les versions verrouillées, compile le moteur, prépare le
navigateur et les distributions locales, puis lance un vrai audit de sa fixture
intégrée. Il écrit un état d’installation et le chemin du rapport dans `.labo-ux`.
Une installation déjà préparée est réutilisée si ses entrées n’ont pas changé.

Lis le résultat et le rapport du test. Vérifie notamment que les contrôles web et
Lighthouse ont réellement été exécutés, que l’image sans alternative de la fixture
a été signalée et que son parcours fictif a atteint une confirmation. Un processus
qui retourne 0 ne prouve pas à lui seul que tous ces contrôles ont fonctionné.

Si une étape échoue, traite sa cause réelle : accès réseau, dépendance ou navigateur
absent, droits locaux, manque de ressources. Ne supprime pas le contrôle défaillant
pour annoncer une installation réussie. Ne remplace pas un audit par un rapport
inventé. Une nouvelle tentative est pertinente après avoir changé la condition
qui bloquait ; évite les relances identiques en boucle.

## 3. Utiliser le moteur immédiatement

Lis `skills/ux-audit/SKILL.md` dans le dépôt installé. Si un MCP Labo UX est déjà
connecté, utilise ses outils et vérifie le catalogue. Sinon, utilise directement
le CLI compilé : le même moteur fonctionne sans enregistrer de MCP ni redémarrer
mon agent. Ne modifie pas ma configuration globale pour une simple démonstration.

Le fichier `dist/packages/cli/src/index.js` est le point d’entrée du CLI. Utilise
son chemin absolu et son aide. Les commandes disponibles incluent `inspect`,
`doctor`, `plan`, `run`, `report`, `serve-report`, `debug-plan` et `debug-finish`.
Les distributions locales générées ne sont pas des plugins déjà publiés dans une
boutique. Leur enregistrement dans un hôte reste une opération spécifique à cet
hôte ; ce n’est pas nécessaire pour commencer avec le CLI.

## 4. Me proposer un choix simple

Après l’installation, propose seulement : **« Essayer Traverse »** ou **« Auditer
mon projet »**, sauf si mon choix est déjà clair.

### Si je choisis Traverse

Lis `exercices/traverse/README.md` dans le dépôt des démos. Prépare toi-même ses
dépendances, ses images, sa compilation et son serveur de production. Ne mesure
pas les performances avec le serveur de développement. Le port prévu est 4192 :
s’il est occupé, vérifie d’abord le service présent, sans arrêter un autre projet.
Adapte le plan à un autre port libre si nécessaire, en l’indiquant.

Ouvre le site. Ma mission est de choisir une sortie, saisir Alex Exemple,
alex@example.test et 0600000000, puis tenter d’envoyer une demande. Tout est fictif.
Utilise le plan et le prompt fournis dans l’exercice. **Traverse doit rester cassé :
ne le corrige pas et ne crée pas de version réparée.**

Les PNG volumineux, délais et erreurs HTTP de son faux service sont intentionnels.
Les événements fournis sont synthétiques : aucun résultat ne décrit des utilisateurs
réels. L’inventaire formateur décrit les défauts pédagogiques de la version de l’exercice ; le plugin ne les
détecte pas tous automatiquement. Sépare les observations complémentaires de
l’agent des résultats des contrôles génériques.

### Si je choisis mon projet

Retrouve d’abord le dossier du projet ou l’accès SSH déjà autorisé. Une URL seule
ne suffit pas. Pour SSH, annonce que la collecte du code est expérimentale et
qu’aucun build distant ou tunnel automatique n’est promis.

Demande uniquement ce qui manque pour avancer :

1. Quelle tâche la personne doit-elle réussir, et quelle confirmation doit-elle voir ?
2. Qui utilise ce produit, sur quel appareil et dans quel contexte ?
3. Quelles pages et quels comptes fictifs peux-tu tester ? Quelles actions sont permises ?

Inspecte le projet et sa procédure de démarrage. Prépare une instance locale ou
de test selon les autorisations ; ne démarre pas aveuglément des scripts inconnus.
Présente un plan court puis fais-le confirmer. Une confirmation explicite déjà
donnée pour le même périmètre reste valable. Utilise les six blocs : cohérence,
frictions, accessibilité, comportement, microcopie et performance. Signale les
contrôles indisponibles. Aucun test natif de téléphone n’est livré ; un aperçu web
d’une app mobile ne prouve pas sa qualité sur un téléphone natif.

## 5. Me remettre un résultat compréhensible

Affiche le vrai rapport HTML avec `serve-report`, sur loopback, et ouvre-le dans
mon navigateur si possible. Choisis un port libre. Conserve le chemin absolu du
rapport et son identifiant. Donne-moi ensuite trois priorités maximum, avec pour
chacune : problème, conséquence, preuve et piste d’amélioration.

Distingue les défauts observés, les hypothèses, les erreurs d’outils et les contrôles
manuels restants. Un score Lighthouse n’est pas un score UX global ; une absence de
constat ne prouve pas que le produit est correct.

En mode Débogage autorisé sur mon propre projet, appelle `get_debugging_plan` ou
`debug-plan` après l’audit initial, corrige dans le périmètre convenu, puis refais
les tests et l’audit sans changer leurs assertions pour les faire passer. Termine
avec `finish_debugging` ou `debug-finish`. Pour la cohérence, lis les écarts de styles et d’espacements, confirme les actions de même fonction et traite aussi les liens d’action. Vérifie les captures aux mêmes largeurs après correction. Lis completionStatus et designVerification : une vérification terminée ne signifie pas que tout est corrigé. Liste les fichiers modifiés, les problèmes
encore présents et les vérifications impossibles. Ne promets pas de tout corriger.

Je veux une explication simple de ce qui fonctionne et du prochain choix à faire,
pas une longue transcription de ton terminal.
