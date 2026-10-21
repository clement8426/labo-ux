# Diagnostics navigateur et export client

La section `technical` complète les six blocs UX. Chaque nœud s’exécute dans un
processus isolé ; une panne laisse les autres résultats disponibles.

- `technical.inspect-network` : deux chargements (contexte neuf puis rechargement),
  statuts, durées, octets signalés par Chrome et signaux de cache. Pas de corps,
  cookies ou en-têtes d’authentification ; paramètres et fragments des URLs retirés.
  Requêtes en cours et redirections non détaillées restent des limites.
- `technical.measure-memory` : deux instantanés espacés de 500 ms, tas JavaScript,
  documents, nœuds et écouteurs. Pas de RAM totale ni preuve de fuite mémoire.
- `technical.inspect-security` : en-têtes de la réponse, HTTP/HTTPS/local, erreurs
  navigateur et requêtes mixtes observées. Aucun test offensif, contrôle des droits
  ni certification. Les messages techniques bruts peuvent nécessiter une relecture.
- `technical.inspect-cache-source` : indices de configuration dans les fichiers
  accessibles. Présence d’une directive ou de Redis sans vérification de son effet.

Lighthouse produit un JSON, son rapport HTML officiel et une capture. Les quatre
catégories portent uniquement sur la page d’entrée. Les mesures retournées dans le
bloc performance restent ses cinq métriques explicites. Une capture indisponible
est signalée ; elle n’est pas remplacée par une image illustrative.

Le PDF est dérivé des résultats, sans nouvelle mesure. Il contient une synthèse,
le périmètre, les constats regroupés avec leurs preuves et recommandations, les
mesures, les limites et une sélection d’images. Un instantané du rendu ne suffit
pas à valider la qualité UX d’un produit. L’auteur doit interpréter les constats
dans le contexte métier avant de présenter ses recommandations au client.

Le serveur local expose `client.pdf` à la demande. La commande `export-pdf` et
l’outil MCP `export_audit_pdf` acceptent client, auteur et titre. Ces valeurs sont
conservées lors du téléchargement suivant. Les fichiers restent dans le dossier
de l’audit ; aucun envoi externe n’est effectué.

## Sources d’implémentation

- [CDP Network](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
- [CDP Performance](https://chromedevtools.github.io/devtools-protocol/tot/Performance/)
- [CDP Memory](https://chromedevtools.github.io/devtools-protocol/tot/Memory/)
- [Génération du rapport Lighthouse officiel](https://github.com/GoogleChrome/lighthouse/blob/main/report/README.md)
- [Export PDF avec Playwright](https://playwright.dev/docs/api/class-page#page-pdf)
