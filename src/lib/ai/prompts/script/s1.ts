/**
 * `script@s1` (P7 AI; ai.md AI-15 R1 slice, AI-§D.3 `callcenter.script`, AI-D31; operations.md OPE-§7.1-7.4;
 * README.md beside this file): the confirmation-call script of one product, for agents, as a template of P5's
 * language. Never about one customer: the input has no field for a customer's data, and the script speaks through
 * variables ({customer_first_name}, {city}, {address}) the agent console fills per order. Saved as a draft a manager
 * approves.
 */
import { TEMPLATE_VARS } from "@/lib/integrations/template-lang";
import { CALL_SCRIPT_LOOSE_JSON, CallScriptLoose, OBJECTION_IDS, OBJECTION_VARS, type CallScriptInput } from "../../schema/tasks/callcenter-script";
import { LOCALE_NAME, jsonBlock, priceText, text } from "../blocks";
import { CONSTITUTION, DARIJA_LEVELS, DATA_RULE, HONESTY, OUTPUT_RULE, OWNER_RULES, darijaGuideText, section } from "../common";
import { DARIJA_GUIDE_DIGEST } from "../darija-digest";
import { renderStoreBlock } from "../store-block";
import type { PromptVersion } from "../types";

/** What each objection is (OPE-§7.2, AI-15). */
export const OBJECTION_MEANING: Readonly<Record<(typeof OBJECTION_IDS)[number], string>> = {
  price: "the price feels high",
  trust: "the customer is not sure the shop or the product is real",
  delivery_time: "the customer asks when it arrives",
  think: "the customer wants to think about it",
  cheaper_elsewhere: "the customer saw it cheaper elsewhere",
  wrong_size: "the customer worries about the size or the fit",
};

const PLATFORM = [
  "# You write confirmation-call scripts for a cash-on-delivery shop's agents",
  CONSTITUTION.join(" "),
  "An agent reads this script on the phone to confirm an order before it ships. A confirmed order the customer then refuses at the door costs the shop the delivery, so the call confirms honestly rather than pushes.",
  "",
  section("The owner's rules (they win over everything below)", OWNER_RULES),
  "",
  section("Honesty", [
    ...HONESTY,
    "No discount, gift, free item or delayed delivery the shop has not configured: only the packs, prices and upsell in <product_facts> exist.",
    "No call-back time or delivery day the shop has not stated (the store layer says what is stated).",
  ]),
  "",
  section("Data and instructions", DATA_RULE),
  "",
  section("Template language", [
    `Variables in braces are filled per order by the agent console: ${TEMPLATE_VARS.map((v) => `{${v}}`).join(", ")}. Use only these, spelled exactly so.`,
    "Never write a customer's name, phone, address or city: write the variable. You never know who the customer is.",
    "[[ ... ]] marks an optional part, dropped when a variable inside it is empty.",
    `Objection answers use only the shop-side variables: ${OBJECTION_VARS.map((v) => `{${v}}`).join(", ")}.`,
  ]),
  "",
  section("Goal", [
    "Steps in call order: greet and introduce the shop, confirm the product and the pack, confirm the address, confirm the total and the payment at the door, the delivery (as the shop states it), the upsell (only when the shop configured one), close warmly.",
    "Each step: a short id (lower case, digits, underscore), a title of at most 40 characters, what the agent says (at most 400 characters), at most four tick boxes of at most 60 characters, when it applies (always, or upsell), and its action (none, add_upsell, edit_address).",
    "The address step follows the shop's address mode in the request: optional asks for the district and a landmark near the customer; required only confirms {address} and {city}.",
    `Objections: one answer for each of ${OBJECTION_IDS.join(", ")}, at most 300 characters each, calm and true.`,
    ...Object.entries(OBJECTION_MEANING).map(([k, v]) => `${k}: ${v}.`),
    "Speak as a person on the phone: short sentences, polite, never pushy.",
  ]),
  "",
  section("Languages", [
    "Arabic scripts are spoken Moroccan Darija in Arabic script at the shop's Darija level (a call is spoken, so level cta and light both mean natural spoken Darija), French scripts use vous, English is plain.",
    ...DARIJA_LEVELS,
  ]),
  "",
  darijaGuideText(),
  "",
  section("Answer", OUTPUT_RULE),
].join("\n");

export const SCRIPT_S1: PromptVersion<"callcenter.script"> = {
  task: "callcenter.script",
  family: "script",
  version: "script@s1",
  provider: "server",
  rubricVersion: null,
  canary: false,
  goal: "A per-product confirmation-call script in the template language, honest, with the six objection answers.",
  evalSet: "script",
  platformBlock: () => PLATFORM,
  storeBlock: (ctx) => renderStoreBlock(ctx).text,
  userBlock: (input: CallScriptInput) => [
    jsonBlock("product_facts", {
      name: input.product.name,
      category: input.product.category,
      price: priceText(input.product.priceMinor, input.product.currency),
      facts: input.product.facts,
      packs: input.packs.map((p) => ({
        label: p.label,
        qty: p.qty,
        price: priceText(p.priceMinor, input.product.currency),
        ...(p.compareAtMinor && p.compareAtMinor > p.priceMinor ? { compareAt: priceText(p.compareAtMinor, input.product.currency) } : {}),
        ...(p.gift?.trim() ? { gift: p.gift.trim() } : {}),
      })),
      upsell: input.upsell ? { title: input.upsell.title, price: priceText(input.upsell.priceMinor, input.product.currency) } : null,
    }),
    text(
      [
        `Write the confirmation-call script in ${LOCALE_NAME[input.locale]}${input.locale === "ar" ? ` (spoken Darija, the shop's level is ${input.darija})` : ""}.`,
        `Address mode: ${input.addressMode ?? "not set (confirm the address with {address} and {city})"}.`,
        input.upsell ? "The shop configured an upsell: include one upsell step." : "The shop configured no upsell: no upsell step.",
      ].join("\n"),
    ),
  ],
  format: { name: "call_script_v1", zod: CallScriptLoose, json: CALL_SCRIPT_LOOSE_JSON },
  hashExtras: [DARIJA_GUIDE_DIGEST],
};
