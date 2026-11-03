/**
 * Admin messages (fr) of the design file (P6 DESIGN, design.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/fr.ts;
 * a partial of ../en/design.ts (a missing key falls back to English).
 */
import type { messages as en } from "../en/design";

export const messages: Partial<Record<keyof typeof en, string>> = {
  "design.reveal.use": "Utiliser ce design",
  "design.reveal.analysing": "Lecture de vos photos",
  "design.reveal.error": "Les designs n’ont pas pu être préparés.",
  "design.reveal.retry": "Réessayer",
  "design.copy.C01": "Remplacez les tirets longs par un point, une virgule ou deux-points.",
  "design.copy.C02": "« {phrase} » sonne générique. Dites quelque chose de précis sur votre produit.",
  "design.copy.C03": "Plusieurs titres sont construits de la même façon. Variez-en un : une phrase simple, une consigne ou un mot court suivi d’une ligne.",
  "design.copy.C04": "Peu de phrases citent un vrai détail du produit. Ajoutez une matière, une taille, un parfum ou le mode de livraison et de paiement.",
  "design.copy.C05": "Gardez un seul point d’exclamation au plus, sur le dernier bouton.",
  "design.copy.C06": "Ce titre reprend une formulation d’une autre de vos pages.",
  "design.copy.C07": "Utilisez le point médian une fois par ligne au plus, et jamais dans un titre.",
  "design.copy.C08": "Ce titre ressemble à une formulation déjà en ligne sur une autre boutique.",
  "design.copy.C09": "Retirez l’emoji : la page se lit comme une boutique, pas comme un message.",
  "design.copy.D1": "Certains chiffres de la page ne font pas partie des informations que vous avez données. Vérifiez-les avant de publier.",
  "design.copy.D3": "Cette question et sa réponse sont écrites dans deux registres différents. Utilisez le même pour les deux.",
  "design.copy.D4": "L’article devant le nom du produit sonne faux. Choisissez « le » ou « la » pour le nom, ou reformulez.",
  "design.copy.N05": "Cette formulation est courante dans votre niche. Réécrivez-la avec vos mots pour vous démarquer.",
  "design.copy.fixPunctuation": "Corriger la ponctuation",
};
