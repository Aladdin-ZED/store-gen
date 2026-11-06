/**
 * The store templates (P1 CONSOLE; platform.md PLA-§13.4, PD49; landing.md LAN-§3.3): the starting texts of a store's
 * policy pages (privacy, terms of sale, delivery, returns, contact) in ar / fr / en, seeded as version 1 drafts flagged
 * `needs_legal_review` (./index.ts). The store's own answers come in through `{{field}}` placeholders, each one of P3's
 * `POLICY_TEMPLATE_FIELDS` (src/lib/policies/fields.ts), filled by P3's renderer from the store's `policies` setting;
 * the template never states a delivery time, a fee, a return window or a warranty of its own (owner rule: never invent
 * a promise; LD29: `policies` is the single source of every promise). Each fact sits on a "Label: {{field}}" line, so
 * the line reads the same whatever form the renderer gives the value. The returns template carries the Moroccan
 * withdrawal note of LAN-§3.3 (law 31-08), which the legal review confirms. Markdown-lite only, no link.
 */
import type { LegalSeedDoc } from "./index";

const PRIVACY_EN = `# Privacy

This store collects the information it needs to handle your order: your name, phone number, city, address and any note you add.

## How it is used

- To confirm your order, by phone or WhatsApp.
- To deliver it: your name, phone number and address are given to the delivery company.
- For after-sales service, if you contact the store.

The store does not sell your information.

## How long it is kept

As long as the store needs it for your order, its after-sales service and its accounting obligations.

## Your choices

You can ask the store to correct or delete your information, using the contact details on its contact page.`;

const PRIVACY_FR = `# Confidentialité

Cette boutique recueille les informations nécessaires pour traiter votre commande : votre nom, votre numéro de téléphone, votre ville, votre adresse et une éventuelle note.

## Utilisation

- Pour confirmer votre commande, par téléphone ou WhatsApp.
- Pour la livrer : votre nom, votre numéro de téléphone et votre adresse sont transmis à la société de livraison.
- Pour le service après-vente, si vous contactez la boutique.

La boutique ne vend pas vos informations.

## Durée de conservation

Aussi longtemps que la boutique en a besoin pour votre commande, son service après-vente et ses obligations comptables.

## Vos choix

Vous pouvez demander à la boutique de corriger ou de supprimer vos informations, avec les coordonnées de sa page de contact.`;

const PRIVACY_AR = `# الخصوصية

يجمع هذا المتجر المعلومات التي يحتاجها لمعالجة طلبك: اسمك ورقم هاتفك ومدينتك وعنوانك وأي ملاحظة تضيفها.

## كيف تُستعمل

- لتأكيد طلبك، بالهاتف أو عبر واتساب.
- لتوصيله: يُسلَّم اسمك ورقم هاتفك وعنوانك إلى شركة التوصيل.
- لخدمة ما بعد البيع، إذا تواصلت مع المتجر.

لا يبيع المتجر معلوماتك.

## مدة الاحتفاظ بها

ما دام المتجر يحتاجها لطلبك ولخدمة ما بعد البيع ولالتزاماته المحاسبية.

## اختياراتك

يمكنك أن تطلب من المتجر تصحيح معلوماتك أو حذفها، عبر وسائل الاتصال المذكورة في صفحة الاتصال.`;

const TERMS_EN = `# Terms of sale

## Ordering

You order on the store's page. The store may contact you to confirm the order before sending it.

## Price and payment

- The price is the one shown on the page when you order, in the store's currency.
- You pay cash on delivery, to the courier.
- Open and check the parcel before paying: {{inspection}}

## Delivery and returns

The delivery and returns pages give the store's answers on where it delivers, how long it takes and what happens if the product does not suit you.`;

const TERMS_FR = `# Conditions de vente

## Commande

Vous commandez sur la page de la boutique. La boutique peut vous contacter pour confirmer la commande avant de l'expédier.

## Prix et paiement

- Le prix est celui affiché sur la page au moment de la commande, dans la devise de la boutique.
- Vous payez à la livraison, au livreur.
- Ouvrir et vérifier le colis avant de payer : {{inspection}}

## Livraison et retours

Les pages livraison et retours donnent les réponses de la boutique : où elle livre, en combien de temps, et ce qui se passe si le produit ne vous convient pas.`;

const TERMS_AR = `# شروط البيع

## الطلب

تطلب من صفحة المتجر. وقد يتواصل معك المتجر لتأكيد الطلب قبل إرساله.

## السعر والدفع

- السعر هو المعروض في الصفحة عند الطلب، بعملة المتجر.
- تدفع نقدًا عند الاستلام، لعامل التوصيل.
- فتح الطرد وفحصه قبل الدفع: {{inspection}}

## التوصيل والإرجاع

تعرض صفحتا التوصيل والإرجاع أجوبة المتجر: أين يوصل، وكم يستغرق التوصيل، وما الذي يحدث إذا لم يناسبك المنتج.`;

const SHIPPING_EN = `# Delivery

- Where the store delivers: {{delivery.coverage}}
- Usual delivery time: {{delivery.typicalDays}}
- Free delivery from: {{delivery.freeFromCents}}
- Open and check the parcel before paying: {{inspection}}

You pay cash on delivery.`;

const SHIPPING_FR = `# Livraison

- Où la boutique livre : {{delivery.coverage}}
- Délai de livraison habituel : {{delivery.typicalDays}}
- Livraison gratuite à partir de : {{delivery.freeFromCents}}
- Ouvrir et vérifier le colis avant de payer : {{inspection}}

Vous payez à la livraison.`;

const SHIPPING_AR = `# التوصيل

- أين يوصل المتجر: {{delivery.coverage}}
- مدة التوصيل المعتادة: {{delivery.typicalDays}}
- التوصيل مجاني ابتداءً من: {{delivery.freeFromCents}}
- فتح الطرد وفحصه قبل الدفع: {{inspection}}

تدفع نقدًا عند الاستلام.`;

const RETURNS_EN = `# Returns and refunds

## Returns

- Returns accepted: {{returns.accepted}}
- Return window: {{returns.windowDays}}
- Return delivery paid by: {{returns.whoPays}}

## Exchanges

- Exchanges accepted: {{exchange.accepted}}
- Exchange window: {{exchange.windowDays}}

## Refunds

- Refund method: {{refund.method}}
- Refunded within: {{refund.withinDays}}

## Warranty

- Warranty: {{warranty.months}}

## The law

Moroccan law 31-08 gives buyers of distance sales a withdrawal period (7 days in general).

To return or exchange a product, contact the store using its contact page.`;

const RETURNS_FR = `# Retours et remboursements

## Retours

- Retours acceptés : {{returns.accepted}}
- Délai de retour : {{returns.windowDays}}
- Frais de retour à la charge de : {{returns.whoPays}}

## Échanges

- Échanges acceptés : {{exchange.accepted}}
- Délai d'échange : {{exchange.windowDays}}

## Remboursements

- Mode de remboursement : {{refund.method}}
- Remboursé sous : {{refund.withinDays}}

## Garantie

- Garantie : {{warranty.months}}

## La loi

La loi marocaine 31-08 accorde aux acheteurs à distance un délai de rétractation (7 jours en général).

Pour retourner ou échanger un produit, contactez la boutique depuis sa page de contact.`;

const RETURNS_AR = `# الإرجاع والاسترداد

## الإرجاع

- قبول الإرجاع: {{returns.accepted}}
- مهلة الإرجاع: {{returns.windowDays}}
- تكلفة إعادة الإرسال على: {{returns.whoPays}}

## الاستبدال

- قبول الاستبدال: {{exchange.accepted}}
- مهلة الاستبدال: {{exchange.windowDays}}

## الاسترداد

- طريقة الاسترداد: {{refund.method}}
- مدة الاسترداد: {{refund.withinDays}}

## الضمان

- الضمان: {{warranty.months}}

## القانون

يمنح القانون المغربي 31-08 المشترين عن بعد مهلة للتراجع (7 أيام بشكل عام).

لإرجاع منتج أو استبداله، تواصل مع المتجر عبر صفحة الاتصال.`;

const CONTACT_EN = `# Contact

For a question about an order, a delivery or a return, contact the store using the details on this page. Keep your order number at hand: it helps the store find your order.`;

const CONTACT_FR = `# Contact

Pour une question sur une commande, une livraison ou un retour, contactez la boutique avec les coordonnées de cette page. Gardez votre numéro de commande à portée de main : il aide la boutique à retrouver votre commande.`;

const CONTACT_AR = `# الاتصال

لأي سؤال عن طلب أو توصيل أو إرجاع، تواصل مع المتجر عبر المعلومات الموجودة في هذه الصفحة. احتفظ برقم طلبك في متناولك: فهو يساعد المتجر على إيجاد طلبك.`;

export const STORE_LEGAL: readonly LegalSeedDoc[] = [
  { kind: "store_privacy", locale: "en", title: "Privacy", body: PRIVACY_EN, summary: null },
  { kind: "store_privacy", locale: "fr", title: "Confidentialité", body: PRIVACY_FR, summary: null },
  { kind: "store_privacy", locale: "ar", title: "الخصوصية", body: PRIVACY_AR, summary: null },
  { kind: "store_terms", locale: "en", title: "Terms of sale", body: TERMS_EN, summary: null },
  { kind: "store_terms", locale: "fr", title: "Conditions de vente", body: TERMS_FR, summary: null },
  { kind: "store_terms", locale: "ar", title: "شروط البيع", body: TERMS_AR, summary: null },
  { kind: "store_shipping", locale: "en", title: "Delivery", body: SHIPPING_EN, summary: null },
  { kind: "store_shipping", locale: "fr", title: "Livraison", body: SHIPPING_FR, summary: null },
  { kind: "store_shipping", locale: "ar", title: "التوصيل", body: SHIPPING_AR, summary: null },
  { kind: "store_returns", locale: "en", title: "Returns and refunds", body: RETURNS_EN, summary: null },
  { kind: "store_returns", locale: "fr", title: "Retours et remboursements", body: RETURNS_FR, summary: null },
  { kind: "store_returns", locale: "ar", title: "الإرجاع والاسترداد", body: RETURNS_AR, summary: null },
  { kind: "store_contact", locale: "en", title: "Contact", body: CONTACT_EN, summary: null },
  { kind: "store_contact", locale: "fr", title: "Contact", body: CONTACT_FR, summary: null },
  { kind: "store_contact", locale: "ar", title: "الاتصال", body: CONTACT_AR, summary: null },
];
