# Architecture et garanties

Les contrats Zod versionnés constituent la frontière entre interfaces, nœuds et
rapports. Les cibles web, WebView, Android et iOS partagent un format ; les
capacités réellement exposées décident de l’exécution. L’usage du produit ne
participe jamais à la sélection technique.

Le moteur valide le graphe des dépendances obligatoires, inclut celles nécessaires
à une sélection et détecte les cycles. Une dépendance facultative ne bloque pas
l’ordonnancement. Un résultat partiel constitue une dépendance disponible, avec
ses limites conservées ; un check doit préciser ce qu’il peut exploiter.

L’ordonnanceur borne la concurrence. Une ressource nommée est exclusive dans un
audit ; les nœuds web partagent le verrou `browser` et sont donc sérialisés dans
cette version. `exclusive` attend la fin des autres tâches et bloque les nouveaux
démarrages pendant une mesure lourde. `device` se résout vers l’identifiant
d’appareil. Aucun pool distribué interprocessus n’est encore implémenté.

Chaque résultat validé est écrit dans un fichier propre par renommage atomique
après synchronisation du fichier temporaire. Une panne de génération HTML ne
supprime ni le JSON ni le Markdown. Les erreurs d’écriture d’un nœud sont signalées
dans les limites du run ; si le disque entier est indisponible, aucune garantie de
persistance ne peut être assurée. Les écritures atomiques supposent un système de
fichiers local avec renommage atomique ; NFS/partages réseau ne sont pas qualifiés.

Un verrou de run empêche la reprise simultanée. Son PID est vérifié ; un verrou
de processus disparu peut être repris. La réutilisation d’un PID peut imposer une
vérification manuelle. La comparaison du hash de sources et des versions des règles
empêche de réutiliser des résultats après une modification incompatible. Il n’y a
pas encore de migration automatique entre versions de schémas.

Le journal JSONL enregistre le démarrage et la fin des nœuds. Lors d’une reprise,
un parcours à effet de bord déjà démarré n’est pas rejoué, même si le processus est
mort avant d’écrire son résultat. Un journal corrompu empêche ces seuls parcours
de redémarrer ; les contrôles indépendants idempotents peuvent continuer.

Les tâches web tournent dans des processus enfants. Chaque parcours dispose de
son contexte navigateur, de sa trace et de captures. Une annulation ferme les
ressources connues, puis termine le processus si nécessaire. Les handlers
déterministes tournent dans le moteur : leur délai est coopératif, ils ne doivent
pas exécuter de code arbitraire ou d’outil susceptible de bloquer le processus.

Les prérequis absents donnent `skipped` avec une raison ; une cible incompatible
donne `not-applicable`. Une violation de règle produit laisse le nœud `completed`.
Une étape de parcours non trouvée génère une hypothèse documentée : précondition,
sélecteur, outil et produit peuvent chacun l’expliquer. Une panne d’axe ou Lighthouse
donne `error` ou `timed-out`, jamais une preuve que l’interface est correcte.

La collecte de sources est bornée à 3 000 fichiers, 512 Ko par fichier, 20 Mo au
total et 30 000 entrées visitées. Les liens symboliques, dépendances, environnements
et noms usuels de secrets sont exclus. Cette exclusion de noms n’est pas un
détecteur exhaustif de secrets. Les preuves restent des fichiers locaux.

SSH utilise un collecteur fixe en lecture seule sur un hôte POSIX avec Node.js et
authentification SSH déjà opérationnelle. Les paramètres sont échappés comme
données POSIX. Ni commande de build arbitraire, ni tunnel, ni worker mobile ne sont
installés. Une coupure du seul hôte de sources empêche de créer un snapshot et un
nouvel audit ; la résilience entre plusieurs hôtes indépendants relève du lot 6.

La comparaison refuse les deltas de mesures si les états, cibles, versions ou
outils diffèrent ; les variations de contexte déclarées empêchent aussi les
deltas. Cela ne prouve pas que l’environnement physique est identique. Une
disparition de constat dans un nœud non exécuté n’est pas une correction.

Les distributions locales reprennent les conventions documentées pour les
[plugins Codex](https://developers.openai.com/api/docs/guides/agents-api/tools/plugins)
et les [plugins Claude](https://code.claude.com/docs/en/plugins-reference).
