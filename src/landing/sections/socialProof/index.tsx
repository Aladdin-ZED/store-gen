/**
 * Social proof — what customers send back, three ways:
 *  whatsapp  (id kept) the customers' own words as plain quote cards, name and city under each; no
 *            phone mock-up, no bubbles, no times (design.md DES-§5.13 S6, S21)
 *  ugc       9:16 story frames: progress bars, avatar ring, name · city · age, caption stickers; the
 *            first photo story plays large in the middle and the others step down beside it
 *  counter   one big real order counter on a lit poster card, the product's real rating, delivery cities
 * Chats, stories and the counter are merchant content: defaults are product-aware samples flagged
 * `sample: true` and the admin asks for the real thing.
 */
import { CITIES, PEOPLE, familyOf, langOf, pickOne, shuffle, womenOnly } from "../reviews/copy";
import { defineSection, type DefaultsInput } from "../../types";
import { garmentOf } from "../garment";
import { AGES, CHAT, DAYS, FAMILY_CHAT, FEMALE, LEADS, STORY_EXTRA, TITLES, UI, fillIn, garmentChat } from "./copy";
import { CounterView } from "./counter";
import { schema, type ChatData, type Data, type StoryData } from "./schema";
import { UgcView } from "./ugc";
import { WhatsAppView } from "./whatsapp";
import { withRevealScope } from "../reveal-scope";

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

/** Product photo per default story: stories 0, 2, 3 take photos 1–3; story 1 only gets a 4th photo, so it is usually type-only. */
const PHOTO_SLOT = [0, 3, 1, 2];

function defaults({ locale, product, rng }: DefaultsInput): Data {
  const L = langOf(locale);
  // a garment's sample chat is about fabric and size, never "keep it in its pouch for the shine"
  const garment = garmentOf(product);
  const fam = garment ? garmentChat(garment) : FAMILY_CHAT[familyOf(product.category)];
  const women = shuffle(FEMALE, rng);
  // women's and girls' modest wear: every voice is a woman's (a mother's, for a girl's piece)
  const others = womenOnly(garment)
    ? women.slice(1)
    : shuffle(
        PEOPLE.map((_, i) => i).filter((i) => i !== women[0]),
        rng,
      );
  const who = [PEOPLE[women[0]!]!, PEOPLE[others[0]!]!, PEOPLE[others[1]!]!, PEOPLE[others[2]!]!];
  const cities = shuffle(CITIES, rng);
  const photo = product.images[0];
  const say = (s: { ar: string; fr: string; en: string }, vars: Record<string, string> = {}) => fillIn(s[L], vars);
  const first = who[0]![L].split(" ")[0]!;

  const chats: ChatData[] = [
    {
      name: who[0]![L],
      city: cities[0]![L],
      day: DAYS[0]![L],
      messages: [
        { from: "customer", text: say(CHAT.hello), time: "10:42" },
        { from: "customer", text: photo ? "" : say(CHAT.here), time: "10:43", ...(photo ? { photo } : {}) },
        { from: "customer", text: say(fam.first), time: "10:44" },
        { from: "store", text: `${say(CHAT.thanks, { name: first })} ${say(fam.tip)}`, time: "10:51" },
      ],
    },
    {
      name: who[1]![L],
      city: cities[1]![L],
      day: DAYS[1]![L],
      messages: [
        { from: "customer", text: say(CHAT.again, { product: product.name }), time: "18:05" },
        { from: "store", text: say(CHAT.address, { city: cities[1]![L] }), time: "18:09" },
        { from: "customer", text: say(CHAT.cod), time: "18:10" },
        { from: "store", text: say(CHAT.booked), time: "18:12" },
      ],
    },
    {
      name: who[2]![L],
      city: cities[2]![L],
      day: DAYS[2]![L],
      messages: [
        { from: "store", text: say(CHAT.followup, { name: who[2]![L].split(" ")[0]! }), time: "20:55" },
        { from: "customer", text: say(fam.result), time: "21:30" },
        { from: "customer", text: say(CHAT.serious), time: "21:31" },
        { from: "store", text: say(CHAT.glad), time: "21:40" },
      ],
    },
  ];

  const extra = shuffle(STORY_EXTRA, rng);
  const stories: StoryData[] = who.map((p, i) => {
    const img = product.images[PHOTO_SLOT[i]!];
    return {
      name: p[L],
      city: cities[i]![L],
      when: AGES[i]![L],
      // photo stories carry short labels; type-only stories carry the customer's own words
      caption: img ? [fam.story, extra[0]!, extra[1]!, fam.first][i]![L] : (i === 1 ? fam.result : fam.first)[L],
      ...(img ? { image: img } : {}),
    };
  });

  return {
    kicker: UI.kicker[L],
    title: pickOne(TITLES, rng)[L],
    lead: pickOne(LEADS, rng)[L],
    chats,
    note: UI.note[L],
    stories,
    count: 1000 + Math.round(rng() * 30) * 50,
    countLabel: UI.countLabel[L],
    since: UI.since[L],
    cities: cities
      .slice(0, 10)
      .map((x) => x[L])
      .join(L === "ar" ? "، " : ", "),
    cta: UI.cta[L],
    sample: true,
  };
}

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

const RENDER = { whatsapp: WhatsAppView, ugc: UgcView, counter: CounterView } as const;

/**
 * The saved variant, or the quote cards for an unknown id. The quote cards promise no WhatsApp channel (no phone
 * mock-up since the S6 redraw), so a store without a WhatsApp number keeps the variant its owner chose.
 */
function viewFor(props: Parameters<typeof WhatsAppView>[0]): keyof typeof RENDER {
  return (props.variant in RENDER ? props.variant : "whatsapp") as keyof typeof RENDER;
}

const def = defineSection({
  type: "socialProof",
  label: "Social proof (chats & UGC)",
  labelFr: "Preuve sociale",
  category: "proof",
  description: "What customers send back: their own words as quote cards, story frames, or a real order counter with delivery cities.",
  variants: [
    {
      id: "whatsapp",
      label: "Quote cards",
      description:
        "What your customers wrote to you, set as quiet quote cards with their name and city. Only their own messages are quoted, never your replies.",
    },
    {
      id: "ugc",
      label: "Stories",
      description:
        "9:16 story frames: the first photo story plays large in the middle, the others step down beside it; stories without a photo become type-only.",
      archetypes: ["bloom", "playground", "kinetic"],
    },
    {
      id: "counter",
      label: "Order counter",
      description: "A big real order counter on a lit poster card with a turning COD badge, the product rating and the delivery cities drifting by.",
    },
  ],
  schema,
  defaults: (input) => defaults(input),
  fields: [
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60 },
        { kind: "text", path: "title", label: "Title", max: 140, help: "Wrap a word in *stars* to emphasize it." },
        { kind: "textarea", path: "lead", label: "Intro", max: 260, rows: 2 },
      ],
    },
    {
      kind: "list",
      path: "chats",
      label: "WhatsApp chats",
      itemLabel: "Chat",
      titlePath: "name",
      min: 1,
      max: 3,
      newItem: () => ({ name: "", city: "", day: "", messages: [{ from: "customer", text: "", time: "" }] }),
      item: [
        { kind: "text", path: "name", label: "Customer name", max: 40, help: "As saved in your phone, e.g. “Salma B.” — first name and initial is enough." },
        { kind: "text", path: "city", label: "City (under the name)", max: 40 },
        { kind: "text", path: "day", label: "Date chip", max: 24, placeholder: "Aujourd'hui" },
        {
          kind: "list",
          path: "messages",
          label: "Messages",
          itemLabel: "Message",
          titlePath: "text",
          min: 1,
          max: 8,
          newItem: () => ({ from: "customer", text: "", time: "" }),
          item: [
            {
              kind: "select",
              path: "from",
              label: "Sent by",
              options: [
                { value: "customer", label: "Customer (white bubble)" },
                { value: "store", label: "Your store (green bubble, blue ticks)" },
              ],
            },
            { kind: "textarea", path: "text", label: "Message", max: 300, rows: 2, help: "Copy it exactly as written. Empty is fine for a photo-only message." },
            { kind: "text", path: "time", label: "Time", max: 12, placeholder: "10:42" },
            { kind: "image", path: "photo", label: "Photo sent by the customer", help: "Optional — the photo they sent you in the chat." },
          ],
        },
      ],
    },
    {
      kind: "text",
      path: "note",
      label: "Note on the customer's photo",
      max: 80,
      help: "A small glass label pinned to the first photo message (WhatsApp variant). Empty hides it.",
    },
    {
      kind: "list",
      path: "stories",
      label: "Stories",
      itemLabel: "Story",
      titlePath: "name",
      min: 1,
      max: 6,
      newItem: () => ({ name: "", city: "", when: "", caption: "" }),
      item: [
        { kind: "text", path: "name", label: "Customer name", max: 40 },
        { kind: "text", path: "city", label: "City", max: 40 },
        { kind: "text", path: "when", label: "Posted", max: 16, placeholder: "2 h" },
        { kind: "text", path: "caption", label: "Caption on the story", max: 90, help: "Without a photo, the caption becomes a type-only story — use their own words." },
        { kind: "image", path: "image", label: "Story photo (vertical)", help: "A photo or screenshot the customer shared. Empty → a type-only story." },
      ],
    },
    {
      kind: "group",
      label: "Order counter",
      fields: [
        { kind: "number", path: "count", label: "Delivered orders (real number)", min: 0, max: 10_000_000, step: 1, help: "Your real number of delivered orders. 0 hides the number and its card." },
        { kind: "text", path: "countLabel", label: "Label under the number", max: 80 },
        { kind: "text", path: "since", label: "Since when", max: 60, placeholder: "depuis janvier 2025" },
        { kind: "textarea", path: "cities", label: "Delivery cities", max: 600, rows: 3, help: "Separated by commas — they drift by as chips (Order counter). Six or more make two bands." },
      ],
    },
    { kind: "text", path: "cta", label: "Button", max: 60, help: "Leave empty to hide the button." },
    {
      kind: "toggle",
      path: "sample",
      label: "Example content",
      help: "On while these are sample chats, stories and numbers. Replace them with your customers' real ones, then switch it off.",
    },
  ],
  // called as a function (not <View/>) so the returned root element is the view's SectionShell,
  // which the renderer absorbs into the page's single section root
  render: (props) => {
    const view = viewFor(props);
    // the root then carries the shown variant's class, so the page inlines that variant's CSS
    return RENDER[view]({ ...props, variant: view });
  },
});

export default withRevealScope(def);
