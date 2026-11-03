/**
 * Admin messages (fr) of the console file (P1 CONSOLE, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/fr.ts;
 * a partial of ../en/console.ts (a missing key falls back to English). The console reads English in R1 (PD9); the
 * R1 risk and reason labels are written in all three locales already, with the English placeholders.
 */
import type { messages as en } from "../en/console";

export const messages: Partial<Record<keyof typeof en, string>> = {
  /* ---- store status reasons (PLA-§8.2) ---- */
  "console.reason.fake_orders": "Fausses commandes",
  "console.reason.customer_complaints": "Plaintes de clients",
  "console.reason.policy_review": "Examen des règles",
  "console.reason.brand_complaint": "Plainte d'une marque",
  "console.reason.other": "Autre",
  "console.reason.scam_suspected": "Arnaque suspectée",
  "console.reason.phishing": "Hameçonnage",
  "console.reason.prohibited_goods": "Produits interdits",
  "console.reason.counterfeit": "Contrefaçon",
  "console.reason.legal_request": "Demande légale",
  "console.reason.security_incident": "Incident de sécurité",
  "console.reason.owner_banned": "Propriétaire banni",
  "console.reason.issue_resolved": "Problème résolu",
  "console.reason.appeal_accepted": "Recours accepté",
  "console.reason.mistake": "Appliqué par erreur",
  "console.reason.owner_request": "Demande du propriétaire",
  "console.reason.abandoned": "Abandonnée",
  "console.reason.terms_violation": "Violation des conditions",
  "console.reason.retention": "Durée de conservation écoulée",
  "console.reason.owner_request_urgent": "Demande urgente du propriétaire",
  "console.reason.abuse": "Abus",
  "console.reason.approved": "Approuvée",
  "console.reason.rejected": "Refusée",
  "console.reason.appeal": "Recours",
  "console.reason.console_created": "Créée depuis la console",
  "console.reason.owner_closed": "Fermée par le propriétaire",
  "console.reason.expired": "Expirée",

  /* ---- signup risk flags (PLA-§3.4.1) ---- */
  "console.risk.disposable_email": "Domaine d'e-mail jetable {domain}",
  "console.risk.null_mx": "{domain} refuse tout e-mail (enregistrement MX nul)",
  "console.risk.no_mx": "{domain} n'a aucun serveur de messagerie",
  "console.risk.mx_unknown": "La vérification du serveur de messagerie n'a pas répondu à temps",
  "console.risk.brand_exact": "Utilise le nom protégé « {term} » dans {field}",
  "console.risk.brand_near": "Contient le terme protégé « {term} » dans {field}",
  "console.risk.offensive_term": "Un mot injurieux dans {field}",
  "console.risk.dup_email_norm": "{users, plural, one {# autre compte utilise} other {# autres comptes utilisent}} le même e-mail",
  "console.risk.dup_phone": "{users, plural, one {# autre compte partage} other {# autres comptes partagent}} ce téléphone",
  "console.risk.dup_network": "{users, plural, one {# autre compte inscrit} other {# autres comptes inscrits}} depuis ce réseau ces dernières 24 h",
  "console.risk.dup_device": "{users, plural, one {# autre compte utilise} other {# autres comptes utilisent}} cet appareil",
  "console.risk.linked_banned": "Lié à {banned, plural, one {# compte banni} other {# comptes bannis}}",
  "console.risk.velocity_network": "Déjà 3 inscriptions depuis ce réseau aujourd'hui",
  "console.risk.turnstile_missing": "Aucun jeton de vérification humaine",
  "console.risk.turnstile_unverified": "La vérification humaine a échoué",
  "console.risk.too_fast": "Formulaire rempli en {ms} ms, plus vite qu'une personne ne tape",
  "console.risk.fast": "Formulaire rempli en {ms} ms, en moins de 10 secondes",
  "console.risk.bot_ua": "Navigateur automatisé ({uaLabel})",
  "console.risk.no_ua": "Aucune identification du navigateur",
  "console.risk.phone_market_mismatch": "Téléphone de {phoneCountry}, marché de la boutique {market}",
  "console.risk.market_not_allowed": "Le marché {market} n'est pas ouvert aux inscriptions",
  "console.risk.invite_code": "Inscription avec un code d'invitation de la plateforme",
  "console.risk.trusted_creator": "Propriétaire d'une boutique établie, sans incident",
  "console.risk.mixed_script": "Mélange de lettres latines et cyrilliques ou grecques dans le nom de la boutique",
  "console.risk.field.store_name": "le nom de la boutique",
  "console.risk.field.handle": "l'identifiant",
  "console.risk.field.email": "l'adresse e-mail",

  /* ---- R1 : la page publique d'invitation du staff (PLA-§14.1) ---- */
  "console.staff.invite_invalid": "Cette invitation n'est plus valable. Demandez-en une nouvelle.",
  "console.staff.invite_sign_in_first": "Un compte utilise déjà cette adresse e-mail. Connectez-vous avec, puis rouvrez le lien.",
  "console.staff.invite_wrong_account": "Cette invitation est destinée à une autre adresse e-mail.",
};
