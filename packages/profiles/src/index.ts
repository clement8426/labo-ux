import type { Plan } from '../../contracts/src/index.js';
export const suggestions: Record<Plan['usage'], string[]> = {
  showcase: ['Comprendre l’offre', 'Trouver une information', 'Contacter avec des données fictives'],
  content: ['Rechercher un contenu', 'Consulter un article', 'Trouver un contenu lié'],
  ecommerce: ['Rechercher un produit', 'Choisir une variante', 'Ajouter au panier', 'Simuler une commande sur le backend de test'],
  saas: ['Se connecter avec un compte fictif', 'Réaliser une première action utile', 'Créer puis modifier un objet de test'],
  'business-app': ['Définir la tâche principale avec le propriétaire', 'Vérifier la reprise après interruption'],
  custom: ['Définir l’objectif, les préconditions et le résultat observable avec le propriétaire']
};
