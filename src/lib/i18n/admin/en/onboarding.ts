/**
 * Admin messages (en) of the onboarding file (P2 SHELL, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/en.ts;
 * English is the reference: the fr and ar files type their keys against this one.
 * The /welcome flow (PLA-§22.2, UX-01): R1-complete in ar, fr and en. Honesty (PD23): no copy promises a result, a
 * stock, a rating or a delivery time.
 */
export const messages = {
  "onboarding.meta": "Welcome",
  "onboarding.continue": "Continue",
  "onboarding.back": "Back",
  "onboarding.saving": "Saving…",
  "onboarding.skip": "Skip for now",
  "onboarding.done": "Go to my dashboard",
  "onboarding.progress": "Setup progress",

  /* ---- photos ---- */
  "onboarding.photos.title": "Drop 1 to 5 product photos",
  "onboarding.photos.hint": "Clear photos of the product work best. Phone photos are fine.",
  "onboarding.photos.pick": "Choose photos",
  "onboarding.photos.camera": "Take a photo",
  "onboarding.photos.skip": "Start without photos",
  "onboarding.photos.uploading": "{count, plural, one {Uploading # photo…} other {Uploading # photos…}}",
  "onboarding.photos.failed": "This photo couldn't be uploaded. Try another one.",
  "onboarding.photos.too_many": "Up to 5 photos. Remove one to add another.",
  "onboarding.photos.remove": "Remove photo",
  "onboarding.analyzing": "Looking at your photos…",
  "onboarding.refining": "Refining the suggestions",

  /* ---- details ---- */
  "onboarding.category.title": "What do you sell?",
  "onboarding.category.suggested": "Suggested",
  "onboarding.category.hint": "Tap one to continue.",
  "onboarding.product_name": "Product name",
  "onboarding.use_suggestion": "Use suggestion",
  "onboarding.price": "Price",
  "onboarding.price_hint": "The price customers pay, in {currency}.",
  "onboarding.price_required": "Enter the price you sell at.",
  "onboarding.compare_at": "Price before (optional)",
  "onboarding.compare_hint": "Only a price you really sold at before.",
  "onboarding.compare_invalid": "The price before must be higher than the price.",
  "onboarding.name_required": "Enter the product name.",
  "onboarding.price_changed": "The price changed since these designs were made. Show the designs again.",
  "onboarding.photos.missing": "A photo was removed from the media library. Add it again.",
  "onboarding.fact": "One fact about the product (optional)",
  "onboarding.fact_hint": "Something true a customer should know, like the size or what's in the box.",
  "onboarding.suggested_facts": "Suggestions to tick",

  /* ---- reveal ---- */
  "onboarding.reveal.title": "Here is your page",
  "onboarding.reveal.analysing": "Preparing three designs…",
  "onboarding.reveal.error": "The designs couldn't be prepared.",
  "onboarding.reveal.retry": "Try again",
  "onboarding.reveal.direction": "Design {n}",
  "onboarding.reveal.prev": "Previous design",
  "onboarding.reveal.next": "Next design",
  "onboarding.reveal.use": "Use this design",
  "onboarding.reveal.more": "Show 3 more",
  "onboarding.reveal.dna": "Why this design",
  "onboarding.reveal.saved": "Your page is saved as a draft. Publishing unlocks after approval.",
  "onboarding.reveal.saved_product": "Your first product and its page are saved as drafts; your store home is being built. Publishing unlocks after approval.",
  "onboarding.reveal.saved_sales_page": "Your first page is a sales page; your store home is being built. Publishing unlocks after approval.",
  "onboarding.reveal.submit": "Submit for review",
  "onboarding.reveal.builder": "Open in the builder",

  /* ---- contact ---- */
  "onboarding.contact.title": "Where should customers reach you?",
  "onboarding.contact.whatsapp": "WhatsApp number",
  "onboarding.contact.hint": "Customers tap it on your pages to ask a question or confirm an order.",
  "onboarding.contact.use_phone": "Use my number {phone} for WhatsApp orders",
  "onboarding.fee_note": "Add delivery fees in Checkout & delivery when you know them.",

  /* ---- done ---- */
  "onboarding.done_title": "Your store is ready to build",
  "onboarding.done_lead": "Here is what is set and what is left.",
} as const satisfies Record<string, string>;
