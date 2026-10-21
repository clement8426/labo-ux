# Cohérence des actions et espacements

`design.collect-styles`, règle 2.0.0, conserve un inventaire compatible
`styles.json` et compare les familles de composants de structure répétée.
Les boutons, liens d’action et commandes avec `role="button"` sont inclus.
Le contrôle produit des captures et `design-*.json` avec les sélecteurs, styles
calculés, groupes, page et viewport observés.

Par défaut : page d’entrée à 1280 × 900 et 375 × 812 CSS px. Les viewports sont
comparés séparément. La hauteur liée à un texte plus long n’est pas une anomalie
à elle seule. Les familles sont une heuristique structurelle ; leur équivalence
métier et le caractère intentionnel des variantes restent à confirmer.

## Périmètre explicite du plan

```json
{
  "design": {
    "pages": ["/catalogue", "/contact"],
    "viewports": [{ "width": 1280, "height": 900 }, { "width": 375, "height": 812 }],
    "groups": [{ "id": "poursuivre", "selector": "[data-action='poursuivre']" }]
  }
}
```

Les pages s’ajoutent à l’entrée et doivent rester sur la même origine. Maximum
8 pages supplémentaires, 3 viewports et 20 groupes déclarés. Une configuration
invalide, une page inaccessible ou un groupe introuvable doit être corrigé ou
annoncé comme incomplet. Le contrôle ne clique pas et ne rejoue pas les parcours.
Les états protégés, ouverts, au survol ou au focus exigent une observation dédiée.

Un groupe déclaré compare des actions dont le rôle commun a été établi, y compris
entre pages, à viewport identique. Ne pas réunir une action principale, une action
secondaire et une suppression parce qu’elles sont toutes des boutons.

## Correction et vérification

Les écarts de styles et d’espacements deviennent des constats `hypothesis` avec
leurs preuves. Ils sont inclus dans le plan de débogage ; l’agent confirme
l’intention, applique les corrections autorisées, puis relance le même protocole.

Le bilan conserve les écarts restants. `completionStatus: corrections-incomplete`
signifie que des constats subsistent. `designVerification` distingue les différences
restantes, une vérification incomplète et l’absence d’écart détecté dans le périmètre.
Une baisse du nombre de groupes comparés ne prouve pas une correction : un changement
de structure peut empêcher leur reconnaissance. Les audits de la règle 1.0.0 et
de la règle 2.0.0 ne sont pas directement comparables.

Les tests utilisent une fixture indépendante de Traverse : écarts entre liens,
espacements des cartes, variantes mobiles, groupes entre pages, conservation des
alertes après une modification sans correction et disparition après harmonisation.
