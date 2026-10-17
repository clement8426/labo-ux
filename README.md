# Labo UX

Kit d’audit UX modulaire en TypeScript, avec CLI, serveur MCP local et skill commun
aux distributions locales Codex et Claude. Version **0.1.0** : socle résilient et
premières intégrations web réellement exécutables. Le plan complet n’est pas encore
livré ; voir [l’état des lots](docs/roadmap.md) et [la compatibilité](docs/compatibility.md).

Le moteur travaille sans modèle IA. Une vérification en panne ou indisponible
laisse les autres continuer. Les constats du produit sont distincts des erreurs
d’outils. Les résultats sont enregistrés après chaque nœud et les rapports JSON,
Markdown et HTML restent consultables pour les audits partiels.

Les applications pédagogiques sont dans le dépôt séparé
[labo-ux-demos](https://github.com/clement8426/labo-ux-demos). Il propose
deux univers distincts : **Les mains libres**, réservation d’ateliers, et **PULSE**,
coaching sportif avec personnalisation et abonnement fictif. Elles ont une
interface soignée, 24 familles de défauts documentées, un mode corrigé et un
auto-test de référence (`npm run verify` depuis ce dépôt de démos). Cloner et
installer ce plugin ne récupère ni les apps ni leurs dépendances React/Expo.
Les démos servent aussi aux cours ; une qualification
réussie retrouve les défauts attendus et conserve les limites manuelles/natives.

## Installation

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

Documentation : [architecture](docs/architecture.md), [compatibilité](docs/compatibility.md),
[lots restants](docs/roadmap.md), [format des parcours et événements](docs/formats.md).
