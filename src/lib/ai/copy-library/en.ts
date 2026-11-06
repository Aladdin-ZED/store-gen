/**
 * Copy library: English.
 * Voice: warm, specific, reassuring about cash on delivery. Short sentences, concrete verbs, no
 * hype words, no invented numbers, no medical promises.
 */
import type { FamilyCopy, LocaleLibrary } from "./types";

const skincare: FamilyCopy = {
  kicker: ["{product}", "{product} · Daily care"],
  headline: [
    { t: "Skin that looks *nourished*, and feels it.", s: "noun-phrase" },
    { t: "The care step that leaves skin *soft* to the touch.", s: "noun-phrase" },
    { t: "Fewer products, more *comfortable* skin.", s: "contrast-pair" },
    { t: "Keep the routine short and the skin *comfortable*.", s: "imperative" },
    { t: "*Softness.* A care step for morning and night.", s: "word-subline" },
  ],
  sub: [
    "A texture that sinks in fast, with no greasy film. {product} slips into your morning and evening routine.",
    "Made for skin that feels tight and dull. One simple step, a clean finish, comfort that lasts.",
  ],
  bigWord: ["Glow", "Care"],
  tagline: ["The care step that simplifies your routine", "Soft and comfortable, every day"],
  benefitsTitle: ["What your skin will *notice*", "Made for your *routine*"],
  benefits: [
    { icon: "drop", title: "Sinks in fast", text: "It spreads easily and leaves skin clean, never sticky. Makeup can follow right away." },
    { icon: "feather", title: "Soft to the touch", text: "From the first use, skin feels suppler and smoother." },
    { icon: "sun", title: "A brighter look", text: "Well-nourished skin reflects light better, so your face looks rested." },
    { icon: "clock", title: "A quick step", text: "A few seconds morning and night. No ten-step routine needed." },
    { icon: "heart", title: "A pleasure to use", text: "A light scent and a gentle texture you will want to reach for daily." },
    { icon: "box", title: "Lasts a long time", text: "A little goes a long way, so one bottle keeps you going." },
  ],
  problemTitle: ["Know *those mornings*?", "Your skin deserves *simpler*"],
  pains: [
    { pain: "Skin that feels tight by midday", fix: "Comfortable skin from morning to night" },
    { pain: "Creams that leave a greasy film", fix: "A light texture that sinks in fast" },
    { pain: "Dull skin despite all the products", fix: "Nourished skin with its glow back" },
    { pain: "A routine too long for busy mornings", fix: "One step, a few seconds" },
  ],
  solution: ["A shorter routine, more comfortable skin: *{product}*.", "One simple step that changes your day: *{product}*."],
  showcaseTitle: ["Take a *closer look*", "Every detail counts"],
  stepsTitle: ["As simple as *that*", "Your routine in three steps"],
  steps: [
    { icon: "drop", title: "On clean skin", text: "Cleanse and gently pat your face dry, morning or night." },
    { icon: "hand-heart", title: "Apply gently", text: "A small amount, in light strokes from the center outwards." },
    { icon: "clock", title: "Let it sink in", text: "One minute and you are ready for cream, makeup or bed." },
  ],
  faq: [
    { q: "Is it suitable for sensitive skin?", a: "Always do a small patch test on the inside of your elbow first. {wa:If in doubt, message us on WhatsApp and we'll send the full ingredient list.|The full ingredient list is on the pack, and you check it on delivery, before paying.}" },
    { q: "Morning, night, or both?", a: "Both work. At night skin makes the most of it; in the morning, apply it before your sunscreen." },
  ],
  story: [
    { title: "Why we *chose it*", text: "We wanted simple, pleasant care that doesn't overpromise but delivers every day. {product} is the step we happily repeat each day, and we made it easy to get anywhere, with cash on delivery." },
  ],
  comparison: [
    { label: "Texture", us: "Light, sinks in fast", them: "Often greasy or sticky" },
    { label: "Routine", us: "One step, a few seconds", them: "Several layered products" },
    { label: "Payment", us: "Cash on delivery", them: "Card required upfront" },
    { label: "Before paying", us: "You check your parcel", them: "You pay blind" },
  ],
  marquee: ["Soft skin", "Light texture", "Natural glow", "Simple step", "Cash on delivery"],
};

const haircare: FamilyCopy = {
  kicker: ["{product}", "{product} · Hair care"],
  headline: [
    { t: "*Soft* hair you can't stop touching.", s: "noun-phrase" },
    { t: "Less frizz, more *shine*.", s: "contrast-pair" },
    { t: "The care that makes your lengths feel *light*.", s: "noun-phrase" },
    { t: "Brush without pulling, style *without a fight*.", s: "imperative" },
    { t: "*Softness.* Lengths that are easy to style.", s: "word-subline" },
  ],
  sub: [
    "{product} nourishes your lengths without weighing them down. Easier styling, from blow-dry to bun.",
    "For dry, brittle or heat-tired hair: one simple step to bring the softness back.",
  ],
  bigWord: ["Shine", "Care"],
  tagline: ["Nourished lengths, never heavy", "Softness and shine, every day"],
  benefitsTitle: ["What your hair will *feel*", "Made for your *lengths*"],
  benefits: [
    { icon: "drop", title: "Nourishes without weight", text: "It coats each strand and leaves hair light, never greasy." },
    { icon: "sun", title: "Natural shine", text: "Smoother hair reflects light better and looks healthier." },
    { icon: "feather", title: "Easy detangling", text: "The comb glides through and knots come loose without pulling." },
    { icon: "flame", title: "Before heat styling", text: "A step to use before the straightener or dryer, for more comfortable lengths." },
    { icon: "heart", title: "A lovely scent", text: "A soft fragrance that stays quietly in your hair." },
    { icon: "clock", title: "A two-minute step", text: "On damp or dry hair, it fits your routine without complicating it." },
  ],
  problemTitle: ["Your hair deserves *better*", "Sound *familiar*?"],
  pains: [
    { pain: "Dry ends that keep breaking", fix: "Nourished, suppler lengths" },
    { pain: "Frizz the moment it gets humid", fix: "Hair that stays in place" },
    { pain: "Treatments that make roots greasy", fix: "A light texture for the lengths only" },
    { pain: "Knots with every brush stroke", fix: "A comb that glides" },
  ],
  solution: ["Softer hair, a simpler routine: *{product}*.", "The care that makes peace between your hair and your brush: *{product}*."],
  showcaseTitle: ["Take a *closer look*", "Thought through in every detail"],
  stepsTitle: ["Three steps, *that's all*", "How to use"],
  steps: [
    { icon: "drop", title: "On towel-dried hair", text: "After shampoo, gently squeeze out the water with a towel." },
    { icon: "hand-heart", title: "On the lengths", text: "Spread a small amount from mid-lengths to ends, avoiding the roots." },
    { icon: "feather", title: "Style as usual", text: "Comb, air-dry or blow-dry: your hair is ready." },
  ],
  faq: [
    { q: "Does it work on curly hair?", a: "Yes, it nourishes without flattening curls. Adjust the amount to your hair's thickness and add a little more on the ends if needed." },
    { q: "Can I use it every day?", a: "Yes, a small amount on the lengths. For fine hair, two or three times a week is enough." },
  ],
  story: [
    { title: "Care that keeps it *simple*", text: "We wanted a product you keep in the bathroom because it works, not because it looks nice. {product} came from that: easy, pleasant care, delivered to your door and paid for on arrival." },
  ],
  comparison: [
    { label: "On the roots", us: "Lengths only, never greasy", them: "Roots weighed down fast" },
    { label: "Detangling", us: "The comb glides", them: "Knots and breakage" },
    { label: "Payment", us: "Cash on delivery", them: "Online payment required" },
    { label: "Before paying", us: "You check your parcel", them: "No checking" },
  ],
  marquee: ["Soft hair", "Shine", "Never greasy", "Easy detangling", "Cash on delivery"],
};

const fragrance: FamilyCopy = {
  kicker: ["{product}", "{product} · Fragrance"],
  headline: [
    { t: "A trail people *notice*, never one that overwhelms.", s: "noun-phrase" },
    { t: "The scent they'll ask you *the name of*.", s: "noun-phrase" },
    { t: "A signature that *feels like you*.", s: "noun-phrase" },
    { t: "Wear it by day, *keep it* for the evening.", s: "imperative" },
    { t: "*Trail.* Quiet up close, present when someone leans in.", s: "word-subline" },
  ],
  sub: [
    "{product} opens softly, then settles on the skin. A fragrance for day and evening.",
    "Notes crafted to last and evolve with you, from the first spray to the end of the day.",
  ],
  bigWord: ["Scent", "Trail"],
  tagline: ["An elegant, long-lasting signature", "The fragrance you keep close"],
  benefitsTitle: ["What makes it *unforgettable*", "A fragrance made to *last*"],
  benefits: [
    { icon: "clock", title: "Beautiful staying power", text: "On skin and clothes, it stays with you through the day." },
    { icon: "waves", title: "A balanced trail", text: "Present without being overpowering: noticed when someone leans in." },
    { icon: "gem", title: "An elegant bottle", text: "A beautiful object for the dressing table and the handbag alike." },
    { icon: "gift", title: "A gift that lands", text: "Birthdays, Eid, weddings: a present you know will be worn." },
    { icon: "sun", title: "Day or night", text: "Soft enough for the office, present enough for big occasions." },
    { icon: "heart", title: "A feeling", text: "A fragrance is a memory. This one stays tied to the good moments." },
  ],
  problemTitle: ["Fragrances that *vanish* within an hour", "Looking for *your* scent?"],
  pains: [
    { pain: "A perfume gone before noon", fix: "A scent that stays with you through the day" },
    { pain: "Heady, overwhelming fragrances", fix: "An elegant, balanced trail" },
    { pain: "Paying a lot without smelling first", fix: "Pay on delivery, after seeing your parcel" },
    { pain: "Copies that smell synthetic", fix: "Crafted notes, pleasant from start to finish" },
  ],
  solution: ["A signature that lasts and feels like you: *{product}*.", "The scent people remember: *{product}*."],
  showcaseTitle: ["A bottle, *a story*", "Up close"],
  stepsTitle: ["How to *wear it*", "The fragrance ritual"],
  steps: [
    { icon: "drop", title: "On clean skin", text: "After a shower, on moisturized skin, fragrance lasts longer." },
    { icon: "heart", title: "On pulse points", text: "Neck, wrists, behind the ears: where warmth carries the scent." },
    { icon: "feather", title: "Don't rub", text: "Let it dry naturally so the notes unfold in order." },
  ],
  faq: [
    { q: "How many sprays do I need?", a: "Two or three are enough. Add one on your clothes to extend the trail." },
    { q: "Does it make a good gift?", a: "Yes, the bottle presents beautifully. Let us know in the order note if it's a gift." },
  ],
  story: [
    { title: "A signature, *not a trend*", text: "We choose a fragrance so it says something about us without a word. {product} was made for exactly that: an elegant signature to wear every day, delivered to your door with cash on delivery." },
  ],
  comparison: [
    { label: "Staying power", us: "Stays with you all day", them: "Fades fast" },
    { label: "Trail", us: "Elegant and balanced", them: "Too faint or overpowering" },
    { label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { label: "Before paying", us: "You check the bottle", them: "No checking" },
  ],
  marquee: ["Trail", "Elegance", "Staying power", "Gift idea", "Cash on delivery"],
};

const jewelry: FamilyCopy = {
  kicker: ["{product}", "{product} · Jewelry"],
  headline: [
    { t: "The detail that *lights up* the whole outfit.", s: "noun-phrase" },
    { t: "A piece you wear, and that *gets noticed*.", s: "noun-phrase" },
    { t: "The jewel you keep *for years*.", s: "noun-phrase" },
    { t: "Wear it every day, *not just* on weekends.", s: "imperative" },
    { t: "*Shine.* A finish that catches the light.", s: "word-subline" },
  ],
  sub: [
    "{product}: a careful finish and a quiet sparkle, for every day or the big occasions.",
    "A design that goes with everything, delivered in a beautiful box. You pay only on arrival.",
  ],
  bigWord: ["Sparkle", "Jewel"],
  tagline: ["A careful finish, a quiet sparkle", "The everyday elegant detail"],
  benefitsTitle: ["The detail that *makes the difference*", "Made to be *worn*"],
  benefits: [
    { icon: "gem", title: "A careful finish", text: "Every detail is polished so the piece catches the light from every angle." },
    { icon: "feather", title: "Comfortable to wear", text: "Light and well fitted. You forget it's there until the first compliment." },
    { icon: "star", title: "Goes with everything", text: "Jeans in the morning, a kaftan at night: it adapts to every outfit." },
    { icon: "gift", title: "Ready to gift", text: "A neat box for a present that impresses from the moment it's opened." },
    { icon: "shield-check", title: "Made to last", text: "Keep it away from water and perfume and it keeps its shine." },
    { icon: "heart", title: "A piece with meaning", text: "To mark a date, a success, or simply to treat yourself." },
  ],
  problemTitle: ["Jewelry that *tarnishes* in a month", "Finding the *right* piece"],
  pains: [
    { pain: "Jewelry that darkens quickly", fix: "A careful finish, made to last" },
    { pain: "Pieces too loud for every day", fix: "A quiet sparkle that goes with everything" },
    { pain: "Ordering online without seeing the quality", fix: "You check the piece before paying" },
    { pain: "A gift that arrives with no presentation", fix: "Delivered in a box, ready to give" },
  ],
  solution: ["The elegant detail you wear every day: *{product}*.", "A piece you keep, and pass on: *{product}*."],
  showcaseTitle: ["Every detail, *up close*", "A crafted piece"],
  stepsTitle: ["Keep it *shining*", "Care in three steps"],
  steps: [
    { icon: "drop", title: "Away from water and perfume", text: "Put it on last, after perfume and cream." },
    { icon: "feather", title: "A soft cloth", text: "Wipe it after wearing to remove fingerprints." },
    { icon: "box", title: "In its box", text: "Stored separately, it won't get scratched by other jewelry." },
  ],
  faq: [
    { q: "How do I choose the right size?", a: "{wa:Message us your measurement on WhatsApp and we'll advise you before shipping.|Add your measurement to the order note and we'll advise you on the confirmation call.} On delivery, you check before paying." },
    { q: "Can I wear it every day?", a: "Yes. Just take it off for the shower, sport and the beach to keep its shine longer." },
  ],
  story: [
    { title: "Sparkle *without excess*", text: "We love jewelry that lives with you rather than staying in a box. {product} is made to be worn: a careful finish, a design that goes with everything, and cash on delivery so you can order with peace of mind." },
  ],
  comparison: [
    { label: "Finish", us: "Careful, polished", them: "Uneven, tarnishes fast" },
    { label: "Presentation", us: "Delivered in a box", them: "Plastic bag" },
    { label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { label: "Before paying", us: "You check the piece", them: "No checking" },
  ],
  marquee: ["Sparkle", "Careful finish", "Ready to gift", "Elegance", "Cash on delivery"],
};

const fashion: FamilyCopy = {
  kicker: ["{product}", "{product} · Collection"],
  headline: [
    { t: "The piece that *simplifies* your outfits.", s: "noun-phrase" },
    { t: "A clean look, *all-day* comfort.", s: "noun-phrase" },
    { t: "The one you'll wear *again and again*.", s: "noun-phrase" },
    { t: "Put it on in the morning, *forget it* until night.", s: "imperative" },
    { t: "*Cut.* A piece that falls right.", s: "word-subline" },
  ],
  sub: [
    "{product}: a cut that falls right, a pleasant fabric, and a style that works with your whole wardrobe.",
    "Morning to night, weekday to weekend: an easy piece made for real life.",
  ],
  bigWord: ["Silhouette", "Allure"],
  tagline: ["A clean cut, real comfort", "The easy piece in your wardrobe"],
  benefitsTitle: ["Why you'll *wear it often*", "Made for *real life*"],
  benefits: [
    { icon: "ruler", title: "A cut that falls right", text: "It follows the silhouette without squeezing, for a sharp look in seconds." },
    { icon: "feather", title: "A pleasant fabric", text: "Soft to the touch and comfortable from morning to night." },
    { icon: "star", title: "Easy to match", text: "It works with your basics and your statement pieces." },
    { icon: "bag", title: "Practical every day", text: "Details made for moving, carrying, storing: fashion that keeps up." },
    { icon: "shield-check", title: "Careful finishing", text: "Neat seams and crafted details that hold their shape wash after wash." },
    { icon: "heart", title: "The right balance", text: "Elegant without trying too hard: a piece you grab without thinking." },
  ],
  problemTitle: ["*Nothing to wear*, again?", "Online shopping that *disappoints*"],
  pains: [
    { pain: "A size that doesn't match the photo", fix: "You check on delivery before paying" },
    { pain: "Fabrics that pill quickly", fix: "A pleasant fabric and careful finishing" },
    { pain: "Pieces that are hard to match", fix: "A style that works with your whole wardrobe" },
    { pain: "Paying upfront and waiting forever", fix: "Cash on delivery, fast shipping" },
  ],
  solution: ["The piece you grab without thinking: *{product}*.", "A clean look, real comfort: *{product}*."],
  showcaseTitle: ["The details *that matter*", "Up close"],
  stepsTitle: ["Choosing is *simple*", "How to order"],
  steps: [
    { icon: "ruler", title: "Pick your size", text: "Compare with a piece you already love. {wa:Unsure? Message us on WhatsApp.|Unsure? We'll talk it through on the confirmation call.}" },
    { icon: "check", title: "Fill in the form", text: "Name, phone, city: our team calls you to confirm." },
    { icon: "eye", title: "Check, then pay", text: "Open the parcel in front of the courier and pay only if you're happy." },
  ],
  faq: [
    { q: "How do I choose my size?", a: "Take a piece you wear often and compare its measurements. {wa:Message us on WhatsApp and we'll help you choose.|Add your usual size to the order note and we'll confirm it with you on the call.}" },
    { q: "How do I care for it?", a: "Follow the label: gentle wash, inside out, and dry flat to keep the shape and color." },
  ],
  story: [
    { title: "An *easy* piece", text: "We wanted a piece you grab in the morning without a second thought, that falls right and stays comfortable all day. That's {product}: effortless style, delivered to your door and paid on arrival." },
  ],
  comparison: [
    { label: "Cut", us: "Clean, falls right", them: "Approximate" },
    { label: "Fabric", us: "Soft, pleasant", them: "Rough, pills fast" },
    { label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { label: "Size", us: "You check before paying", them: "Bad surprise when unboxing" },
  ],
  marquee: ["Clean cut", "Comfort", "Easy to wear", "Style", "Cash on delivery"],
};

const wellness: FamilyCopy = {
  kicker: ["{product}", "{product} · Wellbeing"],
  headline: [
    { t: "Take care of yourself, *every day*, simply.", s: "imperative" },
    { t: "A simple habit to feel *good*.", s: "noun-phrase" },
    { t: "Wellbeing, *without complicating* your days.", s: "noun-phrase" },
    { t: "Take a pause, *every day*.", s: "imperative" },
    { t: "*Calm.* A simple ritual, at your pace.", s: "word-subline" },
  ],
  sub: [
    "{product} fits easily into your day. One simple, regular step to take care of yourself.",
    "Made to go with a balanced routine: easy to take, easy to keep up.",
  ],
  bigWord: ["Balance", "Care"],
  tagline: ["A simple habit for self-care", "Your wellbeing routine, simplified"],
  benefitsTitle: ["Why make it *a daily habit*", "A routine *that sticks*"],
  benefits: [
    { icon: "clock", title: "Easy to fit in", text: "A quick step that finds its place in your morning or evening." },
    { icon: "leaf", title: "Clear ingredients", text: "Everything is listed on the pack, so you know what you're taking." },
    { icon: "heart", title: "A moment for you", text: "Self-care starts with a habit you enjoy keeping." },
    { icon: "box", title: "Practical format", text: "Easy to store, easy to carry, always at hand." },
    { icon: "check", title: "Simple to follow", text: "Clear directions, no complicated program." },
    { icon: "headset", title: "Answers to your questions", text: "{wa:Our team replies on WhatsApp before and after your order.|Our team calls you to confirm your order and answer your questions.}" },
  ],
  problemTitle: ["Self-care *can be simple*", "Short on *time* too?"],
  pains: [
    { pain: "Wellbeing routines too complicated to keep", fix: "One step, easy to stick with" },
    { pain: "Labels impossible to understand", fix: "Clearly listed ingredients" },
    { pain: "Products abandoned after a week", fix: "A practical format you keep at hand" },
    { pain: "Ordering with no one to ask", fix: "{wa:Our team answers on WhatsApp|Our team calls you and answers your questions}" },
  ],
  solution: ["A simple habit to take care of yourself: *{product}*.", "Wellbeing, simply: *{product}*."],
  showcaseTitle: ["What's *inside*", "Up close"],
  stepsTitle: ["How to *use it*", "Your routine"],
  steps: [
    { icon: "info", title: "Read the directions", text: "Follow the dose and directions printed on the pack." },
    { icon: "clock", title: "Pick a fixed moment", text: "Pair it with a daily habit, like your morning coffee or dinner." },
    { icon: "check", title: "Stay regular", text: "Like any habit, consistency is what counts." },
  ],
  faq: [
    { q: "Can I use it if I'm on medication?", a: "If you are on medication, pregnant or breastfeeding, ask your doctor or pharmacist before use." },
    { q: "How should I take it?", a: "Follow the directions on the pack. {wa:For any question, our team answers on WhatsApp.|Any questions? Ask them on the confirmation call.}" },
  ],
  story: [
    { title: "Wellbeing, *no detours*", text: "Taking care of yourself shouldn't need a manual. We chose {product} for its simplicity: a clear step, readable ingredients, and cash on delivery so you can order with confidence." },
  ],
  comparison: [
    { label: "Ingredients", us: "Clearly listed", them: "Vague or incomplete" },
    { label: "Use", us: "One simple step", them: "Complicated program" },
    { label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { label: "Advice", us: "{wa:Answers on WhatsApp|Answers by phone}", them: "No one to ask" },
  ],
  marquee: ["Wellbeing", "Simplicity", "Consistency", "Clear ingredients", "Cash on delivery"],
};

const fitness: FamilyCopy = {
  kicker: ["{product}", "{product} · Home training"],
  headline: [
    { t: "Your workout, *anywhere*, whenever you want.", s: "noun-phrase" },
    { t: "Move more, *no membership*.", s: "imperative" },
    { t: "The gear that gets you *moving*.", s: "noun-phrase" },
    { t: "Train *at home*, on your schedule.", s: "imperative" },
    { t: "*Rhythm.* A workout wherever you are.", s: "word-subline" },
  ],
  sub: [
    "{product} goes with you at home, in the park or on the road. Compact, sturdy, ready when you are.",
    "No gym, no schedule: simple gear to keep your rhythm, week after week.",
  ],
  bigWord: ["Move", "Sport"],
  tagline: ["Training that fits your schedule", "Compact, sturdy, ready to go"],
  benefitsTitle: ["What will *change* your workouts", "Built to *move*"],
  benefits: [
    { icon: "home", title: "At home", text: "An effective session in your living room, no commute, no membership." },
    { icon: "bag", title: "Compact and portable", text: "It fits in a cupboard and travels with you." },
    { icon: "shield-check", title: "Sturdy", text: "Materials made to take rep after rep, session after session." },
    { icon: "user", title: "Every level", text: "Beginner or seasoned, you set the effort to your pace." },
    { icon: "bolt", title: "Ready in seconds", text: "No complicated setup: take it out and start." },
    { icon: "dumbbell", title: "Full body", text: "Mix up exercises for arms, legs and core." },
  ],
  problemTitle: ["Exercise, *always tomorrow*?", "No time for the gym?"],
  pains: [
    { pain: "A membership paid for but never used", fix: "Your session at home, whenever you want" },
    { pain: "No time for the commute", fix: "Ready in seconds, in your living room" },
    { pain: "Bulky equipment", fix: "Compact and easy to store" },
    { pain: "Flimsy gear that breaks fast", fix: "Sturdy materials, built to last" },
  ],
  solution: ["Your workout, your pace: *{product}*.", "Get moving at home: *{product}*."],
  showcaseTitle: ["Designed *in detail*", "Up close"],
  stepsTitle: ["Your first *session*", "Ready in three steps"],
  steps: [
    { icon: "box", title: "Unbox", text: "Everything is ready to use, no complicated assembly." },
    { icon: "user", title: "Warm up", text: "A few minutes of mobility to prepare your body." },
    { icon: "dumbbell", title: "Train", text: "Start gently, then raise the effort over the weeks." },
  ],
  faq: [
    { q: "Is it suitable for beginners?", a: "Yes, you choose the intensity. Start with short sessions and build up gradually." },
    { q: "Do I need a lot of space?", a: "No, a small floor area is enough. After your session it goes back in a cupboard." },
  ],
  story: [
    { title: "Exercise, *your way*", text: "We chose {product} for one simple reason: the best workout is the one you actually do. At home, on your schedule, no membership, and paid only on delivery." },
  ],
  comparison: [
    { label: "Where", us: "At home, anywhere", them: "Only at the gym" },
    { label: "Cost", us: "One purchase", them: "Monthly membership" },
    { label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { label: "Schedule", us: "Whenever you want", them: "Opening hours" },
  ],
  marquee: ["Move", "Anywhere", "Every level", "No membership", "Cash on delivery"],
};

const kitchen: FamilyCopy = {
  kicker: ["{product}", "{product} · Kitchen"],
  headline: [
    { t: "Everyday cooking, *in less time*.", s: "noun-phrase" },
    { t: "The tool that *saves you time* in the kitchen.", s: "noun-phrase" },
    { t: "Cooking becomes *a pleasure*, not a chore.", s: "contrast-pair" },
    { t: "Prepare faster, *clean less*.", s: "imperative" },
    { t: "*Taste.* Everyday cooking, made simpler.", s: "word-subline" },
  ],
  sub: [
    "{product} makes meal prep simpler: less effort, fewer dishes, more time at the table.",
    "Practical, sturdy and easy to clean: the tool you reach for every day.",
  ],
  bigWord: ["Kitchen", "Easy"],
  tagline: ["Less effort in the kitchen, more time at the table", "The tool you use every day"],
  benefitsTitle: ["What changes *in the kitchen*", "Made for *your kitchen*"],
  benefits: [
    { icon: "clock", title: "Time saved", text: "Prep goes faster, so you spend less time standing at the counter." },
    { icon: "drop", title: "Easy to clean", text: "A quick rinse and it's clean, no impossible corners." },
    { icon: "shield-check", title: "Sturdy", text: "Materials made for daily use in a real family kitchen." },
    { icon: "home", title: "Compact", text: "It fits in a drawer or on the counter." },
    { icon: "hand-heart", title: "Simple to use", text: "No complicated manual: you get the hang of it the first time." },
    { icon: "heart", title: "For the whole family", text: "From breakfast to dinner, it helps at every meal." },
  ],
  problemTitle: ["Cooking taking *too much time*?", "Tired of kitchen *chores*?"],
  pains: [
    { pain: "Prep that takes forever", fix: "A quick step, time saved" },
    { pain: "Tools impossible to clean", fix: "A rinse and it's clean" },
    { pain: "Flimsy gadgets that break", fix: "Sturdy, made for every day" },
    { pain: "Cluttered drawers", fix: "Compact and easy to store" },
  ],
  solution: ["More time at the table, less in the kitchen: *{product}*.", "The right tool changes everything: *{product}*."],
  showcaseTitle: ["Thought through *in detail*", "Up close"],
  stepsTitle: ["As easy as *that*", "How to use it"],
  steps: [
    { icon: "box", title: "Unbox", text: "Rinse before first use and it's ready." },
    { icon: "hand-heart", title: "Prep", text: "Use it for your everyday preparations, simply." },
    { icon: "drop", title: "Rinse", text: "A splash of water, a wipe, and back in the drawer." },
  ],
  faq: [
    { q: "How do I clean it?", a: "With hot soapy water and a soft sponge. Dry it before putting it away." },
    { q: "Is it suitable for daily use?", a: "Yes, it's made for a family kitchen. Just follow the care tips." },
  ],
  story: [
    { title: "Made for *real kitchens*", text: "In a Moroccan kitchen, we cook a lot, often, for many people. We chose {product} for exactly that: a simple, sturdy tool that saves time every day. And you only pay on delivery." },
  ],
  comparison: [
    { label: "Prep time", us: "Shorter", them: "Long and tiring" },
    { label: "Cleaning", us: "A rinse is enough", them: "Impossible corners" },
    { label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { label: "Before paying", us: "You check the parcel", them: "No checking" },
  ],
  marquee: ["Time saved", "Easy to clean", "Sturdy", "Practical", "Cash on delivery"],
};

const home: FamilyCopy = {
  kicker: ["{product}", "{product} · Home"],
  headline: [
    { t: "A *nicer* home, without the effort.", s: "noun-phrase" },
    { t: "The small change that makes home *more beautiful*.", s: "noun-phrase" },
    { t: "Fewer chores, more *time for you*.", s: "contrast-pair" },
    { t: "Set it up once, *enjoy it* every day.", s: "imperative" },
    { t: "*Comfort.* The detail that changes the room.", s: "word-subline" },
  ],
  sub: [
    "{product} handles the everyday so you can enjoy your home. Practical, sturdy, easy to use.",
    "Made for real homes: simple to set up, simple to use, pleasant to look at.",
  ],
  bigWord: ["Home", "Cozy"],
  tagline: ["A nicer home, every day", "Practical, sturdy, easy to live with"],
  benefitsTitle: ["What changes *at home*", "Made for *your space*"],
  benefits: [
    { icon: "clock", title: "Time freed up", text: "Small chores go faster, so you enjoy your home more." },
    { icon: "hand-heart", title: "Easy to use", text: "No tools or complicated manual: you use it right away." },
    { icon: "home", title: "Fits anywhere", text: "A clean design that belongs in the living room, bedroom or hallway." },
    { icon: "shield-check", title: "Sturdy", text: "Materials chosen for everyday use." },
    { icon: "sun", title: "A more welcoming home", text: "Neater, tidier and more inviting for you and your guests." },
    { icon: "heart", title: "For the whole family", text: "Practical for everyone, young and old." },
  ],
  problemTitle: ["The small chores that *ruin* the week", "Your home deserves *simpler*"],
  pains: [
    { pain: "Tasks that take too long", fix: "A faster, more effective step" },
    { pain: "Bulky or flimsy solutions", fix: "Practical, sturdy, easy to store" },
    { pain: "A space that lacks charm", fix: "A clean design that fits anywhere" },
    { pain: "Buying without knowing if it fits", fix: "You check before paying" },
  ],
  solution: ["A nicer home, without the effort: *{product}*.", "The small extra that changes everyday life: *{product}*."],
  showcaseTitle: ["Thought through *in detail*", "Up close"],
  stepsTitle: ["Ready in *three steps*", "How it works"],
  steps: [
    { icon: "box", title: "Unbox", text: "Everything is ready, no complicated assembly." },
    { icon: "home", title: "Place it", text: "Pick its spot: it adapts to your space." },
    { icon: "sun", title: "Enjoy", text: "Everyday life gets simpler from day one." },
  ],
  faq: [
    { q: "Is it hard to set up?", a: "No, it works as is, no special tools. {wa:Our team can guide you on WhatsApp.|}" },
    { q: "How do I look after it?", a: "A soft, slightly damp cloth is enough. Avoid abrasive products." },
  ],
  story: [
    { title: "Home, *made simpler*", text: "We spend a lot of time at home, so it should feel good. We chose {product} to make everyday life simpler and home more welcoming. Delivered to your door, paid on arrival." },
  ],
  comparison: [
    { label: "Use", us: "Simple, immediate", them: "Complicated" },
    { label: "Sturdiness", us: "Made for every day", them: "Flimsy" },
    { label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { label: "Before paying", us: "You check the parcel", them: "No checking" },
  ],
  marquee: ["Home", "Practical", "Sturdy", "Easy", "Cash on delivery"],
};

const kids: FamilyCopy = {
  kicker: ["{product}", "{product} · Play & learn"],
  headline: [
    { t: "Eyes that *light up* the moment the parcel opens.", s: "noun-phrase" },
    { t: "The toy that keeps them busy *and helps them grow*.", s: "noun-phrase" },
    { t: "Hours of *play*, relaxed parents.", s: "noun-phrase" },
    { t: "Open the parcel, *let them play*.", s: "imperative" },
    { t: "*Play.* Hours of discovery at home.", s: "word-subline" },
  ],
  sub: [
    "{product} sparks curiosity and imagination. Materials made for small hands, hours of play.",
    "A gift kids love and parents trust: sturdy, colorful, easy to tidy away.",
  ],
  bigWord: ["Play", "Kids"],
  tagline: ["Hours of play, relaxed parents", "The gift that makes eyes light up"],
  benefitsTitle: ["Why they'll *love it*", "Made for *small hands*"],
  benefits: [
    { icon: "star", title: "Hours of play", text: "A toy they come back to again and again, alone or with friends." },
    { icon: "hand-heart", title: "Made for small hands", text: "Shapes that are easy to grip and handle." },
    { icon: "bolt", title: "Imagination and skills", text: "It stimulates curiosity, creativity and dexterity." },
    { icon: "shield-check", title: "Sturdy", text: "Built to survive drops and big adventures." },
    { icon: "gift", title: "A thoughtful gift", text: "Birthdays, Eid, good grades: a present everyone agrees on." },
    { icon: "box", title: "Easy to tidy", text: "Everything packs away fast, so the room stays neat." },
  ],
  problemTitle: ["Screens, *always screens*?", "A gift *that lasts*"],
  pains: [
    { pain: "Kids glued to screens", fix: "A toy that keeps hands and minds busy" },
    { pain: "Toys broken within a week", fix: "Sturdy, made for big adventures" },
    { pain: "Toys forgotten in days", fix: "A toy they come back to again and again" },
    { pain: "Ordering without seeing the quality", fix: "You check the parcel before paying" },
  ],
  solution: ["Play, discovery and smiles: *{product}*.", "The toy that never stays on the shelf: *{product}*."],
  showcaseTitle: ["Take a *closer look*", "Made for them"],
  stepsTitle: ["Ready to *play*", "In three steps"],
  steps: [
    { icon: "box", title: "Open", text: "The fun starts with the unboxing." },
    { icon: "user", title: "Discover", text: "Show them once, then let imagination take over." },
    { icon: "star", title: "Play", text: "Alone, with family or friends: everyone has their game." },
  ],
  faq: [
    { q: "What age is it for?", a: "Follow the age shown on the pack, and supervise younger children while they play." },
    { q: "Is it a good gift?", a: "Yes, it arrives well packed. If it's a gift, tell us in the order note." },
  ],
  story: [
    { title: "For *big adventures*", text: "We all remember a toy that shaped our childhood. We chose {product} to become that toy: sturdy, joyful, irresistible to play with. Delivered to your door, paid on arrival." },
  ],
  comparison: [
    { label: "Play time", us: "Again and again", them: "Quickly forgotten" },
    { label: "Sturdiness", us: "Built to last", them: "Fragile" },
    { label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { label: "Before paying", us: "You check the parcel", them: "No checking" },
  ],
  marquee: ["Play", "Imagine", "Grow", "Gift idea", "Cash on delivery"],
};

const pets: FamilyCopy = {
  kicker: ["{product}", "{product} · Pets"],
  headline: [
    { t: "A *happy* companion, a calm home.", s: "noun-phrase" },
    { t: "What they love, *what makes your life easier*.", s: "noun-phrase" },
    { t: "Caring for them, *without complicating* your day.", s: "noun-phrase" },
    { t: "Give them their corner, *keep* the home calm.", s: "imperative" },
    { t: "*Comfort.* Their spot, your calm.", s: "word-subline" },
  ],
  sub: [
    "{product} is designed for your pet's comfort and your peace of mind. Practical, sturdy, easy to clean.",
    "Cats, dogs, small or large: a simple accessory that makes daily life nicer for everyone.",
  ],
  bigWord: ["Pets", "Cuddle"],
  tagline: ["Your companion's comfort, simply", "A happy pet, a calm home"],
  benefitsTitle: ["What they'll *love*", "Made for *them*, practical for *you*"],
  benefits: [
    { icon: "paw", title: "Made for their comfort", text: "Pleasant materials and a shape that suits their habits." },
    { icon: "drop", title: "Easy to clean", text: "A wipe with a sponge or a machine wash, as directed." },
    { icon: "shield-check", title: "Sturdy", text: "It stands up to claws, teeth and long play sessions." },
    { icon: "home", title: "Fits your home", text: "A clean design that matches your interior." },
    { icon: "clock", title: "Fewer chores", text: "Daily life with your pet gets simpler." },
    { icon: "heart", title: "For every size", text: "Choose the model that suits your companion's size." },
  ],
  problemTitle: ["Your companion *deserves better*", "Daily life with them, *made simpler*"],
  pains: [
    { pain: "Accessories ruined in days", fix: "Sturdy, it survives playtime" },
    { pain: "Cleaning that takes ages", fix: "Easy to clean" },
    { pain: "A pet who ignores their things", fix: "Made for their comfort and habits" },
    { pain: "Ordering without seeing the quality", fix: "You check before paying" },
  ],
  solution: ["A happy companion, a calm home: *{product}*.", "For their comfort and your peace of mind: *{product}*."],
  showcaseTitle: ["Thought through *in detail*", "Up close"],
  stepsTitle: ["Adopted in *three steps*", "How to use it"],
  steps: [
    { icon: "box", title: "Unbox", text: "Let them sniff and explore at their own pace." },
    { icon: "home", title: "Place it", text: "Put it somewhere they already love." },
    { icon: "paw", title: "Let them adopt it", text: "A few days and it becomes their spot." },
  ],
  faq: [
    { q: "Which size should I choose?", a: "{wa:Send us your pet's weight and size on WhatsApp and we'll recommend the right model.|Add your pet's weight and size to the order note and we'll recommend the right model on the confirmation call.}" },
    { q: "How do I clean it?", a: "Follow the care instructions: most dirt comes off with soapy water." },
  ],
  story: [
    { title: "Because they're *family*", text: "A happy pet means a happier home. We chose {product} for their comfort and your peace of mind. Delivered to your door, paid only on arrival." },
  ],
  comparison: [
    { label: "Sturdiness", us: "Survives playtime", them: "Ruined in days" },
    { label: "Cleaning", us: "Easy", them: "Complicated" },
    { label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { label: "Before paying", us: "You check the parcel", them: "No checking" },
  ],
  marquee: ["Comfort", "Sturdy", "Easy to clean", "Happy pets", "Cash on delivery"],
};

const tech: FamilyCopy = {
  kicker: ["{product}", "{product} · Tech"],
  headline: [
    { t: "Technology that *simplifies* your day.", s: "noun-phrase" },
    { t: "Plug it in, it's ready. *Really*.", s: "imperative" },
    { t: "Small size, *big comfort* every day.", s: "contrast-pair" },
    { t: "Take it out of the box, *it's ready*.", s: "imperative" },
    { t: "*Size.* It fits in a pocket and works every day.", s: "word-subline" },
  ],
  sub: [
    "You'll master {product} in seconds. Compact, practical, made to go everywhere with you.",
    "Instant to use, carefully finished: the gadget you actually use, every day.",
  ],
  bigWord: ["Smart", "Tech"],
  tagline: ["Instant to use, made for every day", "Compact, practical, always ready"],
  benefitsTitle: ["What makes it *essential*", "Made for *your day*"],
  benefits: [
    { icon: "bolt", title: "Ready in seconds", text: "No complicated settings: switch it on and use it." },
    { icon: "bag", title: "Compact", text: "It slips into a pocket, a bag or a glovebox." },
    { icon: "battery", title: "Battery for your day", text: "Charge it and forget it: it keeps up with you." },
    { icon: "shield-check", title: "Careful finish", text: "Pleasant materials in the hand and solid assembly." },
    { icon: "check", title: "Compatible", text: "Works with your everyday devices, no complicated adapters." },
    { icon: "user", title: "For everyone", text: "Easy to understand, even for people who dislike gadgets." },
  ],
  problemTitle: ["Gadgets that *end up in a drawer*", "Tech *should be simple*"],
  pains: [
    { pain: "Devices that are a pain to set up", fix: "Ready in seconds, no setup" },
    { pain: "Batteries that die too soon", fix: "Battery made for your day" },
    { pain: "Fragile gadgets", fix: "Solid assembly, careful finish" },
    { pain: "Paying online without trying", fix: "You check before paying" },
  ],
  solution: ["The gadget you actually use: *{product}*.", "Tech, made simpler: *{product}*."],
  showcaseTitle: ["Every detail, *explained*", "From every angle"],
  stepsTitle: ["Ready in *three steps*", "Getting started"],
  steps: [
    { icon: "box", title: "Unbox", text: "Everything is in the box, ready to use." },
    { icon: "battery", title: "Charge", text: "A full first charge before first use." },
    { icon: "bolt", title: "Use", text: "Switch it on: it's instantly familiar." },
  ],
  faq: [
    { q: "Is it compatible with my phone?", a: "{wa:Send us your device model on WhatsApp and we'll confirm compatibility before shipping.|Add your device model to the order note and we'll confirm compatibility on the confirmation call, before shipping.}" },
    { q: "What's in the box?", a: "The device and its basic accessories. You check the contents on delivery, before paying." },
  ],
  story: [
    { title: "Tech, *no headaches*", text: "We test a lot of gadgets; few deserve a spot in your pocket. {product} is one of them: simple, solid, useful every day. And to order with confidence, you pay on delivery." },
  ],
  comparison: [
    { label: "Getting started", us: "Instant", them: "Complicated settings" },
    { label: "Size", us: "Compact, portable", them: "Bulky" },
    { label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { label: "Before paying", us: "You check the device", them: "No checking" },
  ],
  marquee: ["Ready to use", "Compact", "Practical", "Careful finish", "Cash on delivery"],
};

const auto: FamilyCopy = {
  kicker: ["{product}", "{product} · Car & tools"],
  headline: [
    { t: "The right tool, *a job well done*.", s: "noun-phrase" },
    { t: "Made for hands *that work*.", s: "noun-phrase" },
    { t: "Tough, precise, *ready to work*.", s: "noun-phrase" },
    { t: "Pick up the tool, *do the job*.", s: "imperative" },
    { t: "*Grip.* Solid in the hand, precise at work.", s: "word-subline" },
  ],
  sub: [
    "{product}: a solid grip and a clean result, in the garage, at home or on the road.",
    "Built to last and to be used often. A serious tool, delivered to your door, paid on arrival.",
  ],
  bigWord: ["Pro", "Garage"],
  tagline: ["Tough, precise, ready to work", "The serious tool for a clean result"],
  benefitsTitle: ["Why it *lasts*", "Built to *work*"],
  benefits: [
    { icon: "shield-check", title: "Tough", text: "Materials chosen for heavy use, day after day." },
    { icon: "hand-heart", title: "Good grip", text: "It sits well in the hand, even on long jobs." },
    { icon: "ruler", title: "A precise result", text: "Clean work, first time." },
    { icon: "bolt", title: "Fast", text: "You save time on every job." },
    { icon: "bag", title: "Easy to store", text: "It fits in the trunk, the toolbox or the workshop." },
    { icon: "user", title: "For everyone", text: "Weekend DIYer or pro, it adapts to your level." },
  ],
  problemTitle: ["Tools that *fail* at the worst moment", "Tired of *sloppy* results?"],
  pains: [
    { pain: "Cheap tools that break fast", fix: "Tough, made for heavy use" },
    { pain: "Approximate results", fix: "Clean work, first time" },
    { pain: "Time lost on every task", fix: "Fast and effective" },
    { pain: "Buying without seeing the quality", fix: "You check before paying" },
  ],
  solution: ["The right tool for a job well done: *{product}*.", "Tough and precise: *{product}*."],
  showcaseTitle: ["Built *to last*", "Up close"],
  stepsTitle: ["To work, *in three steps*", "How to use"],
  steps: [
    { icon: "box", title: "Unbox", text: "Check the included accessories before first use." },
    { icon: "info", title: "Prepare", text: "Read the safety instructions and set up in a clear space." },
    { icon: "check", title: "Get to work", text: "Instant handling, clean result." },
  ],
  faq: [
    { q: "Is it suitable for regular use?", a: "Yes, it's made to be used often. Follow the use and care instructions to keep it for years." },
    { q: "Does it fit my vehicle?", a: "{wa:Send us your car's make and model on WhatsApp and we'll confirm before shipping.|Add your car's make and model to the order note and we'll confirm on the confirmation call, before shipping.}" },
  ],
  story: [
    { title: "A *serious* tool", text: "A good tool is one you still have years later. We chose {product} for its toughness and precision. Delivered to your door, and you only pay after checking the parcel." },
  ],
  comparison: [
    { label: "Toughness", us: "Made for heavy use", them: "Breaks fast" },
    { label: "Result", us: "Clean and precise", them: "Approximate" },
    { label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { label: "Before paying", us: "You check the tool", them: "No checking" },
  ],
  marquee: ["Tough", "Precise", "Fast", "Built to last", "Cash on delivery"],
};

const terroir: FamilyCopy = {
  kicker: ["{product}", "{product} · Heritage food"],
  headline: [
    { t: "The *true* taste of the land, delivered home.", s: "noun-phrase" },
    { t: "Like *grandma's*, simply.", s: "noun-phrase" },
    { t: "An *authentic* product, chosen with care.", s: "noun-phrase" },
    { t: "Serve it the way *you do at home*.", s: "imperative" },
    { t: "*Taste.* The land's flavour, packed with care.", s: "word-subline" },
  ],
  sub: [
    "{product}: carefully selected, authentic in taste, packed to keep all its freshness.",
    "For everyday cooking and big family tables: an authentic product, delivered to your door.",
  ],
  bigWord: ["Beldi", "Origin"],
  tagline: ["Authentic, carefully selected", "The taste of the land, delivered home"],
  benefitsTitle: ["What makes *the difference*", "Tradition, *as we love it*"],
  benefits: [
    { icon: "leaf", title: "Authentic", text: "Selected for its taste, just as we love it at home." },
    { icon: "map-pin", title: "Known origin", text: "We know where it comes from and how it's made." },
    { icon: "box", title: "Carefully packed", text: "Packaging that keeps freshness and aroma." },
    { icon: "heart", title: "For the whole family", text: "For the everyday table and for guests." },
    { icon: "gift", title: "A lovely gift", text: "Share the taste of tradition with people you love." },
    { icon: "sun", title: "The taste of yesterday", text: "Honest flavors, no shortcuts." },
  ],
  problemTitle: ["Hard to find *the real thing*?", "Tired of products with *no taste*?"],
  pains: [
    { pain: "Products of unknown origin", fix: "Known origin, carefully selected" },
    { pain: "A taste nothing like the original", fix: "Authentic flavors" },
    { pain: "Packaging that damages the product", fix: "Careful packing" },
    { pain: "Paying upfront without seeing it", fix: "You check before paying" },
  ],
  solution: ["Authentic taste, delivered home: *{product}*.", "Tradition as we love it: *{product}*."],
  showcaseTitle: ["Where it *comes from*", "Up close"],
  stepsTitle: ["How to *enjoy it*", "In the kitchen"],
  steps: [
    { icon: "box", title: "Receive", text: "Delivered well packed, ready for your kitchen." },
    { icon: "leaf", title: "Store", text: "Away from heat and light, tightly closed." },
    { icon: "heart", title: "Enjoy", text: "At breakfast, in cooking or as a gift: your choice." },
  ],
  faq: [
    { q: "How should I store it?", a: "In a cool, dry place away from light, tightly closed after each use." },
    { q: "Where does it come from?", a: "{wa:Message us on WhatsApp and we'll tell you about its origin and how it's made.|Ask us on the confirmation call and we'll tell you about its origin and how it's made.}" },
  ],
  story: [
    { title: "The taste *of home*", text: "Some flavors take us straight back home. We selected {product} for that authenticity: a real product, carefully packed, delivered to your door with cash on delivery." },
  ],
  comparison: [
    { label: "Origin", us: "Known and chosen", them: "Unknown" },
    { label: "Taste", us: "Authentic", them: "Bland or artificial" },
    { label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { label: "Before paying", us: "You check the parcel", them: "No checking" },
  ],
  marquee: ["Authentic", "Traditional", "Made with care", "Real taste", "Cash on delivery"],
};

const general: FamilyCopy = {
  kicker: ["{product}", "{product} · Essentials"],
  headline: [
    { t: "The small thing that *changes* your day.", s: "noun-phrase" },
    { t: "Simple, practical, *well thought out*.", s: "noun-phrase" },
    { t: "The one you'll end up *recommending* to everyone.", s: "noun-phrase" },
    { t: "Keep it within reach, *use it* every day.", s: "imperative" },
    { t: "*Useful.* The small thing that helps out.", s: "word-subline" },
  ],
  sub: [
    "{product} helps out every day. Practical, sturdy, easy to use. Delivered home, paid on arrival.",
    "Made to make life simpler, no complications. You check the parcel before paying.",
  ],
  bigWord: ["Essential", "Easy"],
  tagline: ["Practical, sturdy, easy to use", "The small extra in your day"],
  benefitsTitle: ["Why you'll *love it*", "What makes it *practical*"],
  benefits: [
    { icon: "check", title: "Simple to use", text: "No complicated manual: you see right away how it works." },
    { icon: "shield-check", title: "Sturdy", text: "Materials chosen for everyday use." },
    { icon: "clock", title: "Time saved", text: "It makes small tasks faster and nicer." },
    { icon: "bag", title: "Practical", text: "Easy to store, easy to carry." },
    { icon: "heart", title: "For the whole family", text: "Everyone finds their own use for it." },
    { icon: "gift", title: "A good gift idea", text: "Useful and pleasant: a present that actually gets used." },
  ],
  problemTitle: ["Had *enough* too?", "Everyday life deserves *simpler*"],
  pains: [
    { pain: "Products that don't keep their promises", fix: "A simple product that does its job" },
    { pain: "Flimsy items", fix: "Sturdy, made for every day" },
    { pain: "Complicated solutions", fix: "Instant to use" },
    { pain: "Paying upfront without seeing it", fix: "You check before paying" },
  ],
  solution: ["The small extra in your day: *{product}*.", "Simple and well thought out: *{product}*."],
  showcaseTitle: ["Take a *closer look*", "Every detail"],
  stepsTitle: ["As simple as *that*", "How it works"],
  steps: [
    { icon: "box", title: "Unbox", text: "It arrives ready to use." },
    { icon: "hand-heart", title: "Use", text: "It's instantly familiar." },
    { icon: "heart", title: "Enjoy", text: "Everyday life gets simpler from day one." },
  ],
  faq: [
    { q: "How do I use it?", a: "It's simple to use, no special settings. A question? {wa:Our team answers on WhatsApp.|Ask it on the confirmation call.}" },
    { q: "Is it a good gift?", a: "Yes, useful and pleasant. If it's a gift, mention it in your order note." },
  ],
  story: [
    { title: "Why we *chose it*", text: "We select few products, but we choose them well. {product} won us over with its simplicity and sturdiness. It's delivered to your door and you only pay after checking the parcel." },
  ],
  comparison: [
    { label: "Use", us: "Simple, immediate", them: "Complicated" },
    { label: "Sturdiness", us: "Built to last", them: "Flimsy" },
    { label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { label: "Before paying", us: "You check the parcel", them: "No checking" },
  ],
  marquee: ["Practical", "Sturdy", "Simple", "Well made", "Cash on delivery"],
};

/**
 * Modest wear: abaya, prayer dress or set, hijab, khimar, djellaba, kaftan, for women and girls.
 * Calm, soft and precise: fabric, cut, comfort, size, care. Nothing beyond comfort and modesty (no
 * spiritual promises), no exaggeration.
 */
const modest: FamilyCopy = {
  kicker: ["{product}", "{product} · Modest wear"],
  headline: [
    { t: "Flowing, covering, *quietly* elegant.", s: "noun-phrase" },
    { t: "A *soft* drape, a calm silhouette.", s: "noun-phrase" },
    { t: "Modesty, worn *softly*.", s: "noun-phrase" },
    { t: "Cover with *softness*, from morning to night.", s: "imperative" },
    { t: "*Drape.* A loose cut that moves with you.", s: "word-subline" },
  ],
  sub: [
    "A soft fabric that drapes freely and a loose cut that covers without clinging: a calm piece from morning to night.",
    "A pleasant fabric, clean finishing and a simple, graceful look, for every day and for special occasions.",
  ],
  bigWord: ["Grace", "Softness"],
  tagline: ["Flowing, covering, elegant", "A modest look, softly done"],
  benefitsTitle: ["What makes it *so soft*", "Modest, and *a joy to wear*"],
  benefits: [
    { topic: "fabric", icon: "feather", title: "A soft, flowing fabric", text: "Gentle on the skin, it drapes freely and moves with you." },
    { topic: "cover", icon: "shield-check", title: "A loose, covering cut", text: "It covers without clinging or squeezing, for a calm, confident look." },
    { topic: "comfort", icon: "sun", title: "Comfortable all day", text: "Easy to wear, the piece is soon forgotten, at home or out." },
    { topic: "finish", icon: "check", title: "Careful finishing", text: "Neat seams and even hems keep the piece looking right, wash after wash." },
    { topic: "care", icon: "drop", title: "Easy care", text: "A gentle wash, dry flat, and the piece falls softly again." },
    { topic: "size", icon: "ruler", title: "Easy to size", text: "Compare with a piece that fits you well: we confirm the size with you before shipping." },
  ],
  problemTitle: ["Modest *shouldn't mean* uncomfortable", "Finding the right piece *online*"],
  pains: [
    { topic: "fabric", pain: "Fabric that clings or itches", fix: "A soft fabric that drapes freely" },
    { topic: "cover", pain: "A cut that's too close to the body", fix: "A loose cut that covers without squeezing" },
    { topic: "size", pain: "A size that doesn't match the photo", fix: "You check the piece on delivery, before paying" },
    { topic: "pay", pain: "Paying upfront without touching the fabric", fix: "Cash on delivery, after checking" },
  ],
  solution: ["Calm, covering elegance: *{product}*.", "The softness of a modest look: *{product}*."],
  showcaseTitle: ["The details, *up close*", "Fabric, cut, *finishing*"],
  stepsTitle: ["Choosing is *simple*", "Simple, *from choice to delivery*"],
  steps: [
    { topic: "size", icon: "ruler", title: "Pick the size", text: "Compare with a piece that fits you well. For a long piece, measure from shoulder to ankle." },
    { topic: "order", icon: "check", title: "Place your order", text: "Name, phone, city: our team calls you to confirm your order." },
    { topic: "check", icon: "eye", title: "Check, then pay", text: "Open the parcel in front of the courier, feel the fabric, then pay." },
  ],
  faq: [
    {
      topic: "size",
      q: "How do I choose the right size?",
      a: "Compare with a piece that fits you well. For a long piece, measure from shoulder to ankle. {wa:Send us the measurement on WhatsApp and we'll advise you before shipping.|Add it to the order note and we'll confirm it with you on the confirmation call.}",
    },
    { topic: "fabric", q: "What is the fabric like?", a: "Soft to the touch and flowing. On delivery, you open the parcel and check the fabric before paying." },
    { topic: "care", q: "How do I care for it?", a: "Follow the label: gentle wash inside out, dry flat and a cool iron. The fabric keeps its drape." },
  ],
  story: [
    {
      title: "Modesty, *softly*",
      text: "We wanted a piece that covers with elegance without giving up comfort: a gentle fabric, a loose cut, clean finishing. That's the idea behind {product}. Delivered to your door, paid only on arrival.",
    },
    {
      title: "A *calm* look",
      text: "Some pieces you put on without thinking and feel good in all day. That's what we looked for in {product}: a soft fabric, an easy drape, a covering cut. Home delivery, cash on arrival.",
    },
  ],
  comparison: [
    { topic: "fabric", label: "Fabric", us: "Soft and flowing", them: "Rough or clingy" },
    { topic: "cover", label: "Cut", us: "Loose and covering", them: "Close to the body" },
    { topic: "pay", label: "Payment", us: "Cash on delivery", them: "Paid upfront" },
    { topic: "size", label: "Size", us: "Checked before you pay", them: "Bad surprise when unboxing" },
  ],
  marquee: ["Flowing fabric", "Loose cut", "Clean finishing", "Modest elegance", "Cash on delivery"],
  voice: {
    heroCta: ["Order now"],
    ctaButton: ["Order now"],
    sticky: ["Order now"],
    ctaTitle: ["A soft look, *delivered to your door*", "All that's left is *your choice*"],
  },
  facets: {
    prayer: {
      kicker: ["{product} · For prayer"],
      headline: ["A *soft* prayer garment, loose and covering.", "Loose for every movement, *soft* for every prayer.", "Pray *at ease*, softly covered."],
      sub: [
        "A soft fabric that doesn't cling and a loose cut that lets you bow and prostrate freely: it goes on in a moment when it's time to pray.",
        "Covering, comfortable and easy to fold, it comes with you to every prayer, at home or on the road.",
      ],
      bigWord: ["Serenity"],
      tagline: ["A soft, covering prayer garment", "Loose, soft, ready for prayer"],
      benefits: [
        { topic: "prayer", icon: "hand-heart", title: "Free in every movement", text: "Loose where it matters: bow and prostrate without the fabric pulling or riding up." },
        { topic: "quick", icon: "clock", title: "Ready in a moment", text: "Slip it over your everyday clothes when it's time to pray, then fold it into a bag." },
      ],
      pains: [{ topic: "cover", pain: "A garment that pulls or rides up during prayer", fix: "A loose cut, free in every movement" }],
      story: [
        {
          title: "Made *for prayer*",
          text: "When it's time to pray, you want something that covers well, never gets in the way and goes on in a moment. That's the idea behind {product}: a soft fabric, a loose cut, careful finishing. Home delivery, cash on arrival.",
        },
      ],
      comparison: [{ topic: "cover", label: "For prayer", us: "Loose, free to move", them: "Tight or too short" }],
      marquee: ["For prayer", "Loose and soft"],
    },
    girls: {
      kicker: ["{product} · For girls"],
      headline: ["Soft like her, *covering* just right.", "Her very own, *soft* and easy to slip on.", "Grown-up elegance, *in her size*."],
      sub: [
        "A soft fabric that doesn't itch, a loose cut that lets her move freely, and sizes by age.",
        "Soft on the skin and covering without getting in her way: a piece made to her measure, one she'll love to wear.",
      ],
      tagline: ["Soft and covering, made for girls", "Modest elegance, in her size"],
      benefits: [
        { topic: "easy", icon: "heart", title: "Easy to put on herself", text: "She slips it on without help, and the soft fabric doesn't itch." },
        { topic: "size", icon: "ruler", title: "In her size", text: "Sizes go by age, and we confirm the right one with you before shipping." },
      ],
      pains: [{ topic: "fabric", pain: "Itchy fabric she refuses to wear", fix: "A soft fabric she's happy to keep on" }],
      steps: [{ topic: "size", icon: "ruler", title: "Pick her size", text: "Sizes go by age: compare with a piece that fits her. Between two sizes, go for the larger one." }],
      faq: [
        {
          topic: "size",
          q: "Which size for my daughter?",
          a: "Sizes go by age. Compare with a piece that fits her well; for a long piece, measure from shoulder to ankle. Between two sizes, choose the larger one: she'll wear it longer. {wa:Send us her age and measurement on WhatsApp and we'll advise you.|Add her age and measurement to the order note and we'll confirm the size on the confirmation call.}",
        },
      ],
      story: [
        {
          title: "Made for *little girls*",
          text: "Little girls love doing what the grown-ups do. We wanted a piece made to their measure: a soft fabric that doesn't itch, a loose cut, easy to put on alone. That's {product}. Home delivery, cash on arrival.",
        },
      ],
      comparison: [{ topic: "size", label: "Size", us: "By age, checked before paying", them: "Too big or too short" }],
      marquee: ["Made for girls", "Gentle on the skin"],
    },
    kids: {
      kicker: ["{product} · For kids"],
      headline: ["Soft, covering, *in their size*.", "A *soft* piece, easy to slip on."],
      sub: ["A soft fabric that doesn't itch, a loose cut that lets them move freely, and sizes by age."],
      tagline: ["Soft and covering, made for kids"],
      benefits: [
        { topic: "easy", icon: "heart", title: "Easy to put on", text: "It goes on without help, and the soft fabric doesn't itch." },
        { topic: "size", icon: "ruler", title: "In their size", text: "Sizes go by age, and we confirm the right one with you before shipping." },
      ],
      steps: [{ topic: "size", icon: "ruler", title: "Pick the size", text: "Sizes go by age: compare with a piece that fits your child. Between two sizes, go for the larger one." }],
      faq: [
        {
          topic: "size",
          q: "Which size for my child?",
          a: "Sizes go by age. Compare with a piece that fits them well; for a long piece, measure from shoulder to ankle. Between two sizes, choose the larger one. {wa:Send us their age and measurement on WhatsApp and we'll advise you.|Add their age and measurement to the order note and we'll confirm the size on the confirmation call.}",
        },
      ],
      comparison: [{ topic: "size", label: "Size", us: "By age, checked before paying", them: "Too big or too short" }],
      marquee: ["Made for kids"],
    },
    lace: {
      headline: ["The finesse of *lace*, the ease of a loose cut."],
      bigWord: ["Lace"],
      benefits: [{ topic: "lace", icon: "asterisk", title: "Delicate lace", text: "A touch of lace that dresses the piece with finesse, never heavy." }],
      faq: [
        {
          topic: "care",
          q: "How do I care for the lace?",
          a: "Gentle wash inside out or by hand, no hard wringing, then dry flat. Iron on low, never directly on the lace.",
        },
      ],
      comparison: [{ topic: "finish", label: "Finishing", us: "Fine lace, neat seams", them: "Scratchy lace that frays" }],
      marquee: ["Delicate lace"],
    },
    veil: {
      headline: ["A *soft* veil that drapes in a moment.", "Frames the face, *softly*.", "Everyday elegance, *simply*."],
      sub: [
        "A soft fabric that drapes easily and goes with everything you wear, from weekdays to special occasions.",
        "Gentle around the face, easy to adjust and pin: a piece you put on every day without a second thought.",
      ],
      tagline: ["Soft, easy to drape, elegant", "Goes with every outfit"],
      benefits: [
        { topic: "cover", icon: "waves", title: "An easy drape", text: "It goes on and settles in a few moves, framing the face softly." },
        { topic: "size", icon: "star", title: "Easy to match", text: "It works with your everyday clothes as well as your dressier looks." },
      ],
      pains: [
        { topic: "cover", pain: "A veil that creases and comes undone", fix: "A supple fabric that drapes easily" },
        { topic: "size", pain: "A color that's not like the photo", fix: "You check the shade before paying" },
      ],
      steps: [{ topic: "size", icon: "eye", title: "Pick the shade", text: "Choose a color that suits your wardrobe: you check it on delivery, before paying." }],
      faq: [{ topic: "size", q: "How do I wear it?", a: "Simply placed and pinned under the chin, or wrapped around the face: it drapes many ways, to suit your style." }],
      story: [
        {
          title: "Everyday *elegance*",
          text: "We wanted a piece you put on every morning without thinking: soft around the face, easy to drape, matching everything. That's the idea behind {product}. Home delivery, cash on arrival.",
        },
      ],
      comparison: [
        { topic: "cover", label: "Drape", us: "Easy, in a moment", them: "Slips and comes undone" },
        { topic: "size", label: "Color", us: "Checked before you pay", them: "Not like the photo" },
      ],
      marquee: ["Easy drape", "Soft around the face"],
    },
  },
};

export const EN: LocaleLibrary = {
  common: {
    heroCta: ["Order now", "Place my order", "Order, pay on delivery"],
    announcement: ["Cash on delivery", "{delivery}", "Check your parcel before paying", "{wa:Questions? We answer on WhatsApp|We call you to confirm your order}"],
    trust: [
      { icon: "cash-hand", text: "Cash on delivery" },
      { icon: "truck", text: "{delivery}" },
      { icon: "eye", text: "Check before you pay" },
      { icon: "headset", text: "{wa:Customer care on WhatsApp|Order confirmed by phone}" },
    ],
    kickers: {
      benefits: ["Why we love it", "The benefits"],
      problem: ["The problem", "We know the feeling"],
      showcase: ["Up close", "In detail"],
      steps: ["How to use", "How it works"],
      story: ["Our story", "Why this one"],
      reviews: ["Customer reviews", "They received it"],
      socialProof: ["Your messages", "They write to us"],
      gallery: ["In pictures", "Gallery"],
      specs: ["Specifications", "Product sheet"],
      offer: ["The offers", "Pick your pack"],
      guarantee: ["Our commitment", "Order with peace of mind"],
      form: ["Quick order", "Order in a moment"],
      cta: ["Last step", "Ready?"],
      faq: ["FAQ", "Your questions"],
    },
    benefitsLead: ["No vague promises: here's what actually changes.", "What you'll notice in the first days."],
    problemLead: ["If one of these sounds like you, read on.", "We've all been there. Good news: there's a simpler way."],
    showcaseLead: ["What a photo from afar can't show, explained point by point.", "The details that make a difference every day."],
    reviewsTitle: ["Received, tried, *adopted*", "What our *customers* say"],
    socialProofTitle: ["Delivered, delighted, and they *recommend it*", "Messages that *make our day*"],
    galleryTitle: ["From *every angle*", "Take a closer look"],
    specsTitle: ["Everything you need *to know*", "The *full* product sheet"],
    comparison: { title: ["Why choose it *from us*", "The difference, *point by point*"], us: "With us", them: "Elsewhere" },
    offer: {
      title: ["Choose your *offer*", "The more you take, *the more you save*"],
      lead: ["Every offer is paid on delivery. Choose, and we'll call you to confirm.", "Home delivery and cash on delivery on every offer."],
      cta: ["I'll take this pack", "Choose this offer"],
    },
    guarantee: {
      title: ["Order with *peace of mind*", "Zero risk, *nothing upfront*"],
      lines: [
        "You pay nothing online: you pay cash when it arrives.",
        "You open and check your parcel in front of the courier before paying.",
        "{wa:A problem with your order? Our team answers on WhatsApp.|A problem with your order? Contact us and we'll sort it out together.}",
        "Our team calls you to confirm before shipping.",
      ],
    },
    form: {
      title: ["Order now, pay *at the door*", "Get it *delivered home*"],
      lead: ["Fill in the form and an advisor calls you to confirm. You only pay when the parcel arrives.", "A few fields and you're done. Cash on delivery."],
      submit: ["Confirm my order", "Order, pay on delivery"],
      reassurance: ["You only pay on arrival, after seeing your parcel.", "No online payment. You check before paying."],
    },
    cta: {
      title: ["Ready to *try it*?", "Order now, *pay at the door*"],
      text: ["Order in thirty seconds. You pay on delivery, after checking your parcel.", "{delivery}. Cash on delivery, nothing upfront."],
      button: ["Order now", "Place my order"],
    },
    faqTitle: ["Your questions, *our answers*", "Everything you want *to know*"],
    faq: {
      cod: [
        { q: "How does payment work?", a: "You pay the courier in cash when your parcel arrives. No online payment, no card." },
        { q: "Do I have to pay anything upfront?", a: "No. You pay nothing when ordering: payment is made in cash on delivery." },
      ],
      delivery: [
        { q: "How long does delivery take?", a: "{delivery}. Our team calls you to confirm the order and address before shipping." },
        { q: "Do you deliver to my city?", a: "We deliver {where}. Enter your city in the form and we'll confirm everything by phone." },
      ],
      inspect: [
        { q: "Can I check the parcel before paying?", a: "Yes. You open the parcel in front of the courier, check the product, then pay." },
        { q: "What if the product isn't what I expected?", a: "You check it on delivery, before paying. If there's an issue, {wa:message us on WhatsApp|contact us} and we'll find a solution." },
      ],
      exchange: [
        { q: "Can I exchange my product?", a: "{wa:Message us on WhatsApp|Contact us} with your order number and our team will explain the exchange conditions." },
        { q: "What if there's a problem after delivery?", a: "{wa:Message us on WhatsApp with a photo|Contact us with your order number and a photo}: our customer care team will reply and help you." },
      ],
    },
    sticky: { label: ["Order now", "Order"], note: ["Cash on delivery", "Pay on arrival"] },
    whatsapp: {
      label: ["A question? Message us", "We answer on WhatsApp"],
      message: ["Hello, I have a question about {product}.", "Hello, I'd like to order {product}."],
    },
    bundles: [
      { title: "1 piece", subtitle: "To try it" },
      { title: "Duo pack", subtitle: "For you and someone close" },
      { title: "Trio pack", subtitle: "Best price per piece" },
    ],
    offers: {
      choice: { title: "Your choice", subtitle: "Pick your favorite" },
      anyN: { title: "Any {n}", subtitle: "Build your own pack" },
      duo: { title: "The duo", subtitle: "Both together" },
      trio: { title: "The full trio", subtitle: "All three together" },
      set: { title: "Complete set", subtitle: "The whole range in one box", short: "Full set" },
      bogo: { title: "Buy 1, get 1 free", subtitle: "The second piece is free", short: "1 + 1" },
      colors: { title: "{n}-color pack", subtitle: "One piece in each color", short: "{n} colors" },
    },
    seo: {
      title: ["{product} | Cash on delivery", "{product} | Fast delivery, pay on arrival"],
      description: [
        "Order {product} online and pay on delivery. {delivery}. Check your parcel before paying.",
        "{product}: delivered to your door, paid in cash on arrival. Ordering takes a few taps.",
      ],
    },
    thankYou: {
      title: ["Thank you, your order is *in*", "Got it, *thank you*"],
      message: [
        "Our team will call you shortly to confirm your order and address. Keep your phone close.",
        "An advisor will call you to confirm. You'll pay on delivery, after checking your parcel.",
      ],
    },
    where: { MA: "all over Morocco", other: "across our delivery area" },
  },
  families: { skincare, haircare, fragrance, jewelry, fashion, modest, wellness, fitness, kitchen, home, kids, pets, tech, auto, terroir, general },
};
