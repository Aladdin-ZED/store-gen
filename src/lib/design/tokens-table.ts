/**
 * The append-only token tables of the distance view (P6 DESIGN; design.md DES-§7.1): every stored
 * `design_genomes.vec` names its sections, hero, pairing and faces by these ids, so vectors stay comparable across
 * releases. **Append only:** a new variant, hero arrangement, pairing or face gets the next id at the end of its list;
 * an entry is never removed, renamed or moved (`test:design` compares every list with the committed snapshot
 * src/lib/design/calibration/tokens-table.json, which a change may only extend). An unknown name maps to −1 (n/a).
 */

/** "type:variant" of every section variant (the 91 of R1.0, then the R1 additions of DES-§4.5.4). */
export const SECTION_TOKENS = [
  "announcement:ticker", "announcement:static", "announcement:split", "header:minimal", "header:centered", "header:none",
  "hero:stage", "hero:editorial", "hero:poster", "hero:scrapbook", "hero:spec", "hero:split", "trustBar:chips",
  "trustBar:stamps", "trustBar:ledger", "trustBar:ribbon", "marquee:tape", "marquee:outline", "marquee:double",
  "problem:crossed", "problem:chat", "problem:split", "problem:quote", "benefits:numbered", "benefits:bento",
  "benefits:zigzag", "benefits:icons", "benefits:stack", "showcase:hotspots", "showcase:exploded", "showcase:ingredients",
  "showcase:dimensions", "steps:timeline", "steps:cards", "steps:illustrated", "steps:strip", "story:letter",
  "story:image-text", "story:manifesto", "gallery:carousel", "gallery:masonry", "gallery:filmstrip", "gallery:lookbook",
  "video:framed", "video:phone", "video:fullbleed", "beforeAfter:slider", "beforeAfter:cards", "beforeAfter:timeline",
  "comparison:table", "comparison:versus", "comparison:checklist", "specs:sheet", "specs:tabs", "specs:accordion",
  "specs:label", "reviews:wall", "reviews:carousel", "reviews:summary", "reviews:notes", "socialProof:whatsapp",
  "socialProof:ugc", "socialProof:counter", "stats:big-numbers", "stats:rings", "stats:ticker", "offer:stacked",
  "offer:tickets", "offer:shelf", "urgency:countdown", "urgency:stock", "urgency:banner", "guarantee:seal",
  "guarantee:split", "guarantee:letter", "orderForm:card", "orderForm:split", "orderForm:minimal", "orderForm:bold",
  "cta:banner", "cta:stamp", "cta:poster", "faq:accordion", "faq:two-col", "faq:chat", "footer:simple", "footer:big",
  "stickyCta:bar", "stickyCta:pill", "whatsappFloat:bubble", "whatsappFloat:tab",
  // R1 (DES-§4.5.4)
  "hero:cinema", "hero:quiet", "hero:index", "hero:contact", "hero:statement", "benefits:hanging", "showcase:figure",
  "gallery:contact", "offer:showcase",
] as const;

/**
 * Hero variant + arrangement (DES-§5.13 sheets): the bare variant is its default composition; "variant/arrangement"
 * entries are the sheet's distinct compositions (split ratios, the cinema band, quiet ratios, the contact title cell,
 * the statement structure). A logical mirror (`mediaSide`) is not an arrangement.
 */
export const HERO_TOKENS = [
  "stage", "editorial", "poster", "scrapbook", "spec", "split", "cinema", "quiet", "index", "contact", "statement",
  "split/5:7", "split/4:8", "split/1:1", "cinema/below", "cinema/beside", "quiet/4:5", "quiet/1:1", "contact/tl",
  "contact/tr", "contact/bl", "contact/br", "statement/word-subline", "statement/contrast-pair",
] as const;

/** Pairing ids of the catalogue (legacy, DES-§10.3 additions, DES-R21 rows), in catalogue order at P6 step 2. */
export const PAIRING_TOKENS = [
  "couture", "atelier", "salon", "nocturne", "gallery", "satin", "monolith", "prive", "velours", "noir", "lab-serif",
  "dermo", "formula", "clinic", "ritual", "assay", "botanica", "serum", "batch", "tonic", "vial", "riad", "medina",
  "atlas", "majorelle", "dar", "kasbah", "sahara", "agadir", "sabra", "sticker", "candy", "bounce", "pop", "jelly",
  "block", "sprout", "parade", "confetti", "fizz", "stadium", "velocity", "track", "sprint", "pulse", "lane", "drive",
  "arena", "relay", "spec-sheet", "firmware", "silicon", "kernel", "lumen", "array", "orbit", "signal", "trace",
  "lattice", "kitchen", "pantry", "sunday", "terrace", "loft", "brunch", "ceramic", "nest", "supper", "petal", "gloss",
  "cover", "rosewater", "peony", "dew", "blossom", "silk", "rosa", "pollen", "harvest", "herbarium", "fresh", "meadow",
  "terroir", "ridge", "orchard", "cedar", "market", "grove", "acre", "masthead", "feuilleton", "swiss", "broadsheet",
  "column", "folio", "index", "runway", "gazette", "dispatch", "broadside", "workshop", "torque", "chrome", "piston",
  "alloy", "gauge", "carbon", "rally", "forge", "rivet",
] as const;

/** Font ids (the 27 shipped faces, then the seven DES-R21 faces). */
export const FONT_TOKENS = [
  "bodoni-moda", "fraunces", "gloock", "young-serif", "instrument-serif", "bricolage-grotesque", "big-shoulders-display",
  "archivo", "schibsted-grotesk", "hanken-grotesk", "instrument-sans", "figtree", "dm-sans", "jetbrains-mono",
  "ibm-plex-mono", "el-messiri", "reem-kufi", "lemonada", "marhey", "changa", "alexandria", "noto-kufi-arabic",
  "noto-naskh-arabic", "readex-pro", "baloo-bhaijaan-2", "ibm-plex-sans-arabic", "tajawal",
  // DES-R21
  "cairo", "kufam", "vazirmatn", "cormorant-garamond", "dm-serif-display", "syne", "manrope",
] as const;

const index = (list: readonly string[]) => new Map(list.map((v, i) => [v, i]));
const SECTION_IDX = index(SECTION_TOKENS);
const HERO_IDX = index(HERO_TOKENS);
const PAIRING_IDX = index(PAIRING_TOKENS);
const FONT_IDX = index(FONT_TOKENS);

/** The token of a section variant ("type:variant"), −1 when unknown. */
export const sectionToken = (type: string, variant: string) => SECTION_IDX.get(`${type}:${variant}`) ?? -1;
/** The token of a hero variant and arrangement: the exact entry, else the bare variant, else −1. */
export const heroToken = (variant: string, arrange?: string) => (arrange ? HERO_IDX.get(`${variant}/${arrange}`) : undefined) ?? HERO_IDX.get(variant) ?? -1;
/** The bare hero variant (family) of a hero token, null for −1. */
export const heroFamilyOf = (token: number) => (token >= 0 && token < HERO_TOKENS.length ? HERO_TOKENS[token]!.split("/")[0]! : null);
export const pairingToken = (id: string) => PAIRING_IDX.get(id) ?? -1;
export const fontToken = (id: string) => FONT_IDX.get(id) ?? -1;
