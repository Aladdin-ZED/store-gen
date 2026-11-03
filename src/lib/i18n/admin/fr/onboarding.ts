/**
 * Admin messages (fr) of the onboarding file (P2 SHELL, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/fr.ts.
 * R1-complete (PLA-§N.1, §22.2): typed against every key of ../en/onboarding.ts.
 */
import type { messages as en } from "../en/onboarding";

export const messages: { [K in keyof typeof en]: string } = {
  "onboarding.meta": "Bienvenue",
  "onboarding.continue": "Continuer",
  "onboarding.back": "Retour",
  "onboarding.saving": "Enregistrement…",
  "onboarding.skip": "Passer pour le moment",
  "onboarding.done": "Aller à mon tableau de bord",
  "onboarding.progress": "Progression de la configuration",

  /* ---- photos ---- */
  "onboarding.photos.title": "Déposez 1 à 5 photos du produit",
  "onboarding.photos.hint": "Des photos nettes du produit donnent le meilleur résultat. Les photos prises au téléphone conviennent.",
  "onboarding.photos.pick": "Choisir des photos",
  "onboarding.photos.camera": "Prendre une photo",
  "onboarding.photos.skip": "Commencer sans photos",
  "onboarding.photos.uploading": "{count, plural, one {Envoi de # photo…} other {Envoi de # photos…}}",
  "onboarding.photos.failed": "Cette photo n'a pas pu être envoyée. Essayez-en une autre.",
  "onboarding.photos.too_many": "5 photos au maximum. Retirez-en une pour en ajouter une autre.",
  "onboarding.photos.remove": "Retirer la photo",
  "onboarding.analyzing": "Analyse de vos photos…",
  "onboarding.refining": "Affinage des suggestions",

  /* ---- détails ---- */
  "onboarding.category.title": "Que vendez-vous ?",
  "onboarding.category.suggested": "Suggérée",
  "onboarding.category.hint": "Touchez-en une pour continuer.",
  "onboarding.product_name": "Nom du produit",
  "onboarding.use_suggestion": "Utiliser la suggestion",
  "onboarding.price": "Prix",
  "onboarding.price_hint": "Le prix que paient vos clients, en {currency}.",
  "onboarding.price_required": "Saisissez le prix auquel vous vendez.",
  "onboarding.compare_at": "Prix avant (facultatif)",
  "onboarding.compare_hint": "Uniquement un prix auquel vous avez vraiment vendu.",
  "onboarding.compare_invalid": "Le prix avant doit être plus élevé que le prix.",
  "onboarding.name_required": "Saisissez le nom du produit.",
  "onboarding.price_changed": "Le prix a changé depuis la création de ces designs. Affichez de nouveau les designs.",
  "onboarding.photos.missing": "Une photo a été retirée de la médiathèque. Ajoutez-la de nouveau.",
  "onboarding.fact": "Une information sur le produit (facultatif)",
  "onboarding.fact_hint": "Une chose vraie qu'un client doit savoir, comme la taille ou le contenu de la boîte.",
  "onboarding.suggested_facts": "Suggestions à cocher",

  /* ---- révélation ---- */
  "onboarding.reveal.title": "Voici votre page",
  "onboarding.reveal.analysing": "Préparation de trois designs…",
  "onboarding.reveal.error": "Les designs n'ont pas pu être préparés.",
  "onboarding.reveal.retry": "Réessayer",
  "onboarding.reveal.direction": "Design {n}",
  "onboarding.reveal.prev": "Design précédent",
  "onboarding.reveal.next": "Design suivant",
  "onboarding.reveal.use": "Choisir ce design",
  "onboarding.reveal.more": "Voir 3 autres",
  "onboarding.reveal.dna": "Pourquoi ce design",
  "onboarding.reveal.saved": "Votre page est enregistrée en brouillon. La publication s'ouvre après validation.",
  "onboarding.reveal.saved_product": "Votre premier produit et sa page sont enregistrés en brouillon ; l'accueil de votre boutique est en cours de création. La publication s'ouvre après validation.",
  "onboarding.reveal.saved_sales_page": "Votre première page est une page de vente ; l'accueil de votre boutique est en cours de création. La publication s'ouvre après validation.",
  "onboarding.reveal.submit": "Envoyer pour vérification",
  "onboarding.reveal.builder": "Ouvrir dans l'éditeur",

  /* ---- contact ---- */
  "onboarding.contact.title": "Où vos clients peuvent-ils vous joindre ?",
  "onboarding.contact.whatsapp": "Numéro WhatsApp",
  "onboarding.contact.hint": "Vos clients le touchent sur vos pages pour poser une question ou confirmer une commande.",
  "onboarding.contact.use_phone": "Utiliser mon numéro {phone} pour les commandes WhatsApp",
  "onboarding.fee_note": "Ajoutez vos frais de livraison dans Commande et livraison quand vous les connaissez.",

  /* ---- terminé ---- */
  "onboarding.done_title": "Votre boutique est prête à être construite",
  "onboarding.done_lead": "Voici ce qui est prêt et ce qu'il reste à faire.",
};
