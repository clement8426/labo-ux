# Labo UX

Kit d’audit UX modulaire en TypeScript, avec CLI, serveur MCP local et skill commun
aux distributions locales Codex et Claude. Version **0.3.1** : diagnostics navigateur,
rapport Lighthouse illustré et PDF client, en plus des modes audit/débogage et de
l’installation guidée par l’agent. Le plan complet n’est pas encore
livré ; voir [l’état des lots](docs/roadmap.md) et [la compatibilité](docs/compatibility.md).

Le moteur travaille sans modèle IA. Une vérification en panne ou indisponible
laisse les autres continuer. Les constats du produit sont distincts des erreurs
d’outils. Les résultats sont enregistrés après chaque nœud et les rapports JSON,
Markdown et HTML restent consultables pour les audits partiels.

## Rapport pour un client

Dans le rapport servi par `serve-report`, **PDF client** crée un document A4
autonome : synthèse, périmètre, constats et recommandations point par point,
références de preuves, sélection de captures et limites. Aucun audit n’est relancé.
Playwright et Chromium sont nécessaires à cet export ; s’ils manquent, l’HTML et
les preuves restent disponibles. Utiliser le bouton depuis le serveur local ou
après un export explicite ; un HTML ouvert seul ne peut pas lancer Node.

```sh
node dist/packages/cli/src/index.js export-pdf <runId> --output <dossier-des-audits> --client "Nom du client" --author "Votre agence"
```

L’agent dispose aussi de `export_audit_pdf` en MCP. Le PDF et son HTML imprimable
sont enregistrés dans le dossier de cet audit (`client.pdf`, `client.html`).
Les constats de même titre/cible/bloc/confiance sont regroupés avec leurs preuves ;
cela ne prouve pas une cause unique. Le document embarque au plus 8 captures,
5 Mo par image et 20 Mo au total. Les preuves brutes restent séparées.

Lighthouse conserve son JSON, son **rapport HTML officiel** et une capture de ce
rapport si le rendu réussit. Les catégories performance, accessibilité, bonnes
pratiques et SEO portent sur une page d’entrée. Leurs scores ne constituent ni
un score UX ni une certification de sécurité.

La section **Diagnostics techniques complémentaires** reste distincte des six
blocs UX : réseau/cache à froid et au rechargement, instantanés du tas JavaScript
et du DOM, en-têtes de sécurité et erreurs navigateur, indices de cache dans les
sources. `technical` est sélectionné par défaut dans un nouveau plan ; l’omettre
de `blocks` limite le périmètre aux six blocs UX. Un ancien plan à six blocs est
respecté. Tous les panneaux DevTools ne sont pas reproduits : heap snapshots,
tests de fuite, traces CPU détaillées, audits de droits et pentests ne sont pas
implémentés. Les données réseau sont réduites et les URLs y perdent leurs
paramètres ; relire les messages techniques bruts avant de partager ce dossier.

Les applications pédagogiques sont dans le dépôt séparé
[labo-ux-demos](https://github.com/clement8426/labo-ux-demos). Il propose
les démos **Les mains libres**, réservation d’ateliers, et **PULSE**,
coaching sportif avec personnalisation et abonnement fictif. Elles ont une
interface soignée, 24 familles de défauts documentées, un mode corrigé et un
auto-test de référence (`npm run verify` depuis ce dépôt de démos). Cloner et
installer ce plugin ne récupère ni les apps ni leurs dépendances React/Expo.
L’exercice court **Traverse**, en Next.js, est disponible dans `exercices/traverse` :
31 points pédagogiques connus et une seule version volontairement cassée.
Les démos servent aussi aux cours ; une qualification
réussie retrouve les défauts attendus et conserve les limites manuelles/natives.

## Installation

### Pour les apprenants : donner le travail à l’agent

Télécharger ou ouvrir [PROMPT.md](PROMPT.md), puis le joindre à son agent local avec
la phrase : **« Suis ce fichier, installe Labo UX et montre-moi un premier audit. »**
L’agent fait les commandes et les vérifications. L’apprenant n’a pas à utiliser
un terminal. L’agent doit avoir les droits nécessaires sur les fichiers, le terminal,
le navigateur et le dépôt GitHub. Un chat sans outils locaux ne suffit pas.
Un dépôt privé demande un accès GitHub accordé par le formateur.

Le script `node scripts/setup.mjs`, exécuté par l’agent, prépare le moteur et
Chromium puis réalise un audit de contrôle avec axe, Lighthouse et un parcours
fictif. Son résultat se trouve dans `.labo-ux/setup.json`, avec le lien du rapport.
Le CLI peut être utilisé immédiatement, sans configurer de MCP ni redémarrer l’hôte.

### Installation manuelle pour le formateur

Node.js 22 ou supérieur ; tester de préférence avec Node 24.

```sh
git clone https://github.com/clement8426/labo-ux.git
cd labo-ux
npm ci
npm run build
node dist/packages/cli/src/index.js --help
```

Les dépendances Playwright, axe et Lighthouse sont facultatives. Pour un audit du
code seul : `npm ci --omit=optional`. Pour les tests dynamiques web, installer Chromium :

```sh
npx playwright install chromium
# Sous Linux en CI, utiliser : npx playwright install --with-deps chromium
```

Aucun SDK mobile n’est téléchargé. Le kit ne démarre pas les scripts d’un projet
inconnu et ne compile pas automatiquement : démarrer son instance de test selon
sa procédure existante, puis fournir `baseUrl`. L’accès au dossier du projet reste
obligatoire ; une URL seule n’est pas une entrée suffisante.

Pour les démonstrations, cloner facultativement `labo-ux-demos` à côté de ce
dossier et suivre son README. Les deux dépôts ont leur propre Git et leur propre CI.
Le plugin peut auditer n’importe quel projet compatible sans installer les démos.

## Première démonstration

Dans un terminal, lancer `node scripts/serve-fixture.mjs`. Dans un autre :

```sh
npm run demo
```

La configuration de démonstration est déjà confirmée, utilise uniquement des
données fictives et vise `http://127.0.0.1:4178`. Le rapport se trouve dans
`.labo-ux/demo/<runId>/report.html` ; les autres formats sont voisins. La fixture
contient une image sans alternative et un libellé vague. L’ajout de `?clean` à
l’URL corrige le rendu de ces défauts. Le tunnel attendu est `[2, 2, 1]`, soit 0,5.
Les heuristiques du code restent des hypothèses, même si le rendu est corrigé.

## Auditer son projet

```sh
node dist/packages/cli/src/index.js init --root ../mon-projet --usage showcase --config audit.json
node dist/packages/cli/src/index.js inspect ../mon-projet
node dist/packages/cli/src/index.js doctor --config audit.json
node dist/packages/cli/src/index.js plan --config audit.json
```

Compléter `audit.json` : cibles, URL de test, parcours, données fictives, objectifs
et préconditions. Les chemins `projectRoot` et `outputDir` sont relatifs au fichier
de configuration ; les racines des cibles sont relatives à `projectRoot`. Le fichier
comportemental est relatif au `projectRoot` **local**, y compris en mode SSH.

Une fois le plan et sa couverture revus, sa confirmation explicite et son lancement :

```sh
node dist/packages/cli/src/index.js plan --config audit.json --confirm
node dist/packages/cli/src/index.js run --config audit.json
```

`permissions.runtime` autorise l’ouverture du navigateur. Un parcours déclaré avec
`mutatesData: true` exige également `permissions.dataMutation: true`. Le moteur ne
peut pas déduire les effets de bord d’un bouton ni vérifier automatiquement les
préconditions métier ; déclarer les mutations et utiliser une instance de test.

Sélection : `run --target app-web --block accessibility,microcopy --check a11y.scan-screen`
ou `--journey contact`. Les dépendances obligatoires sont incluses ; les options
ne changent pas les capacités disponibles. La sélection n’ajoute aucun contrôle
non confirmé au plan.

```sh
node dist/packages/cli/src/index.js status <runId> --output .labo-ux
node dist/packages/cli/src/index.js resume <runId> --output .labo-ux
node dist/packages/cli/src/index.js report <runId> --output .labo-ux
node dist/packages/cli/src/index.js compare <avant> <apres> --output .labo-ux
node dist/packages/cli/src/index.js checks list
node dist/packages/cli/src/index.js adapters list
```

Ctrl+C annule l’audit et conserve les résultats. La reprise garde les nœuds achevés,
retente les erreurs et prérequis désormais disponibles, et refuse les sources ou
règles modifiées. Un nœud de parcours précédemment interrompu n’est pas rejoué
automatiquement : rétablir les préconditions et créer un nouvel audit. Les fichiers
de résultats corrompus sont isolés et signalés. Une copie de travail modifiée,
même sur une ligne sans effet fonctionnel, impose un nouvel audit.

Le statut `partial` est normal si des contrôles sont ignorés ou si l’analyse reste
heuristique. Le CLI retourne 0 pour un audit enregistré, même partiel ou comportant
des défauts ; 1 pour une erreur de commande/configuration, 130 pour l’annulation.
Ne pas utiliser le code de sortie seul comme seuil de qualité produit.

## MCP et agents

### Deux modes : audit ou débogage

- **Audit** (par défaut) : lecture du projet, tests autorisés et rapports ; aucune
  réécriture du code. Les données fictives de test restent soumises à `dataMutation`.
- **Débogage** : audit initial obligatoire, corrections par l’agent hôte, tests,
  nouvel audit du même protocole et compte rendu avant/après. Le moteur n’édite pas
  lui-même les sources et ne promet pas de tout corriger.

Dans le plan : `mode: "audit"` avec `permissions.codeModification: false`, ou
`mode: "debug"` avec `permissions.codeModification: true`. Les combinaisons
contradictoires sont refusées. Ces permissions sont le contrat de l’agent hôte ;
le plugin ne peut pas verrouiller les outils d’édition indépendants de cet agent.

```sh
# Audit seul, sans réécriture
node dist/packages/cli/src/index.js run --config audit.json --mode audit

# Audit initial d’un débogage autorisé, puis préparation du travail de l’agent
node dist/packages/cli/src/index.js run --config audit.json --mode debug --allow-code-changes
node dist/packages/cli/src/index.js debug-plan <avant> --output .labo-ux

# Après les corrections réalisées par l’agent et le nouvel audit :
node dist/packages/cli/src/index.js debug-finish <avant> <apres> --changes fichiers.json --output .labo-ux

# Ouvrir un rapport existant sans relancer les tests
node dist/packages/cli/src/index.js serve-report <runId> --output .labo-ux --port 4193
```

`fichiers.json` contient les chemins relatifs et explications, par exemple
`[{"file":"app/page.tsx","summary":"Libellé du bouton précisé"}]`. Cette liste est
déclarative ; les constats corrigés sont étayés séparément par la comparaison.
Le débogage refuse de se terminer avec le même audit, des sources inchangées ou
un protocole différent. Une vérification partielle ou un outil indisponible reste
visible ; il n’est pas converti en correction réussie.

En MCP, utiliser `get_debugging_plan` après la fin de l’audit initial en mode debug,
puis `finish_debugging` après les corrections et le nouvel audit. Le skill commun
orchestre ces étapes avec les outils d’édition de l’agent. Un exercice qui doit
rester volontairement cassé, comme Traverse, reste en mode Audit.

Lancer le serveur avec `node /chemin/absolu/labo-ux/dist/packages/mcp-server/src/index.js`.
Le transport est stdio ; stdout est réservé au protocole. Exemple de configuration :

```json
{
  "mcpServers": {
    "labo-ux": {
      "command": "node",
      "args": ["/chemin/absolu/labo-ux/dist/packages/mcp-server/src/index.js"]
    }
  }
}
```

Les outils d’inspection, couverture, démarrage, état, résultats filtrés, annulation,
preuves et comparaison utilisent le même registre et le même moteur que le CLI.
`start_audit` retourne immédiatement `runId` et `outputDir`. Les preuves sont
consultables séparément avec `get_audit_evidence`. L’annulation MCP vise les audits
du processus actif ; après son arrêt, la reprise passe par le CLI.

Le skill commun est [skills/ux-audit/SKILL.md](skills/ux-audit/SKILL.md). Générer les
distributions locales avec `npm run plugins:build`, puis `npm run plugins:check`.
Les dossiers `plugins/codex` et `plugins/claude` contiennent la copie du skill et
référencent **une seule installation du moteur** par chemin absolu. Régénérer après
déplacement ; ce ne sont pas des archives autonomes publiables. L’installation
dans les interfaces Codex/Claude et la publication ne sont pas effectuées par ce dépôt.

## Développement

```sh
npm run plugins:build
npm run check
npm pack --dry-run
```

Les tests de résilience et du MCP fonctionnent sans modèle IA. L’intégration web
réelle se lance lorsque Chromium est installé, sinon elle est explicitement ignorée.
La CI installe Chromium et exécute ces tests sur Windows, Linux et macOS. Les mesures
Lighthouse sont vérifiées sans seuil numérique exact et restent des mesures de laboratoire.

Les packages privés du workspace séparent contrats, découverte, adaptateurs,
vérifications, parcours, profils, moteur, rapports et interfaces. Pour ajouter un
contrôle, utiliser `define` dans `packages/checks`, déclarer son contrat et ses
capacités, l’ajouter au registre et tester son résultat ; aucun changement du moteur
n’est nécessaire. Les outils externes s’exécutent dans un processus isolé. Les
handlers en mémoire sont réservés aux tâches déterministes bornées et doivent
respecter AbortSignal ; un délai JavaScript ne préempte pas une boucle CPU synchrone.

Les rapports et traces peuvent contenir le contenu de l’instance de test. Ils
restent locaux et sont exclus de Git ; aucun résultat n’est envoyé à un modèle.

### Exercice Next.js Traverse

`labo-ux-demos/exercices/traverse` propose un exercice court, uniquement cassé,
avec consigne apprenant, prompt, inventaire des défauts et qualification réelle.
Le contrôle `performance.inspect-resources` documente les images et leurs headers.
Le contrôle `a11y.scan-journey-states` analyse les checkpoints explicitement placés
dans les parcours, jusqu’au dernier checkpoint ; `friction.run-journey` garde la
responsabilité de vérifier les assertions finales. Ces contrôles sont indépendants
et consultables via `checks list` / MCP `list_checks`. Ils ne remplacent pas les
tests manuels et ne promettent pas de retrouver tous les défauts UX.

Documentation : [architecture](docs/architecture.md), [compatibilité](docs/compatibility.md),
[lots restants](docs/roadmap.md), [format des parcours et événements](docs/formats.md).

## Cohérence des composants (0.3.1)

Le contrôle des styles compare les boutons, liens d’action et espacements des composants répétés, à deux largeurs par défaut. Les différences observées apparaissent dans le rapport et le plan de correction, avec leurs sélecteurs, valeurs et captures. Les variantes intentionnelles restent à confirmer. Voir [le périmètre et les groupes entre pages](skills/ux-audit/references/design-consistency.md).

Le bilan de débogage expose les écarts restants et une conclusion explicite sur la couverture. Une exécution terminée ne signifie pas que tout le produit est corrigé.
