# Formats de données

Les schémas exécutables font autorité : `packages/contracts/src/index.ts`.
La configuration de la fixture est un exemple complet :
`fixtures/web-showcase/audit.json`.

## Parcours

Chaque parcours nomme sa cible, ses préconditions, un objectif observable et son
caractère mutateur. Le pilote web accepte `open-target`, `open-url`, `activate`,
`enter-text`, `select`, `scroll`, `go-back`, `expect-visible`, `expect-text`,
`expect-state` et `checkpoint`. Une étape d’action ne prouve que l’action a été
effectuée ; ajouter une assertion explicite pour vérifier son résultat.

`checkpoint` produit une capture dans `friction.run-journey`. Le contrôle distinct
`a11y.scan-journey-states` rejoue les parcours jusqu’à leur dernier checkpoint et
y lance axe. Les actions peuvent donc être exécutées une nouvelle fois dans un
contexte isolé ; déclarer les mutations et employer uniquement des données de test.

Les sélecteurs sont un `testId`, un rôle avec son nom accessible, ou un texte exact.
Pas de JavaScript arbitraire, CSS libre ou coordonnées fixes. Les URL sont limitées
à l’origine déclarée pour la navigation explicite du parcours. Une redirection
du serveur ou le clic sur un lien peut néanmoins quitter cette origine : le pilote
n’est pas un pare-feu réseau. Ne viser que l’instance de test autorisée.

Les actions natives sont admises par le contrat commun, mais un parcours qui en
contient n’est pas lancé par le pilote web ; il est signalé avec cette limite,
sans remplacement approximatif. Les chemins de capture sont produits par le
moteur et ne proviennent pas d’un chemin libre contenu dans le parcours.

## Événements

JSON : tableau d’objets, ou CSV UTF-8 séparé par virgules avec en-têtes :

```json
{
  "id": "event-0001",
  "userId": "user-fictif",
  "sessionId": "session-fictive",
  "name": "contact_open",
  "timestamp": "2026-10-01T10:00:00Z",
  "platform": "web"
}
```

`id`, `userId`, `sessionId`, `name` et timestamp ISO avec fuseau sont obligatoires.
`platform` vaut `unknown` si absente. Les identifiants d’événement sont uniques
dans l’export ; un doublon de cet identifiant conserve le premier événement et est
compté. Les événements non valides font échouer uniquement le contrôle d’import/tunnel.

Le tunnel compte des sessions distinctes ayant atteint chaque étape dans l’ordre.
Une session contient un utilisateur et une plateforme ; elle n’est jamais fusionnée
avec la session homonyme d’un autre utilisateur. Le meilleur départ valide permet
une reprise après expiration d’une première fenêtre. La conversion est le nombre
de sessions de la dernière étape divisé par celui de la première. Sans entrée,
aucune mesure de conversion n’est produite. Les événements de même timestamp sont
ordonnés par id ; utiliser des timestamps suffisamment précis si l’ordre est critique.

## Provenance des résultats

`measurement`, `runtime-observation`, `source-analysis`, `ai-assessment` distinguent
la nature des preuves. Le moteur déterministe ne produit pas d’appréciation IA.
Un finding référence au moins une preuve et porte `confirmed` ou `hypothesis`.
Les limitations et erreurs ne sont pas des findings produit. Les unités et contextes
des mesures sont conservés ; aucune agrégation entre plateformes n’est calculée.
