/**
 * Bibliothèque de copy : français (Maroc d'abord, Europe ensuite).
 * Ton : chaleureux, précis, rassurant sur le paiement à la livraison. Phrases courtes, verbes
 * concrets, zéro superlatif creux, aucun chiffre inventé, aucune promesse médicale.
 */
import type { FamilyCopy, LocaleLibrary } from "./types";

const skincare: FamilyCopy = {
  kicker: ["{product}", "{product} · Soin quotidien"],
  headline: [
    { t: "Une peau *nourrie* qui se voit, et qui se sent.", s: "noun-phrase" },
    { t: "Le geste soin qui rend la peau *douce* au toucher.", s: "noun-phrase" },
    { t: "Moins de produits, une peau plus *confortable*.", s: "contrast-pair" },
    { t: "Gardez le geste simple, la peau *confortable*.", s: "imperative" },
    { t: "*Douceur.* Un soin qui tient sa place matin et soir.", s: "word-subline" },
  ],
  sub: [
    "Une texture qui pénètre vite, sans film gras. {product} se glisse dans votre routine du matin comme du soir.",
    "Pensé pour les peaux qui tiraillent et manquent d'éclat. Un geste simple, un fini net, un confort qui dure.",
  ],
  bigWord: ["Éclat", "Soin"],
  tagline: ["Le soin qui simplifie votre routine", "Douceur et confort au quotidien"],
  benefitsTitle: ["Ce que votre peau va *remarquer*", "Pensé pour votre *routine*"],
  benefits: [
    { icon: "drop", title: "Une texture qui pénètre vite", text: "Elle s'étale facilement et laisse la peau nette, sans effet collant. Vous pouvez enchaîner avec le maquillage." },
    { icon: "feather", title: "Un toucher tout doux", text: "Dès l'application, la peau est plus souple et plus agréable au toucher." },
    { icon: "sun", title: "Un teint plus lumineux", text: "Une peau bien nourrie renvoie mieux la lumière : le visage paraît reposé." },
    { icon: "clock", title: "Un geste rapide", text: "Quelques secondes matin et soir suffisent. Pas besoin d'une routine en dix étapes." },
    { icon: "heart", title: "Agréable à utiliser", text: "Un parfum discret et une texture légère qui donnent envie de le reprendre chaque jour." },
    { icon: "box", title: "Un format qui dure", text: "Une petite quantité suffit à chaque application : le flacon vous accompagne longtemps." },
  ],
  problemTitle: ["Vous reconnaissez *ces matins-là* ?", "Votre peau mérite *plus simple*"],
  pains: [
    { pain: "La peau qui tiraille en milieu de journée", fix: "Une peau confortable du matin au soir" },
    { pain: "Des crèmes qui laissent un film gras", fix: "Une texture légère qui pénètre vite" },
    { pain: "Un teint terne malgré tous les produits", fix: "Une peau nourrie qui retrouve de l'éclat" },
    { pain: "Une routine trop longue pour vos matins", fix: "Un seul geste, quelques secondes" },
  ],
  solution: ["Une routine plus courte, une peau plus confortable : *{product}*.", "Un geste simple qui change vos journées : *{product}*."],
  showcaseTitle: ["Regardez-le *de près*", "Chaque détail compte"],
  stepsTitle: ["Aussi simple que *ça*", "Votre routine en trois gestes"],
  steps: [
    { icon: "drop", title: "Sur une peau propre", text: "Nettoyez et séchez doucement votre visage, matin ou soir." },
    { icon: "hand-heart", title: "Appliquez en douceur", text: "Une petite quantité, en légers mouvements, du centre vers l'extérieur du visage." },
    { icon: "clock", title: "Laissez pénétrer", text: "Une minute, et c'est prêt. Crème, maquillage ou oreiller : à vous de choisir." },
  ],
  faq: [
    { q: "Convient-il aux peaux sensibles ?", a: "Faites toujours un petit test dans le pli du coude avant la première utilisation. {wa:Un doute ? Écrivez-nous sur WhatsApp : on vous envoie la composition complète.|La composition complète figure sur l'emballage, et vous la vérifiez à la livraison, avant de payer.}" },
    { q: "Matin, soir, ou les deux ?", a: "Les deux sont possibles. Le soir, la peau profite de la nuit ; le matin, appliquez avant votre protection solaire." },
  ],
  story: [
    { title: "Pourquoi on l'a *choisi*", text: "On cherchait un soin simple, agréable, qui ne promet pas l'impossible mais qui tient parole au quotidien. {product}, c'est ce geste qu'on reprend chaque jour avec plaisir, et qu'on a voulu rendre accessible partout, avec le paiement à la livraison." },
  ],
  comparison: [
    { label: "Texture", us: "Légère, pénètre vite", them: "Souvent grasse ou collante" },
    { label: "Routine", us: "Un geste, quelques secondes", them: "Plusieurs produits à superposer" },
    { label: "Paiement", us: "À la livraison", them: "Carte bancaire exigée" },
    { label: "Avant de payer", us: "Vous vérifiez votre colis", them: "Vous payez à l'aveugle" },
  ],
  marquee: ["Peau douce", "Texture légère", "Éclat naturel", "Geste simple", "Payé à la livraison"],
};

const haircare: FamilyCopy = {
  kicker: ["{product}", "{product} · Soin cheveux"],
  headline: [
    { t: "Des cheveux *souples* que vous avez envie de toucher.", s: "noun-phrase" },
    { t: "Moins de frisottis, plus de *brillance*.", s: "contrast-pair" },
    { t: "Le soin qui rend vos longueurs *légères*.", s: "noun-phrase" },
    { t: "Brossez sans tirer, coiffez *sans lutter*.", s: "imperative" },
    { t: "*Souplesse.* Des longueurs qui se laissent coiffer.", s: "word-subline" },
  ],
  sub: [
    "{product} nourrit les longueurs sans les alourdir. Des cheveux plus faciles à coiffer, du brushing au chignon.",
    "Pour les cheveux secs, cassants ou abîmés par la chaleur : un geste simple pour retrouver de la douceur.",
  ],
  bigWord: ["Brillance", "Soin"],
  tagline: ["Des longueurs nourries, sans effet lourd", "Douceur et brillance, au quotidien"],
  benefitsTitle: ["Ce que vos cheveux vont *ressentir*", "Pensé pour vos *longueurs*"],
  benefits: [
    { icon: "drop", title: "Nourrit sans alourdir", text: "La formule enrobe la fibre et laisse les cheveux légers, jamais gras." },
    { icon: "sun", title: "Une brillance naturelle", text: "Des cheveux lissés reflètent mieux la lumière : ils paraissent en meilleure santé." },
    { icon: "feather", title: "Un démêlage facile", text: "Le peigne glisse, les nœuds se défont sans tirer ni casser." },
    { icon: "flame", title: "Avant le lisseur ou le séchoir", text: "Un geste à faire avant la chaleur, pour des longueurs plus confortables." },
    { icon: "heart", title: "Une odeur agréable", text: "Un parfum doux qui reste discrètement sur les cheveux." },
    { icon: "clock", title: "Un geste de deux minutes", text: "Sur cheveux humides ou secs, il s'intègre à votre routine sans rien compliquer." },
  ],
  problemTitle: ["Vos cheveux méritent *mieux*", "Vous reconnaissez *ça* ?"],
  pains: [
    { pain: "Des pointes sèches qui cassent", fix: "Des longueurs nourries et plus souples" },
    { pain: "Des frisottis dès qu'il fait humide", fix: "Une chevelure plus disciplinée" },
    { pain: "Des soins qui graissent les racines", fix: "Une texture légère, appliquée sur les longueurs" },
    { pain: "Des nœuds à chaque coup de peigne", fix: "Un démêlage qui glisse" },
  ],
  solution: ["Des cheveux plus doux, une routine plus simple : *{product}*.", "Le soin qui réconcilie vos longueurs avec la brosse : *{product}*."],
  showcaseTitle: ["Regardez-le *de près*", "Pensé dans les moindres détails"],
  stepsTitle: ["Trois gestes, c'est *tout*", "Mode d'emploi"],
  steps: [
    { icon: "drop", title: "Sur cheveux essorés", text: "Après le shampoing, essorez doucement avec une serviette." },
    { icon: "hand-heart", title: "Sur les longueurs", text: "Répartissez une petite quantité des longueurs aux pointes, en évitant les racines." },
    { icon: "feather", title: "Coiffez comme d'habitude", text: "Peignez, laissez sécher ou passez au séchoir : vos cheveux sont prêts." },
  ],
  faq: [
    { q: "Convient-il aux cheveux bouclés ou frisés ?", a: "Oui : il nourrit sans casser la boucle. Dosez selon l'épaisseur de vos cheveux, et ajoutez-en un peu sur les pointes si besoin." },
    { q: "Peut-on l'utiliser tous les jours ?", a: "Oui, en petite quantité sur les longueurs. Si vos cheveux sont fins, deux à trois fois par semaine suffisent." },
  ],
  story: [
    { title: "Un soin qui fait *simple*", text: "On voulait un produit qu'on garde dans la salle de bain parce qu'il marche, pas parce qu'il est joli. {product} est né de cette envie : un soin facile, agréable, livré chez vous et payé seulement à la réception." },
  ],
  comparison: [
    { label: "Effet sur les racines", us: "Appliqué sur les longueurs, jamais gras", them: "Racines vite alourdies" },
    { label: "Démêlage", us: "Le peigne glisse", them: "Nœuds et casse" },
    { label: "Paiement", us: "À la livraison", them: "Paiement en ligne obligatoire" },
    { label: "Avant de payer", us: "Vous vérifiez votre colis", them: "Aucune vérification" },
  ],
  marquee: ["Cheveux doux", "Brillance", "Sans effet gras", "Démêlage facile", "Payé à la livraison"],
};

const fragrance: FamilyCopy = {
  kicker: ["{product}", "{product} · Parfum"],
  headline: [
    { t: "Un sillage qu'on *remarque*, sans jamais déranger.", s: "noun-phrase" },
    { t: "Le parfum qu'on vous demandera *le nom*.", s: "noun-phrase" },
    { t: "Une signature *qui vous ressemble*.", s: "noun-phrase" },
    { t: "Portez-le le jour, *gardez-le* pour le soir.", s: "imperative" },
    { t: "*Sillage.* Discret de près, présent quand on s'approche.", s: "word-subline" },
  ],
  sub: [
    "{product} s'ouvre en douceur puis s'installe sur la peau. Un parfum à porter le jour comme le soir.",
    "Des notes travaillées pour durer et évoluer avec vous, du premier vaporisateur au soir.",
  ],
  bigWord: ["Parfum", "Sillage"],
  tagline: ["Une signature olfactive, élégante et tenace", "Le parfum qu'on garde tout près"],
  benefitsTitle: ["Ce qui le rend *inoubliable*", "Un parfum pensé pour *durer*"],
  benefits: [
    { icon: "clock", title: "Une belle tenue", text: "Vaporisé sur la peau et les vêtements, il vous accompagne au fil de la journée." },
    { icon: "waves", title: "Un sillage maîtrisé", text: "Présent sans être envahissant : on le sent quand on s'approche." },
    { icon: "gem", title: "Un flacon élégant", text: "Un bel objet qui a sa place sur la coiffeuse comme dans le sac." },
    { icon: "gift", title: "L'idée cadeau qui fait mouche", text: "Pour un anniversaire, l'Aïd ou un mariage : un cadeau qu'on est sûr de voir porté." },
    { icon: "sun", title: "Jour comme soir", text: "Assez doux pour le bureau, assez présent pour les grandes occasions." },
    { icon: "heart", title: "Une émotion", text: "Un parfum, c'est un souvenir : celui-ci reste attaché aux beaux moments." },
  ],
  problemTitle: ["Les parfums qui *disparaissent* en une heure", "Vous cherchez *votre* parfum ?"],
  pains: [
    { pain: "Un parfum qui s'évapore avant midi", fix: "Une tenue qui vous suit au fil de la journée" },
    { pain: "Des fragrances trop entêtantes", fix: "Un sillage élégant et maîtrisé" },
    { pain: "Payer cher sans pouvoir sentir avant", fix: "Payez à la livraison, après avoir vu le colis" },
    { pain: "Des copies à l'odeur chimique", fix: "Des notes travaillées, agréables du début à la fin" },
  ],
  solution: ["Une signature qui dure et qui vous ressemble : *{product}*.", "Le parfum qu'on retient : *{product}*."],
  showcaseTitle: ["Un flacon, *une histoire*", "De près"],
  stepsTitle: ["Bien le *porter*", "Le rituel parfum"],
  steps: [
    { icon: "drop", title: "Sur la peau propre", text: "Après la douche, sur une peau hydratée : le parfum tient mieux." },
    { icon: "heart", title: "Aux points chauds", text: "Cou, poignets, derrière les oreilles : là où la chaleur diffuse le parfum." },
    { icon: "feather", title: "Sans frotter", text: "Laissez sécher naturellement pour que les notes se révèlent dans l'ordre." },
  ],
  faq: [
    { q: "Combien de vaporisations faut-il ?", a: "Deux à trois suffisent. Ajoutez-en une sur les vêtements pour prolonger le sillage." },
    { q: "Est-ce un bon cadeau ?", a: "Oui : le flacon se présente joliment. Dites-le-nous en commentaire de commande si c'est pour offrir." },
  ],
  story: [
    { title: "Une signature, *pas une mode*", text: "Un parfum, on le choisit pour qu'il dise quelque chose de nous sans un mot. {product} a été pensé pour ça : une signature élégante, qu'on porte tous les jours, et qu'on reçoit chez soi en payant seulement à la livraison." },
  ],
  comparison: [
    { label: "Tenue", us: "Vous accompagne au fil de la journée", them: "S'évapore vite" },
    { label: "Sillage", us: "Élégant et maîtrisé", them: "Trop discret ou entêtant" },
    { label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { label: "Avant de payer", us: "Vous vérifiez le flacon", them: "Aucune vérification" },
  ],
  marquee: ["Sillage", "Élégance", "Tenue", "Idée cadeau", "Payé à la livraison"],
};

const jewelry: FamilyCopy = {
  kicker: ["{product}", "{product} · Bijou"],
  headline: [
    { t: "Le détail qui *illumine* toute la tenue.", s: "noun-phrase" },
    { t: "Une pièce qu'on porte, et qu'on *remarque*.", s: "noun-phrase" },
    { t: "Le bijou qu'on garde *pour longtemps*.", s: "noun-phrase" },
    { t: "Portez-le tous les jours, *pas seulement* le week-end.", s: "imperative" },
    { t: "*Éclat.* Une finition qui accroche la lumière.", s: "word-subline" },
  ],
  sub: [
    "{product} : une finition soignée, un éclat discret, à porter tous les jours ou pour les grandes occasions.",
    "Un design qui va avec tout, livré dans un bel écrin. Vous payez seulement à la réception.",
  ],
  bigWord: ["Éclat", "Bijou"],
  tagline: ["Une finition soignée, un éclat discret", "Le détail élégant de chaque jour"],
  benefitsTitle: ["Le détail qui *fait la différence*", "Pensé pour être *porté*"],
  benefits: [
    { icon: "gem", title: "Une finition soignée", text: "Chaque détail est poli avec soin : la pièce accroche la lumière sous tous les angles." },
    { icon: "feather", title: "Confortable à porter", text: "Léger et bien ajusté, on l'oublie… jusqu'au prochain compliment." },
    { icon: "star", title: "Va avec tout", text: "Jean le matin, caftan le soir : un style qui s'adapte à chaque tenue." },
    { icon: "gift", title: "Livré prêt à offrir", text: "Un écrin soigné pour un cadeau qui fait son effet dès l'ouverture." },
    { icon: "shield-check", title: "Pensé pour durer", text: "Rangez-le à l'abri de l'eau et des parfums : il garde son éclat." },
    { icon: "heart", title: "Une pièce qui a du sens", text: "Pour marquer une date, un succès ou simplement se faire plaisir." },
  ],
  problemTitle: ["Les bijoux qui *ternissent* en un mois", "Trouver la *bonne* pièce"],
  pains: [
    { pain: "Des bijoux qui noircissent vite", fix: "Une finition soignée, pensée pour durer" },
    { pain: "Des pièces trop voyantes pour tous les jours", fix: "Un éclat discret qui va avec tout" },
    { pain: "Commander en ligne sans voir la qualité", fix: "Vous vérifiez la pièce avant de payer" },
    { pain: "Un cadeau qui arrive sans présentation", fix: "Livré dans un écrin, prêt à offrir" },
  ],
  solution: ["Le détail élégant qu'on porte tous les jours : *{product}*.", "Une pièce qu'on garde, et qu'on transmet : *{product}*."],
  showcaseTitle: ["Chaque détail, *de près*", "Une pièce travaillée"],
  stepsTitle: ["Pour qu'il garde son *éclat*", "L'entretien, en trois gestes"],
  steps: [
    { icon: "drop", title: "Loin de l'eau et du parfum", text: "Mettez-le en dernier, après le parfum et la crème." },
    { icon: "feather", title: "Un chiffon doux", text: "Essuyez-le après l'avoir porté pour retirer les traces de doigts." },
    { icon: "box", title: "Dans son écrin", text: "Rangé à part, il ne se raye pas au contact des autres bijoux." },
  ],
  faq: [
    { q: "Comment choisir la bonne taille ?", a: "{wa:Écrivez-nous sur WhatsApp avec votre mesure : on vous conseille avant l'envoi.|Notez votre mesure dans la remarque de commande : on vous conseille lors de l'appel de confirmation.} À la livraison, vous vérifiez avant de payer." },
    { q: "Peut-on le porter tous les jours ?", a: "Oui. Retirez-le simplement pour la douche, le sport et la plage pour garder son éclat plus longtemps." },
  ],
  story: [
    { title: "Un éclat *sans excès*", text: "On aime les bijoux qui accompagnent la vie plutôt que de rester dans une boîte. {product} est pensé pour être porté : une finition soignée, un design qui va avec tout, et un paiement à la livraison pour commander l'esprit tranquille." },
  ],
  comparison: [
    { label: "Finition", us: "Soignée, polie avec attention", them: "Inégale, vite ternie" },
    { label: "Présentation", us: "Livré dans un écrin", them: "Sachet plastique" },
    { label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { label: "Avant de payer", us: "Vous vérifiez la pièce", them: "Aucune vérification" },
  ],
  marquee: ["Éclat", "Finition soignée", "Prêt à offrir", "Élégance", "Payé à la livraison"],
};

const fashion: FamilyCopy = {
  kicker: ["{product}", "{product} · Collection"],
  headline: [
    { t: "La pièce qui *simplifie* vos tenues.", s: "noun-phrase" },
    { t: "Un style net, un confort *de chaque instant*.", s: "noun-phrase" },
    { t: "Celle qu'on porte *encore et encore*.", s: "noun-phrase" },
    { t: "Enfilez, ajustez, *c'est parti* pour la journée.", s: "imperative" },
    { t: "*Coupe.* Une pièce qui tombe juste.", s: "word-subline" },
  ],
  sub: [
    "{product} : une coupe qui tombe bien, une matière agréable, et un style qui s'accorde à tout votre dressing.",
    "Du matin au soir, de la semaine au week-end : une pièce facile, pensée pour la vraie vie.",
  ],
  bigWord: ["Allure", "Silhouette"],
  tagline: ["Une coupe nette, un confort réel", "La pièce facile de votre dressing"],
  benefitsTitle: ["Pourquoi vous allez la *porter souvent*", "Pensée pour la *vraie vie*"],
  benefits: [
    { icon: "ruler", title: "Une coupe qui tombe bien", text: "Elle suit la silhouette sans serrer, pour une allure nette en un instant." },
    { icon: "feather", title: "Une matière agréable", text: "Douce au toucher, confortable du matin jusqu'au soir." },
    { icon: "star", title: "Facile à associer", text: "Elle va avec vos basiques comme avec vos pièces fortes." },
    { icon: "bag", title: "Pratique au quotidien", text: "Des détails pensés pour bouger, porter, ranger : la mode qui suit votre rythme." },
    { icon: "shield-check", title: "Des finitions soignées", text: "Coutures nettes et détails travaillés : elle garde sa tenue au fil des lavages." },
    { icon: "heart", title: "Le bon compromis", text: "Élégante sans en faire trop : une pièce qu'on sort sans réfléchir." },
  ],
  problemTitle: ["*Rien à me mettre*, encore ?", "Les achats en ligne qui *déçoivent*"],
  pains: [
    { pain: "Une taille qui ne correspond pas à la photo", fix: "Vous vérifiez à la livraison avant de payer" },
    { pain: "Des matières qui boulochent vite", fix: "Une matière agréable et des finitions soignées" },
    { pain: "Des pièces difficiles à associer", fix: "Un style qui s'accorde à tout le dressing" },
    { pain: "Payer d'avance et attendre longtemps", fix: "Paiement à la livraison, livraison rapide" },
  ],
  solution: ["La pièce qu'on sort sans réfléchir : *{product}*.", "Un style net, un confort réel : *{product}*."],
  showcaseTitle: ["Les détails *qui comptent*", "De près"],
  stepsTitle: ["Bien choisir, *c'est simple*", "Comment commander"],
  steps: [
    { icon: "ruler", title: "Choisissez votre taille", text: "Comparez avec une pièce que vous aimez déjà. {wa:Un doute ? Écrivez-nous sur WhatsApp.|Un doute ? On en parle lors de l'appel de confirmation.}" },
    { icon: "check", title: "Validez le formulaire", text: "Nom, téléphone, ville : notre équipe vous appelle pour confirmer." },
    { icon: "eye", title: "Vérifiez, puis payez", text: "Ouvrez le colis devant le livreur et payez seulement si tout vous convient." },
  ],
  faq: [
    { q: "Comment choisir ma taille ?", a: "Prenez une pièce que vous portez souvent et comparez ses mesures. {wa:Envoyez-nous un message sur WhatsApp : on vous aide à choisir.|Notez votre taille habituelle dans la remarque de commande : on la confirme avec vous lors de l'appel.}" },
    { q: "Comment l'entretenir ?", a: "Suivez l'étiquette : lavage doux, à l'envers, et séchage à plat pour garder la forme et la couleur." },
  ],
  story: [
    { title: "Une pièce *facile*", text: "On voulait une pièce qu'on attrape le matin sans se poser de question, qui tombe bien et qui reste agréable toute la journée. {product}, c'est ça : du style sans effort, livré chez vous et payé à la réception." },
  ],
  comparison: [
    { label: "Coupe", us: "Nette, qui tombe bien", them: "Approximative" },
    { label: "Matière", us: "Douce, agréable", them: "Rêche, boulochage rapide" },
    { label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { label: "Taille", us: "Vous vérifiez avant de payer", them: "Mauvaise surprise au déballage" },
  ],
  marquee: ["Coupe nette", "Confort", "Facile à porter", "Style", "Payé à la livraison"],
};

const wellness: FamilyCopy = {
  kicker: ["{product}", "{product} · Bien-être"],
  headline: [
    { t: "Prendre soin de soi, *chaque jour*, simplement.", s: "noun-phrase" },
    { t: "Une habitude simple pour se sentir *bien*.", s: "noun-phrase" },
    { t: "Le bien-être, *sans compliquer* vos journées.", s: "noun-phrase" },
    { t: "Faites une pause, *chaque jour*.", s: "imperative" },
    { t: "*Calme.* Un rituel simple, à votre rythme.", s: "word-subline" },
  ],
  sub: [
    "{product} s'intègre facilement à votre quotidien. Un geste simple, régulier, pour prendre soin de vous.",
    "Pensé pour accompagner une routine équilibrée : facile à prendre, facile à garder.",
  ],
  bigWord: ["Bien-être", "Équilibre"],
  tagline: ["Une habitude simple pour prendre soin de soi", "Votre routine bien-être, simplifiée"],
  benefitsTitle: ["Pourquoi l'adopter *au quotidien*", "Une routine *qui tient*"],
  benefits: [
    { icon: "clock", title: "Facile à intégrer", text: "Un geste rapide qui trouve sa place dans votre matinée ou votre soirée." },
    { icon: "leaf", title: "Une composition claire", text: "Tout est indiqué sur l'emballage : vous savez ce que vous prenez." },
    { icon: "heart", title: "Un vrai moment pour soi", text: "Prendre soin de soi commence par une habitude qu'on a plaisir à garder." },
    { icon: "box", title: "Format pratique", text: "Facile à ranger, à emporter, à avoir sous la main." },
    { icon: "check", title: "Simple à suivre", text: "Des conseils d'utilisation clairs, sans programme compliqué." },
    { icon: "headset", title: "Des réponses à vos questions", text: "{wa:Notre équipe vous répond sur WhatsApp avant et après la commande.|Notre équipe vous appelle pour confirmer la commande et répondre à vos questions.}" },
  ],
  problemTitle: ["Prendre soin de soi, *ça peut être simple*", "Vous aussi, *vous manquez de temps* ?"],
  pains: [
    { pain: "Des routines bien-être trop compliquées", fix: "Un seul geste, facile à garder" },
    { pain: "Des étiquettes impossibles à comprendre", fix: "Une composition clairement indiquée" },
    { pain: "Des produits qu'on abandonne au bout d'une semaine", fix: "Un format pratique qu'on garde sous la main" },
    { pain: "Commander sans pouvoir poser de questions", fix: "{wa:Notre équipe vous répond sur WhatsApp|Notre équipe vous appelle et répond à vos questions}" },
  ],
  solution: ["Une habitude simple pour prendre soin de vous : *{product}*.", "Le bien-être, simplement : *{product}*."],
  showcaseTitle: ["Ce qu'il y a *dedans*", "De près"],
  stepsTitle: ["Comment *l'utiliser*", "Votre routine"],
  steps: [
    { icon: "info", title: "Lisez les conseils", text: "Respectez la dose et le mode d'emploi indiqués sur l'emballage." },
    { icon: "clock", title: "Un moment fixe", text: "Associez-le à un geste du quotidien, comme le café du matin ou le dîner." },
    { icon: "check", title: "Avec régularité", text: "Comme toute habitude, c'est la régularité qui compte." },
  ],
  faq: [
    { q: "Puis-je l'utiliser si je suis un traitement ?", a: "En cas de traitement, de grossesse ou d'allaitement, demandez l'avis de votre médecin ou de votre pharmacien avant utilisation." },
    { q: "Comment le prendre ?", a: "Suivez le mode d'emploi indiqué sur l'emballage. {wa:Pour toute question, notre équipe vous répond sur WhatsApp.|Vos questions, posez-les lors de l'appel de confirmation.}" },
  ],
  story: [
    { title: "Le bien-être, *sans détour*", text: "Prendre soin de soi ne devrait pas demander un manuel. {product} a été choisi pour sa simplicité : un geste clair, une composition lisible, et un paiement à la livraison pour commander en toute confiance." },
  ],
  comparison: [
    { label: "Composition", us: "Clairement indiquée", them: "Floue ou incomplète" },
    { label: "Utilisation", us: "Un geste simple", them: "Programme compliqué" },
    { label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { label: "Conseil", us: "{wa:Réponses sur WhatsApp|Réponses par téléphone}", them: "Aucun contact" },
  ],
  marquee: ["Bien-être", "Simplicité", "Régularité", "Composition claire", "Payé à la livraison"],
};

const fitness: FamilyCopy = {
  kicker: ["{product}", "{product} · Sport à la maison"],
  headline: [
    { t: "Votre séance, *n'importe où*, quand vous voulez.", s: "noun-phrase" },
    { t: "Bougez plus, *sans abonnement*.", s: "imperative" },
    { t: "L'équipement qui vous fait *passer à l'action*.", s: "noun-phrase" },
    { t: "Entraînez-vous *chez vous*, à votre heure.", s: "imperative" },
    { t: "*Rythme.* Une séance là où vous êtes.", s: "word-subline" },
  ],
  sub: [
    "{product} vous accompagne à la maison, au parc ou en voyage. Compact, solide, prêt quand vous l'êtes.",
    "Pas besoin de salle ni d'horaires : un équipement simple pour garder le rythme, semaine après semaine.",
  ],
  bigWord: ["Bouger", "Sport"],
  tagline: ["L'entraînement qui s'adapte à votre emploi du temps", "Compact, solide, prêt à l'emploi"],
  benefitsTitle: ["Ce qui va *changer* vos séances", "Conçu pour *bouger*"],
  benefits: [
    { icon: "home", title: "À la maison", text: "Une séance efficace dans votre salon, sans trajet ni abonnement." },
    { icon: "bag", title: "Compact et transportable", text: "Il se range dans un placard et vous suit en voyage." },
    { icon: "shield-check", title: "Solide", text: "Des matériaux pensés pour encaisser les répétitions, séance après séance." },
    { icon: "user", title: "Tous niveaux", text: "Débutant ou confirmé, vous ajustez l'effort à votre rythme." },
    { icon: "bolt", title: "Prêt en un instant", text: "Pas de montage compliqué : vous sortez, vous commencez." },
    { icon: "dumbbell", title: "Le corps entier", text: "Variez les exercices pour travailler bras, jambes et sangle abdominale." },
  ],
  problemTitle: ["Le sport, *toujours remis à demain* ?", "Pas le temps d'aller à la salle ?"],
  pains: [
    { pain: "Un abonnement payé mais jamais utilisé", fix: "Votre séance à la maison, quand vous voulez" },
    { pain: "Pas le temps de faire le trajet", fix: "Prêt en un instant, dans votre salon" },
    { pain: "Du matériel encombrant", fix: "Compact, il se range facilement" },
    { pain: "Du matériel fragile qui lâche vite", fix: "Des matériaux solides, pensés pour durer" },
  ],
  solution: ["Votre séance, à votre rythme : *{product}*.", "Passez à l'action, chez vous : *{product}*."],
  showcaseTitle: ["Conçu *dans le détail*", "De près"],
  stepsTitle: ["Votre première *séance*", "Prêt en trois étapes"],
  steps: [
    { icon: "box", title: "Déballez", text: "Tout est prêt à l'emploi, sans montage compliqué." },
    { icon: "user", title: "Échauffez-vous", text: "Quelques minutes de mobilité pour préparer le corps." },
    { icon: "dumbbell", title: "Entraînez-vous", text: "Commencez doucement, puis augmentez l'effort au fil des semaines." },
  ],
  faq: [
    { q: "Est-ce adapté aux débutants ?", a: "Oui : vous choisissez l'intensité. Commencez par des séances courtes et augmentez progressivement." },
    { q: "Faut-il beaucoup de place ?", a: "Non, un petit espace au sol suffit. Après la séance, il se range dans un placard." },
  ],
  story: [
    { title: "Le sport, *à votre façon*", text: "On a choisi {product} pour une raison simple : le meilleur entraînement est celui qu'on fait vraiment. Chez vous, à votre heure, sans abonnement, et payé seulement à la livraison." },
  ],
  comparison: [
    { label: "Où", us: "Chez vous, partout", them: "Uniquement en salle" },
    { label: "Coût", us: "Un seul achat", them: "Abonnement mensuel" },
    { label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { label: "Horaires", us: "Quand vous voulez", them: "Selon l'ouverture" },
  ],
  marquee: ["Bougez", "Partout", "Tous niveaux", "Sans abonnement", "Payé à la livraison"],
};

const kitchen: FamilyCopy = {
  kicker: ["{product}", "{product} · Cuisine"],
  headline: [
    { t: "La cuisine du quotidien, *en moins de temps*.", s: "noun-phrase" },
    { t: "Le geste qui vous fait *gagner du temps* en cuisine.", s: "noun-phrase" },
    { t: "Cuisiner devient *un plaisir*, pas une corvée.", s: "contrast-pair" },
    { t: "Préparez plus vite, *rangez moins*.", s: "imperative" },
    { t: "*Geste.* La cuisine du quotidien, en plus simple.", s: "word-subline" },
  ],
  sub: [
    "{product} vous simplifie la préparation des repas : moins d'efforts, moins de vaisselle, plus de temps à table.",
    "Pratique, solide et facile à nettoyer : l'ustensile qu'on sort tous les jours.",
  ],
  bigWord: ["Cuisine", "Facile"],
  tagline: ["Moins d'efforts en cuisine, plus de temps à table", "L'ustensile qu'on sort tous les jours"],
  benefitsTitle: ["Ce qui change *en cuisine*", "Pensé pour *votre cuisine*"],
  benefits: [
    { icon: "clock", title: "Du temps gagné", text: "La préparation va plus vite : vous passez moins de temps debout devant le plan de travail." },
    { icon: "drop", title: "Facile à nettoyer", text: "Un rinçage rapide et c'est propre : pas de recoins impossibles." },
    { icon: "shield-check", title: "Solide", text: "Des matériaux pensés pour l'usage quotidien d'une vraie cuisine familiale." },
    { icon: "home", title: "Compact", text: "Il trouve sa place dans un tiroir ou sur le plan de travail." },
    { icon: "hand-heart", title: "Simple à utiliser", text: "Pas de mode d'emploi compliqué : on le prend en main en une fois." },
    { icon: "heart", title: "Pour toute la famille", text: "Du petit-déjeuner au dîner, il rend service à chaque repas." },
  ],
  problemTitle: ["La cuisine vous prend *trop de temps* ?", "Assez des *corvées* en cuisine ?"],
  pains: [
    { pain: "Des préparations qui prennent une éternité", fix: "Un geste rapide, du temps gagné" },
    { pain: "Des ustensiles impossibles à nettoyer", fix: "Un rinçage et c'est propre" },
    { pain: "Des gadgets fragiles qui cassent", fix: "Solide, pensé pour tous les jours" },
    { pain: "Des tiroirs encombrés", fix: "Compact, il se range facilement" },
  ],
  solution: ["Plus de temps à table, moins en cuisine : *{product}*.", "Le bon outil change tout : *{product}*."],
  showcaseTitle: ["Pensé *dans le détail*", "De près"],
  stepsTitle: ["Simple comme *bonjour*", "Comment l'utiliser"],
  steps: [
    { icon: "box", title: "Déballez", text: "Rincez-le avant la première utilisation, il est prêt." },
    { icon: "hand-heart", title: "Préparez", text: "Utilisez-le pour vos préparations du quotidien, en toute simplicité." },
    { icon: "drop", title: "Rincez", text: "Un coup d'eau, un coup d'éponge, et il retourne au tiroir." },
  ],
  faq: [
    { q: "Comment le nettoyer ?", a: "À l'eau chaude savonneuse, avec une éponge douce. Séchez-le avant de le ranger." },
    { q: "Est-ce adapté à une utilisation quotidienne ?", a: "Oui, il est pensé pour une cuisine familiale. Suivez simplement les conseils d'entretien." },
  ],
  story: [
    { title: "Pensé pour les *vraies cuisines*", text: "Dans une cuisine marocaine, on prépare beaucoup, souvent, pour beaucoup de monde. {product} a été choisi pour ça : un outil simple, solide, qui fait gagner du temps chaque jour. Et vous ne payez qu'à la livraison." },
  ],
  comparison: [
    { label: "Temps de préparation", us: "Réduit", them: "Long et fatigant" },
    { label: "Nettoyage", us: "Un rinçage suffit", them: "Recoins impossibles" },
    { label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { label: "Avant de payer", us: "Vous vérifiez le colis", them: "Aucune vérification" },
  ],
  marquee: ["Gain de temps", "Facile à nettoyer", "Solide", "Pratique", "Payé à la livraison"],
};

const home: FamilyCopy = {
  kicker: ["{product}", "{product} · Maison"],
  headline: [
    { t: "Une maison plus *agréable*, sans effort.", s: "noun-phrase" },
    { t: "Le petit changement qui rend la maison *plus belle*.", s: "noun-phrase" },
    { t: "Moins de corvées, plus de *temps pour vous*.", s: "contrast-pair" },
    { t: "Installez-le une fois, *profitez-en* tous les jours.", s: "imperative" },
    { t: "*Confort.* Le détail qui change la pièce.", s: "word-subline" },
  ],
  sub: [
    "{product} s'occupe du quotidien pour que vous profitiez de votre intérieur. Pratique, solide, facile à utiliser.",
    "Pensé pour les vraies maisons : simple à installer, simple à utiliser, agréable à regarder.",
  ],
  bigWord: ["Maison", "Cocon"],
  tagline: ["Une maison plus agréable, au quotidien", "Pratique, solide, facile à vivre"],
  benefitsTitle: ["Ce qui change *à la maison*", "Pensé pour *votre intérieur*"],
  benefits: [
    { icon: "clock", title: "Du temps libéré", text: "Les petites corvées vont plus vite : vous profitez davantage de votre maison." },
    { icon: "hand-heart", title: "Facile à utiliser", text: "Pas besoin d'outils ni de notice compliquée : on s'en sert tout de suite." },
    { icon: "home", title: "S'intègre partout", text: "Un design sobre qui trouve sa place dans le salon, la chambre ou l'entrée." },
    { icon: "shield-check", title: "Solide", text: "Des matériaux choisis pour un usage de tous les jours." },
    { icon: "sun", title: "Un intérieur plus agréable", text: "Plus net, plus rangé, plus accueillant pour vous et vos invités." },
    { icon: "heart", title: "Pour toute la famille", text: "Pratique pour chacun, du plus petit au plus grand." },
  ],
  problemTitle: ["Les petites corvées *qui gâchent* la semaine", "Votre maison mérite *plus simple*"],
  pains: [
    { pain: "Des tâches qui prennent trop de temps", fix: "Un geste plus rapide, plus efficace" },
    { pain: "Des solutions encombrantes ou fragiles", fix: "Pratique, solide, facile à ranger" },
    { pain: "Un intérieur qui manque de charme", fix: "Un design sobre qui s'intègre partout" },
    { pain: "Acheter sans savoir si ça convient", fix: "Vous vérifiez avant de payer" },
  ],
  solution: ["Une maison plus agréable, sans effort : *{product}*.", "Le petit plus qui change le quotidien : *{product}*."],
  showcaseTitle: ["Pensé *dans le détail*", "De près"],
  stepsTitle: ["Prêt en *trois gestes*", "Comment ça marche"],
  steps: [
    { icon: "box", title: "Déballez", text: "Tout est prêt, sans montage compliqué." },
    { icon: "home", title: "Installez", text: "Choisissez sa place : il s'adapte à votre intérieur." },
    { icon: "sun", title: "Profitez", text: "Le quotidien devient plus simple, dès le premier jour." },
  ],
  faq: [
    { q: "Est-ce difficile à installer ?", a: "Non : il s'utilise tel quel, sans outil particulier. {wa:Notre équipe peut vous guider sur WhatsApp.|}" },
    { q: "Comment l'entretenir ?", a: "Un chiffon doux et légèrement humide suffit. Évitez les produits abrasifs." },
  ],
  story: [
    { title: "La maison, *en plus simple*", text: "On passe beaucoup de temps chez soi : autant que ce soit agréable. {product} a été choisi pour rendre le quotidien plus simple et l'intérieur plus accueillant. Livré chez vous, payé à la réception." },
  ],
  comparison: [
    { label: "Utilisation", us: "Simple, immédiate", them: "Compliquée" },
    { label: "Solidité", us: "Pensé pour tous les jours", them: "Fragile" },
    { label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { label: "Avant de payer", us: "Vous vérifiez le colis", them: "Aucune vérification" },
  ],
  marquee: ["Maison", "Pratique", "Solide", "Facile", "Payé à la livraison"],
};

const kids: FamilyCopy = {
  kicker: ["{product}", "{product} · Jeu & éveil"],
  headline: [
    { t: "Des yeux qui *brillent* dès l'ouverture du colis.", s: "noun-phrase" },
    { t: "Le jeu qui les occupe *et les fait grandir*.", s: "noun-phrase" },
    { t: "Des heures de *jeu*, des parents tranquilles.", s: "noun-phrase" },
    { t: "Ouvrez le colis, *laissez-les jouer*.", s: "imperative" },
    { t: "*Jeu.* Des heures d'éveil à la maison.", s: "word-subline" },
  ],
  sub: [
    "{product} éveille la curiosité et l'imagination. Des matériaux pensés pour les petites mains, des heures de jeu.",
    "Un cadeau qui fait plaisir aux enfants et rassure les parents : solide, coloré, facile à ranger.",
  ],
  bigWord: ["Jouer", "Rêver"],
  tagline: ["Des heures de jeu, des parents tranquilles", "Le cadeau qui fait briller les yeux"],
  benefitsTitle: ["Pourquoi ils vont *l'adorer*", "Pensé pour les *petites mains*"],
  benefits: [
    { icon: "star", title: "Des heures de jeu", text: "Un jeu qu'on reprend encore et encore, seul ou à plusieurs." },
    { icon: "hand-heart", title: "Adapté aux petites mains", text: "Des formes faciles à saisir et à manipuler." },
    { icon: "bolt", title: "Éveil et imagination", text: "Il stimule la curiosité, la créativité et l'adresse." },
    { icon: "shield-check", title: "Solide", text: "Pensé pour résister aux chutes et aux grandes aventures." },
    { icon: "gift", title: "Une belle idée cadeau", text: "Anniversaire, Aïd, réussite scolaire : un cadeau qui fait l'unanimité." },
    { icon: "box", title: "Facile à ranger", text: "Tout se range vite : la chambre reste en ordre." },
  ],
  problemTitle: ["Les écrans, *encore les écrans* ?", "Trouver un cadeau *qui dure*"],
  pains: [
    { pain: "Des enfants collés aux écrans", fix: "Un jeu qui occupe les mains et l'esprit" },
    { pain: "Des jouets cassés au bout d'une semaine", fix: "Solide, pensé pour les grandes aventures" },
    { pain: "Des jouets vite oubliés", fix: "Un jeu qu'on reprend encore et encore" },
    { pain: "Commander sans voir la qualité", fix: "Vous vérifiez le colis avant de payer" },
  ],
  solution: ["Du jeu, de l'éveil, des sourires : *{product}*.", "Le jouet qu'on ne range jamais longtemps : *{product}*."],
  showcaseTitle: ["Regardez-le *de près*", "Pensé pour eux"],
  stepsTitle: ["Prêt à *jouer*", "En trois étapes"],
  steps: [
    { icon: "box", title: "On ouvre", text: "Le plaisir commence dès le déballage." },
    { icon: "user", title: "On découvre", text: "Montrez-lui une première fois, puis laissez l'imagination faire." },
    { icon: "star", title: "On joue", text: "Seul, en famille ou entre amis : à chacun son jeu." },
  ],
  faq: [
    { q: "À partir de quel âge ?", a: "Respectez l'âge indiqué sur l'emballage et jouez sous la surveillance d'un adulte pour les plus petits." },
    { q: "Est-ce un bon cadeau ?", a: "Oui : il arrive bien emballé. Si c'est pour offrir, dites-le-nous en commentaire de commande." },
  ],
  story: [
    { title: "Pour les *grandes aventures*", text: "On se souvient tous d'un jouet qui a marqué notre enfance. {product} a été choisi pour devenir ce jouet-là : solide, joyeux, qui donne envie de jouer. Livré chez vous, payé à la réception." },
  ],
  comparison: [
    { label: "Durée de jeu", us: "Encore et encore", them: "Vite oublié" },
    { label: "Solidité", us: "Pensé pour durer", them: "Fragile" },
    { label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { label: "Avant de payer", us: "Vous vérifiez le colis", them: "Aucune vérification" },
  ],
  marquee: ["Jouer", "Imaginer", "Grandir", "Idée cadeau", "Payé à la livraison"],
};

const pets: FamilyCopy = {
  kicker: ["{product}", "{product} · Animaux"],
  headline: [
    { t: "Un compagnon *heureux*, une maison tranquille.", s: "noun-phrase" },
    { t: "Ce qu'il préfère, *ce qui vous simplifie la vie*.", s: "noun-phrase" },
    { t: "Prendre soin de lui, *sans compliquer* vos journées.", s: "noun-phrase" },
    { t: "Offrez-lui son coin, *gardez* la maison tranquille.", s: "imperative" },
    { t: "*Confort.* Son coin à lui, votre calme à vous.", s: "word-subline" },
  ],
  sub: [
    "{product} est pensé pour le confort de votre animal et pour votre tranquillité. Pratique, solide, facile à entretenir.",
    "Chats, chiens, petits et grands : un accessoire simple qui rend le quotidien plus agréable pour tous.",
  ],
  bigWord: ["Câlin", "Compagnon"],
  tagline: ["Le confort de votre compagnon, simplement", "Un animal heureux, une maison tranquille"],
  benefitsTitle: ["Ce qu'il va *adorer*", "Pensé pour *lui*, pratique pour *vous*"],
  benefits: [
    { icon: "paw", title: "Pensé pour son confort", text: "Des matériaux agréables et une forme adaptée à ses habitudes." },
    { icon: "drop", title: "Facile à nettoyer", text: "Un coup d'éponge ou un passage en machine selon les indications." },
    { icon: "shield-check", title: "Solide", text: "Il résiste aux griffes, aux dents et aux grandes séances de jeu." },
    { icon: "home", title: "S'intègre chez vous", text: "Un design sobre qui va avec votre intérieur." },
    { icon: "clock", title: "Moins de corvées", text: "Le quotidien avec votre animal devient plus simple." },
    { icon: "heart", title: "Pour tous les gabarits", text: "Choisissez le modèle adapté à la taille de votre compagnon." },
  ],
  problemTitle: ["Votre compagnon *mérite mieux*", "Le quotidien avec lui, *en plus simple*"],
  pains: [
    { pain: "Des accessoires abîmés en quelques jours", fix: "Solide, il résiste aux jeux" },
    { pain: "Un entretien qui prend du temps", fix: "Facile à nettoyer" },
    { pain: "Un animal qui boude ses affaires", fix: "Pensé pour son confort et ses habitudes" },
    { pain: "Commander sans voir la qualité", fix: "Vous vérifiez avant de payer" },
  ],
  solution: ["Un compagnon heureux, une maison tranquille : *{product}*.", "Pour son confort et votre tranquillité : *{product}*."],
  showcaseTitle: ["Pensé *dans le détail*", "De près"],
  stepsTitle: ["Adopté en *trois étapes*", "Comment l'utiliser"],
  steps: [
    { icon: "box", title: "Déballez", text: "Laissez-le sentir et découvrir à son rythme." },
    { icon: "home", title: "Installez", text: "Placez-le dans un endroit qu'il aime déjà." },
    { icon: "paw", title: "Laissez-le l'adopter", text: "Quelques jours suffisent pour qu'il en fasse son coin." },
  ],
  faq: [
    { q: "Quelle taille choisir ?", a: "{wa:Envoyez-nous le poids et la taille de votre animal sur WhatsApp : on vous conseille le bon modèle.|Notez le poids et la taille de votre animal dans la remarque de commande : on vous conseille le bon modèle lors de l'appel.}" },
    { q: "Comment le nettoyer ?", a: "Suivez les indications d'entretien : la plupart des saletés partent à l'eau savonneuse." },
  ],
  story: [
    { title: "Parce qu'il fait *partie de la famille*", text: "Un animal heureux, c'est toute la maison qui va mieux. {product} a été choisi pour son confort et pour votre tranquillité. Livré chez vous, payé seulement à la réception." },
  ],
  comparison: [
    { label: "Solidité", us: "Résiste aux jeux", them: "Abîmé en quelques jours" },
    { label: "Entretien", us: "Facile", them: "Compliqué" },
    { label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { label: "Avant de payer", us: "Vous vérifiez le colis", them: "Aucune vérification" },
  ],
  marquee: ["Confort", "Solide", "Facile à nettoyer", "Animaux heureux", "Payé à la livraison"],
};

const tech: FamilyCopy = {
  kicker: ["{product}", "{product} · Tech"],
  headline: [
    { t: "La technologie qui vous *simplifie* la journée.", s: "noun-phrase" },
    { t: "Branchez, c'est prêt. *Vraiment*.", s: "imperative" },
    { t: "Petit format, *grand confort* au quotidien.", s: "contrast-pair" },
    { t: "Sortez-le de la boîte, *c'est prêt*.", s: "imperative" },
    { t: "*Format.* Il tient dans la poche, il sert tous les jours.", s: "word-subline" },
  ],
  sub: [
    "{product} se prend en main en quelques secondes. Compact, pratique, pensé pour vous suivre partout.",
    "Une prise en main immédiate et des finitions soignées : le gadget qu'on utilise vraiment, tous les jours.",
  ],
  bigWord: ["Malin", "Tech"],
  tagline: ["Prise en main immédiate, usage quotidien", "Compact, pratique, toujours prêt"],
  benefitsTitle: ["Ce qui le rend *indispensable*", "Pensé pour *votre quotidien*"],
  benefits: [
    { icon: "bolt", title: "Prêt en un instant", text: "Pas de réglages compliqués : vous l'allumez, vous l'utilisez." },
    { icon: "bag", title: "Compact", text: "Il se glisse dans une poche, un sac ou une boîte à gants." },
    { icon: "battery", title: "Autonomie pensée pour la journée", text: "Rechargez-le et oubliez-le : il suit votre rythme." },
    { icon: "shield-check", title: "Finitions soignées", text: "Des matériaux agréables en main et un assemblage solide." },
    { icon: "check", title: "Compatible", text: "Il s'utilise avec vos appareils du quotidien, sans adaptateur compliqué." },
    { icon: "user", title: "Pour tout le monde", text: "Simple à comprendre, même pour ceux qui n'aiment pas la technique." },
  ],
  problemTitle: ["Les gadgets qui *finissent au tiroir*", "La technologie, *ça devrait être simple*"],
  pains: [
    { pain: "Des appareils compliqués à configurer", fix: "Prêt en un instant, sans réglage" },
    { pain: "Des batteries qui lâchent trop tôt", fix: "Une autonomie pensée pour la journée" },
    { pain: "Des gadgets fragiles", fix: "Un assemblage solide, des finitions soignées" },
    { pain: "Payer en ligne sans tester", fix: "Vous vérifiez avant de payer" },
  ],
  solution: ["Le gadget qu'on utilise vraiment : *{product}*.", "La technologie, en plus simple : *{product}*."],
  showcaseTitle: ["Chaque détail, *expliqué*", "Sous tous les angles"],
  stepsTitle: ["Prêt en *trois étapes*", "Mise en route"],
  steps: [
    { icon: "box", title: "Déballez", text: "Tout est dans la boîte, prêt à l'emploi." },
    { icon: "battery", title: "Chargez", text: "Une première charge complète avant la première utilisation." },
    { icon: "bolt", title: "Utilisez", text: "Allumez-le : la prise en main est immédiate." },
  ],
  faq: [
    { q: "Est-il compatible avec mon téléphone ?", a: "{wa:Écrivez-nous le modèle de votre appareil sur WhatsApp : on vous confirme la compatibilité avant l'envoi.|Notez le modèle de votre appareil dans la remarque de commande : on vous confirme la compatibilité lors de l'appel, avant l'envoi.}" },
    { q: "Que contient la boîte ?", a: "L'appareil et ses accessoires de base. Vous vérifiez le contenu à la livraison, avant de payer." },
  ],
  story: [
    { title: "La technique, *sans prise de tête*", text: "On teste beaucoup de gadgets ; peu méritent une place dans la poche. {product} en fait partie : simple, solide, utile tous les jours. Et pour commander sereinement, vous payez à la livraison." },
  ],
  comparison: [
    { label: "Prise en main", us: "Immédiate", them: "Réglages compliqués" },
    { label: "Format", us: "Compact, transportable", them: "Encombrant" },
    { label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { label: "Avant de payer", us: "Vous vérifiez l'appareil", them: "Aucune vérification" },
  ],
  marquee: ["Prêt à l'emploi", "Compact", "Pratique", "Finitions soignées", "Payé à la livraison"],
};

const auto: FamilyCopy = {
  kicker: ["{product}", "{product} · Auto & outils"],
  headline: [
    { t: "Le bon outil, *le travail bien fait*.", s: "noun-phrase" },
    { t: "Fait pour les mains *qui bossent*.", s: "noun-phrase" },
    { t: "Robuste, précis, *prêt à servir*.", s: "noun-phrase" },
    { t: "Prenez l'outil, *faites le travail*.", s: "imperative" },
    { t: "*Prise.* Solide en main, précis au travail.", s: "word-subline" },
  ],
  sub: [
    "{product} : une prise en main solide et un résultat net, que ce soit au garage, à la maison ou sur la route.",
    "Pensé pour durer et pour être utilisé souvent. Un outil sérieux, livré chez vous, payé à la réception.",
  ],
  bigWord: ["Pro", "Garage"],
  tagline: ["Robuste, précis, prêt à servir", "L'outil sérieux pour un résultat net"],
  benefitsTitle: ["Pourquoi il va *durer*", "Conçu pour *servir*"],
  benefits: [
    { icon: "shield-check", title: "Robuste", text: "Des matériaux choisis pour un usage intensif, jour après jour." },
    { icon: "hand-heart", title: "Bonne prise en main", text: "Il tient bien en main, même pour les travaux qui durent." },
    { icon: "ruler", title: "Un résultat précis", text: "Le travail est net, du premier coup." },
    { icon: "bolt", title: "Rapide", text: "Vous gagnez du temps sur chaque intervention." },
    { icon: "bag", title: "Facile à ranger", text: "Il trouve sa place dans le coffre, la caisse à outils ou l'atelier." },
    { icon: "user", title: "Pour tous", text: "Bricoleur du dimanche ou pro, il s'adapte à votre niveau." },
  ],
  problemTitle: ["Les outils qui *lâchent* au mauvais moment", "Assez du *bricolage approximatif* ?"],
  pains: [
    { pain: "Des outils bon marché qui cassent vite", fix: "Robuste, pensé pour un usage intensif" },
    { pain: "Un résultat approximatif", fix: "Un travail net, du premier coup" },
    { pain: "Perdre du temps sur chaque tâche", fix: "Rapide et efficace" },
    { pain: "Acheter sans voir la qualité", fix: "Vous vérifiez avant de payer" },
  ],
  solution: ["Le bon outil pour un travail bien fait : *{product}*.", "Robuste et précis : *{product}*."],
  showcaseTitle: ["Construit *pour durer*", "De près"],
  stepsTitle: ["Au travail, *en trois étapes*", "Mode d'emploi"],
  steps: [
    { icon: "box", title: "Déballez", text: "Vérifiez les accessoires fournis avant la première utilisation." },
    { icon: "info", title: "Préparez", text: "Lisez les consignes de sécurité et installez-vous dans un endroit dégagé." },
    { icon: "check", title: "Au travail", text: "Prise en main immédiate, résultat net." },
  ],
  faq: [
    { q: "Est-ce adapté à un usage régulier ?", a: "Oui, il est pensé pour servir souvent. Respectez les consignes d'utilisation et d'entretien pour le garder longtemps." },
    { q: "Est-il compatible avec mon véhicule ?", a: "{wa:Envoyez-nous la marque et le modèle sur WhatsApp : on vous confirme avant l'envoi.|Notez la marque et le modèle dans la remarque de commande : on vous confirme lors de l'appel, avant l'envoi.}" },
  ],
  story: [
    { title: "Un outil *sérieux*", text: "Un bon outil, c'est celui qui est encore là dans des années. {product} a été choisi pour sa robustesse et sa précision. Livré chez vous, et vous ne payez qu'après avoir vérifié le colis." },
  ],
  comparison: [
    { label: "Robustesse", us: "Pensé pour un usage intensif", them: "Casse vite" },
    { label: "Résultat", us: "Net et précis", them: "Approximatif" },
    { label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { label: "Avant de payer", us: "Vous vérifiez l'outil", them: "Aucune vérification" },
  ],
  marquee: ["Robuste", "Précis", "Rapide", "Fait pour durer", "Payé à la livraison"],
};

const terroir: FamilyCopy = {
  kicker: ["{product}", "{product} · Terroir"],
  headline: [
    { t: "Le goût *vrai* du terroir, livré chez vous.", s: "noun-phrase" },
    { t: "Comme *chez nos grands-mères*, en toute simplicité.", s: "noun-phrase" },
    { t: "Un produit *authentique*, choisi avec soin.", s: "noun-phrase" },
    { t: "Servez-le comme *à la maison*.", s: "imperative" },
    { t: "*Goût.* Le terroir, conditionné avec soin.", s: "word-subline" },
  ],
  sub: [
    "{product} : un produit sélectionné avec soin, au goût authentique, conditionné pour garder toute sa fraîcheur.",
    "Pour la cuisine de tous les jours comme pour les grandes tablées : un produit authentique, livré chez vous.",
  ],
  bigWord: ["Beldi", "Terroir"],
  tagline: ["Authentique, sélectionné avec soin", "Le goût du terroir, livré chez vous"],
  benefitsTitle: ["Ce qui fait *la différence*", "Le terroir, *tel qu'on l'aime*"],
  benefits: [
    { icon: "leaf", title: "Authentique", text: "Un produit sélectionné pour son goût, comme on l'aime à la maison." },
    { icon: "map-pin", title: "Une origine connue", text: "On sait d'où il vient et comment il est préparé." },
    { icon: "box", title: "Bien conditionné", text: "Un emballage soigné qui préserve la fraîcheur et les arômes." },
    { icon: "heart", title: "Pour toute la famille", text: "À la table du quotidien comme pour recevoir." },
    { icon: "gift", title: "Une belle idée cadeau", text: "Pour faire découvrir le goût du terroir à ceux qu'on aime." },
    { icon: "sun", title: "Le goût d'antan", text: "Des saveurs franches, sans détour." },
  ],
  problemTitle: ["Difficile de trouver *le vrai* ?", "Assez des produits *sans goût* ?"],
  pains: [
    { pain: "Des produits dont on ignore l'origine", fix: "Une origine connue, un produit choisi avec soin" },
    { pain: "Un goût qui n'a rien à voir avec l'original", fix: "Des saveurs authentiques" },
    { pain: "Des emballages qui abîment le produit", fix: "Un conditionnement soigné" },
    { pain: "Payer d'avance sans voir le produit", fix: "Vous vérifiez avant de payer" },
  ],
  solution: ["Le goût authentique, livré chez vous : *{product}*.", "Le terroir comme on l'aime : *{product}*."],
  showcaseTitle: ["D'où il *vient*", "De près"],
  stepsTitle: ["Comment *le savourer*", "En cuisine"],
  steps: [
    { icon: "box", title: "Recevez", text: "Livré bien emballé, prêt à rejoindre votre cuisine." },
    { icon: "leaf", title: "Conservez", text: "À l'abri de la chaleur et de la lumière, bien refermé." },
    { icon: "heart", title: "Savourez", text: "Au petit-déjeuner, en cuisine ou à offrir : à vous de choisir." },
  ],
  faq: [
    { q: "Comment le conserver ?", a: "Dans un endroit frais et sec, à l'abri de la lumière, bien refermé après chaque utilisation." },
    { q: "D'où vient le produit ?", a: "{wa:Écrivez-nous sur WhatsApp : on vous raconte son origine et la façon dont il est préparé.|Posez-nous la question lors de l'appel de confirmation : on vous raconte son origine et la façon dont il est préparé.}" },
  ],
  story: [
    { title: "Le goût *d'ici*", text: "Certains goûts nous ramènent tout de suite à la maison. {product} a été sélectionné pour cette authenticité : un produit vrai, conditionné avec soin, et livré chez vous avec paiement à la réception." },
  ],
  comparison: [
    { label: "Origine", us: "Connue et choisie", them: "Inconnue" },
    { label: "Goût", us: "Authentique", them: "Fade ou artificiel" },
    { label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { label: "Avant de payer", us: "Vous vérifiez le colis", them: "Aucune vérification" },
  ],
  marquee: ["Authentique", "Terroir", "Fait avec soin", "Goût vrai", "Payé à la livraison"],
};

const general: FamilyCopy = {
  kicker: ["{product}", "{product} · Essentiel"],
  headline: [
    { t: "Le petit objet qui *change* le quotidien.", s: "noun-phrase" },
    { t: "Simple, pratique, *bien pensé*.", s: "noun-phrase" },
    { t: "Celui qu'on finit par *recommander* à tout le monde.", s: "noun-phrase" },
    { t: "Gardez-le à portée de main, *servez-vous-en* chaque jour.", s: "imperative" },
    { t: "*Utile.* Le petit objet qui rend service.", s: "word-subline" },
  ],
  sub: [
    "{product} rend service tous les jours. Pratique, solide et facile à utiliser. Livré chez vous, payé à la réception.",
    "Pensé pour vous simplifier la vie, sans complication. Vous vérifiez le colis avant de payer.",
  ],
  bigWord: ["Pratique", "Essentiel"],
  tagline: ["Pratique, solide, facile à utiliser", "Le petit plus de votre quotidien"],
  benefitsTitle: ["Pourquoi vous allez *l'adopter*", "Ce qui le rend *pratique*"],
  benefits: [
    { icon: "check", title: "Simple à utiliser", text: "Pas de notice compliquée : on comprend tout de suite comment s'en servir." },
    { icon: "shield-check", title: "Solide", text: "Des matériaux choisis pour un usage de tous les jours." },
    { icon: "clock", title: "Du temps gagné", text: "Il rend les petites tâches plus rapides et plus agréables." },
    { icon: "bag", title: "Pratique", text: "Facile à ranger, facile à emporter." },
    { icon: "heart", title: "Pour toute la famille", text: "Chacun y trouve son usage." },
    { icon: "gift", title: "Bonne idée cadeau", text: "Utile et agréable : un cadeau qui sert vraiment." },
  ],
  problemTitle: ["Vous aussi, *vous en avez assez* ?", "Le quotidien mérite *plus simple*"],
  pains: [
    { pain: "Des objets qui ne tiennent pas leurs promesses", fix: "Un produit simple qui fait ce qu'il doit faire" },
    { pain: "Des articles fragiles", fix: "Solide, pensé pour tous les jours" },
    { pain: "Des solutions compliquées", fix: "Une utilisation immédiate" },
    { pain: "Payer d'avance sans voir le produit", fix: "Vous vérifiez avant de payer" },
  ],
  solution: ["Le petit plus du quotidien : *{product}*.", "Simple et bien pensé : *{product}*."],
  showcaseTitle: ["Regardez-le *de près*", "Chaque détail"],
  stepsTitle: ["Aussi simple que *ça*", "Comment ça marche"],
  steps: [
    { icon: "box", title: "Déballez", text: "Il arrive prêt à l'emploi." },
    { icon: "hand-heart", title: "Utilisez", text: "La prise en main est immédiate." },
    { icon: "heart", title: "Profitez", text: "Le quotidien devient plus simple, dès le premier jour." },
  ],
  faq: [
    { q: "Comment l'utiliser ?", a: "Il s'utilise simplement, sans réglage particulier. Une question ? {wa:Notre équipe vous répond sur WhatsApp.|Posez-la lors de l'appel de confirmation.}" },
    { q: "Est-ce un bon cadeau ?", a: "Oui : utile et agréable. Si c'est pour offrir, précisez-le dans la remarque de votre commande." },
  ],
  story: [
    { title: "Pourquoi on l'a *choisi*", text: "On sélectionne peu de produits, mais on les choisit bien. {product} nous a convaincus par sa simplicité et sa solidité. Vous le recevez chez vous et vous ne payez qu'après avoir vérifié le colis." },
  ],
  comparison: [
    { label: "Utilisation", us: "Simple, immédiate", them: "Compliquée" },
    { label: "Solidité", us: "Pensé pour durer", them: "Fragile" },
    { label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { label: "Avant de payer", us: "Vous vérifiez le colis", them: "Aucune vérification" },
  ],
  marquee: ["Pratique", "Solide", "Simple", "Bien pensé", "Payé à la livraison"],
};

/**
 * Mode pudique : abaya, robe ou ensemble de prière, hijab, khimar, djellaba, caftan, femmes et
 * filles. Ton calme, doux et précis : le tissu, la coupe, le confort, la taille, l'entretien. Rien
 * au-delà du confort et de la pudeur (aucune promesse spirituelle), aucune exagération.
 */
const modest: FamilyCopy = {
  kicker: ["{product}", "{product} · Mode pudique"],
  headline: [
    { t: "Fluide, couvrante, *élégante* sans effort.", s: "noun-phrase" },
    { t: "Une tombée *fluide*, une allure apaisée.", s: "noun-phrase" },
    { t: "La pudeur, portée *avec douceur*.", s: "noun-phrase" },
    { t: "Couvrez-vous avec *douceur*, du matin au soir.", s: "imperative" },
    { t: "*Tombé.* Une coupe ample qui suit vos gestes.", s: "word-subline" },
  ],
  sub: [
    "Un tissu doux qui tombe avec fluidité, une coupe ample qui couvre sans serrer : une pièce sereine, du matin au soir.",
    "Une matière agréable, des finitions nettes et une allure sobre, pour tous les jours comme pour les grandes occasions.",
  ],
  bigWord: ["Élégance", "Douceur"],
  tagline: ["Fluide, couvrante, élégante", "Une allure pudique, tout en douceur"],
  benefitsTitle: ["Ce qui fait *sa douceur*", "Pudique, et *si agréable à porter*"],
  benefits: [
    { topic: "fabric", icon: "feather", title: "Un tissu doux et fluide", text: "Agréable sur la peau, il tombe souplement et accompagne chaque mouvement." },
    { topic: "cover", icon: "shield-check", title: "Une coupe ample et couvrante", text: "Elle couvre sans serrer ni marquer la silhouette, pour une allure sereine." },
    { topic: "comfort", icon: "sun", title: "Confortable toute la journée", text: "Facile à porter, la pièce se fait oublier, à la maison comme en sortie." },
    { topic: "finish", icon: "check", title: "Des finitions soignées", text: "Coutures nettes et ourlets réguliers : la pièce garde sa belle tenue au fil des lavages." },
    { topic: "care", icon: "drop", title: "Un entretien simple", text: "Un lavage délicat, un séchage à plat, et la pièce retrouve son tombé." },
    { topic: "size", icon: "ruler", title: "Une taille facile à choisir", text: "Comparez avec une pièce qui vous va bien : on confirme la taille avec vous avant l'envoi." },
  ],
  problemTitle: ["Pudique, oui. *Inconfortable*, non.", "Trouver la bonne pièce *en ligne*"],
  pains: [
    { topic: "fabric", pain: "Un tissu qui colle ou qui gratte", fix: "Un tissu doux qui tombe souplement" },
    { topic: "cover", pain: "Une coupe trop près du corps", fix: "Une coupe ample qui couvre sans serrer" },
    { topic: "size", pain: "Une taille qui ne correspond pas à la photo", fix: "Vous vérifiez la pièce à la livraison, avant de payer" },
    { topic: "pay", pain: "Payer d'avance sans avoir touché le tissu", fix: "Paiement à la livraison, après vérification" },
  ],
  solution: ["Une allure pudique et sereine : *{product}*.", "La douceur d'une allure pudique : *{product}*."],
  showcaseTitle: ["Les détails, *de près*", "Tissu, coupe, *finitions*"],
  stepsTitle: ["Choisir, *simplement*", "Simple, *du choix à la livraison*"],
  steps: [
    { topic: "size", icon: "ruler", title: "Choisissez la taille", text: "Comparez avec une pièce qui vous va bien. Pour une tenue longue, mesurez de l'épaule à la cheville." },
    { topic: "order", icon: "check", title: "Commandez", text: "Nom, téléphone, ville : notre équipe vous appelle pour confirmer la commande." },
    { topic: "check", icon: "eye", title: "Vérifiez, puis payez", text: "Vous ouvrez le colis devant le livreur, vous touchez le tissu, puis vous payez." },
  ],
  faq: [
    {
      topic: "size",
      q: "Comment choisir la bonne taille ?",
      a: "Comparez avec une pièce qui vous va bien. Pour une tenue longue, mesurez de l'épaule à la cheville. {wa:Envoyez-nous la mesure sur WhatsApp : on vous conseille avant l'envoi.|Notez la mesure dans la remarque de commande : on la confirme avec vous lors de l'appel.}",
    },
    { topic: "fabric", q: "Comment est le tissu ?", a: "Doux au toucher et fluide. À la livraison, vous ouvrez le colis et vous vérifiez le tissu avant de payer." },
    { topic: "care", q: "Comment l'entretenir ?", a: "Suivez l'étiquette : lavage délicat à l'envers, séchage à plat et fer doux. Le tissu garde son tombé." },
  ],
  story: [
    {
      title: "La pudeur, *avec douceur*",
      text: "On voulait une pièce qui couvre avec élégance, sans rien sacrifier du confort : un tissu agréable, une coupe ample, des finitions nettes. C'est l'idée de {product}. Livraison chez vous, et vous ne payez qu'à la réception.",
    },
    {
      title: "Une allure *sereine*",
      text: "Il y a des pièces qu'on enfile sans y penser et dans lesquelles on se sent bien toute la journée. C'est ce que nous avons cherché avec {product} : une matière douce, une tombée fluide, une coupe qui couvre. Livraison chez vous, paiement à la réception.",
    },
  ],
  comparison: [
    { topic: "fabric", label: "Tissu", us: "Doux et fluide", them: "Rêche, il colle à la peau" },
    { topic: "cover", label: "Coupe", us: "Ample, elle couvre sans serrer", them: "Près du corps" },
    { topic: "pay", label: "Paiement", us: "À la livraison", them: "Paiement d'avance" },
    { topic: "size", label: "Taille", us: "Vérifiée avant de payer", them: "Mauvaise surprise au déballage" },
  ],
  marquee: ["Tissu fluide", "Coupe ample", "Finitions nettes", "Élégance pudique", "Paiement à la livraison"],
  voice: {
    heroCta: ["Commander", "Je commande"],
    ctaButton: ["Commander", "Je commande"],
    sticky: ["Commander"],
    ctaTitle: ["Une allure douce, *livrée chez vous*", "Il ne reste qu'à *faire votre choix*"],
  },
  facets: {
    prayer: {
      kicker: ["{product} · Pour la prière"],
      headline: [
        "Une tenue de prière *douce*, ample et couvrante.",
        "Ample à chaque mouvement, *douce* à chaque prière.",
        "Prier *à l'aise*, couverte avec douceur.",
      ],
      sub: [
        "Un tissu doux qui ne colle pas, une coupe ample qui laisse bouger librement : la tenue s'enfile en un geste, au moment de la prière.",
        "Couvrante, agréable à porter et facile à plier, la tenue vous accompagne à chaque prière, à la maison comme en voyage.",
      ],
      bigWord: ["Sérénité"],
      tagline: ["Une tenue de prière douce et couvrante", "Ample, douce, prête pour la prière"],
      benefits: [
        { topic: "prayer", icon: "hand-heart", title: "Libre à chaque mouvement", text: "Ample là où il faut : on s'incline et on se prosterne sans que le tissu tire ni remonte." },
        { topic: "quick", icon: "clock", title: "Prête en un geste", text: "Elle s'enfile par-dessus la tenue du jour au moment de la prière, puis se plie dans un sac." },
      ],
      pains: [{ topic: "cover", pain: "Une tenue qui serre ou remonte pendant la prière", fix: "Une coupe ample, libre à chaque mouvement" }],
      story: [
        {
          title: "Pensée *pour la prière*",
          text: "Au moment de prier, on veut une tenue qui couvre bien, qui ne gêne pas et qu'on enfile en un geste. C'est l'idée de {product} : un tissu doux, une coupe ample, des finitions soignées. Livraison chez vous, paiement à la réception.",
        },
      ],
      comparison: [{ topic: "cover", label: "Pour la prière", us: "Ample, libre à chaque mouvement", them: "Serrée ou trop courte" }],
      marquee: ["Pour la prière", "Ample et douce"],
    },
    girls: {
      kicker: ["{product} · Pour les petites"],
      headline: [
        "Douce comme elle, *couvrante* comme il faut.",
        "Sa tenue à elle, *douce* et facile à enfiler.",
        "L'élégance des grandes, *à sa taille*.",
      ],
      sub: [
        "Un tissu doux qui ne gratte pas, une coupe ample pour bouger librement et des tailles pensées pour son âge.",
        "Douce sur la peau, couvrante sans la gêner : une tenue à sa mesure, qu'elle portera avec plaisir.",
      ],
      tagline: ["Douce et couvrante, pour les petites", "L'élégance pudique, à sa taille"],
      benefits: [
        { topic: "easy", icon: "heart", title: "Facile à enfiler seule", text: "Elle l'enfile sans aide, et le tissu doux ne gratte pas." },
        { topic: "size", icon: "ruler", title: "À sa taille", text: "Les tailles suivent l'âge, et on confirme avec vous la bonne taille avant l'envoi." },
      ],
      pains: [{ topic: "fabric", pain: "Un tissu qui gratte et qu'elle refuse de porter", fix: "Un tissu doux qu'elle garde volontiers" }],
      steps: [{ topic: "size", icon: "ruler", title: "Choisissez sa taille", text: "Les tailles suivent l'âge : comparez avec une tenue qui lui va bien. Entre deux tailles, prenez la plus grande." }],
      faq: [
        {
          topic: "size",
          q: "Quelle taille choisir pour ma fille ?",
          a: "Les tailles suivent l'âge. Comparez avec une tenue qui lui va bien : pour une tenue longue, mesurez de l'épaule à la cheville. Entre deux tailles, choisissez la plus grande : elle la portera plus longtemps. {wa:Envoyez-nous son âge et sa mesure sur WhatsApp : on vous conseille.|Notez son âge et sa mesure dans la remarque de commande : on confirme la taille lors de l'appel.}",
        },
      ],
      story: [
        {
          title: "Pour *les petites*",
          text: "Les petites filles aiment faire comme les grandes. On a voulu une tenue à leur mesure : un tissu doux qui ne gratte pas, une coupe ample, facile à enfiler seule. C'est {product}. Livraison chez vous, paiement à la réception.",
        },
      ],
      comparison: [{ topic: "size", label: "Taille", us: "Selon son âge, vérifiée avant de payer", them: "Trop grande ou trop courte" }],
      marquee: ["Pour les petites", "Douce sur la peau"],
    },
    kids: {
      kicker: ["{product} · Pour les enfants"],
      headline: ["Douce, couvrante, *à leur taille*.", "Une tenue *douce*, facile à enfiler."],
      sub: ["Un tissu doux qui ne gratte pas, une coupe ample pour bouger librement et des tailles pensées selon l'âge."],
      tagline: ["Douce et couvrante, pour les enfants"],
      benefits: [
        { topic: "easy", icon: "heart", title: "Facile à enfiler", text: "Elle s'enfile sans aide, et le tissu doux ne gratte pas." },
        { topic: "size", icon: "ruler", title: "À leur taille", text: "Les tailles suivent l'âge, et on confirme avec vous la bonne taille avant l'envoi." },
      ],
      steps: [{ topic: "size", icon: "ruler", title: "Choisissez la taille", text: "Les tailles suivent l'âge : comparez avec une tenue qui va bien à votre enfant. Entre deux tailles, prenez la plus grande." }],
      faq: [
        {
          topic: "size",
          q: "Quelle taille choisir pour mon enfant ?",
          a: "Les tailles suivent l'âge. Comparez avec une tenue qui lui va bien : pour une tenue longue, mesurez de l'épaule à la cheville. Entre deux tailles, choisissez la plus grande. {wa:Envoyez-nous son âge et sa mesure sur WhatsApp : on vous conseille.|Notez son âge et sa mesure dans la remarque de commande : on confirme la taille lors de l'appel.}",
        },
      ],
      comparison: [{ topic: "size", label: "Taille", us: "Selon l'âge, vérifiée avant de payer", them: "Trop grande ou trop courte" }],
      marquee: ["Pour les enfants"],
    },
    lace: {
      headline: ["La finesse de la *dentelle*, l'aisance d'une coupe ample."],
      bigWord: ["Dentelle"],
      benefits: [{ topic: "lace", icon: "asterisk", title: "Une dentelle délicate", text: "Une touche de dentelle qui habille la pièce avec finesse, sans la charger." }],
      faq: [
        {
          topic: "care",
          q: "Comment entretenir la dentelle ?",
          a: "Lavage délicat à l'envers ou à la main, sans essorage fort, puis séchage à plat. Fer doux, jamais directement sur la dentelle.",
        },
      ],
      comparison: [{ topic: "finish", label: "Finitions", us: "Dentelle fine, coutures nettes", them: "Dentelle rêche qui s'effiloche" }],
      marquee: ["Dentelle délicate"],
    },
    veil: {
      headline: ["Un voile *doux* qui se drape en un geste.", "Encadrer le visage *avec douceur*.", "Le voile du quotidien, *simple et élégant*."],
      sub: [
        "Un tissu doux qui se drape facilement et s'accorde à toutes vos tenues, du quotidien aux occasions.",
        "Doux autour du visage, facile à ajuster et à épingler : un voile qu'on met chaque jour sans y penser.",
      ],
      tagline: ["Doux, facile à draper, élégant", "Le voile qui s'accorde à tout"],
      benefits: [
        { topic: "cover", icon: "waves", title: "Un drapé facile", text: "Il se pose et s'ajuste en quelques gestes, et encadre le visage avec douceur." },
        { topic: "size", icon: "star", title: "Facile à assortir", text: "Il s'accorde à vos tenues de tous les jours comme aux plus habillées." },
      ],
      pains: [
        { topic: "cover", pain: "Un voile qui se froisse et se défait", fix: "Un tissu souple qui se drape facilement" },
        { topic: "size", pain: "Une couleur différente de la photo", fix: "Vous vérifiez la teinte avant de payer" },
      ],
      steps: [{ topic: "size", icon: "eye", title: "Choisissez la teinte", text: "Prenez une couleur qui s'accorde à vos tenues : vous la vérifiez à la livraison, avant de payer." }],
      faq: [
        {
          topic: "size",
          q: "Comment le porter ?",
          a: "Posé simplement et épinglé sous le menton, ou croisé autour du visage : il se drape de plusieurs façons, selon votre style.",
        },
      ],
      story: [
        {
          title: "Le voile *du quotidien*",
          text: "On voulait un voile qu'on met chaque matin sans y penser : doux autour du visage, facile à draper, assorti à tout. C'est l'idée de {product}. Livraison chez vous, paiement à la réception.",
        },
      ],
      comparison: [
        { topic: "cover", label: "Drapé", us: "Se met en quelques gestes", them: "Glisse et se défait" },
        { topic: "size", label: "Couleur", us: "Vérifiée avant de payer", them: "Différente de la photo" },
      ],
      marquee: ["Drapé facile", "Doux autour du visage"],
    },
  },
};

export const FR: LocaleLibrary = {
  common: {
    heroCta: ["Je commande maintenant", "Commander", "Commander, paiement à la livraison"],
    announcement: [
      "Paiement à la livraison",
      "{delivery}",
      "Vérifiez votre colis avant de payer",
      "{wa:Une question ? On répond sur WhatsApp|On vous appelle pour confirmer}",
    ],
    trust: [
      { icon: "cash-hand", text: "Paiement à la livraison" },
      { icon: "truck", text: "{delivery}" },
      { icon: "eye", text: "Vérifiez avant de payer" },
      { icon: "headset", text: "{wa:Service client sur WhatsApp|Confirmation par téléphone}" },
    ],
    kickers: {
      benefits: ["Pourquoi on l'adore", "Les avantages"],
      problem: ["Le problème", "On connaît ça"],
      showcase: ["De près", "Dans le détail"],
      steps: ["Mode d'emploi", "Comment ça marche"],
      story: ["Notre histoire", "Pourquoi ce choix"],
      reviews: ["Avis clients", "Ils l'ont reçu"],
      socialProof: ["Vos messages", "Ils nous écrivent"],
      gallery: ["En images", "Galerie"],
      specs: ["Caractéristiques", "Fiche produit"],
      offer: ["Les offres", "Choisissez votre pack"],
      guarantee: ["Notre engagement", "Commandez sereinement"],
      form: ["Commande express", "Commande en un instant"],
      cta: ["Dernière étape", "Prêt ?"],
      faq: ["Questions fréquentes", "Vos questions"],
    },
    benefitsLead: ["Pas de promesses vagues : voici ce qui change, concrètement.", "Ce que vous allez remarquer dès les premiers jours."],
    problemLead: ["Si l'une de ces phrases vous parle, la suite est pour vous.", "On a tous connu ça. Bonne nouvelle : il y a plus simple."],
    showcaseLead: ["Ce qui ne se voit pas sur une photo de loin, expliqué point par point.", "Les détails qui font la différence au quotidien."],
    reviewsTitle: ["Reçu, testé, *adopté*", "Ce qu'en disent *nos clients*"],
    socialProofTitle: ["Livrés, ravis, et ils *recommandent*", "Les messages qui *nous font plaisir*"],
    galleryTitle: ["Sous *tous les angles*", "Regardez de plus près"],
    specsTitle: ["Tout ce qu'il faut *savoir*", "La fiche *complète*"],
    comparison: { title: ["Pourquoi le choisir *chez nous*", "La différence, *point par point*"], us: "Chez nous", them: "Ailleurs" },
    offer: {
      title: ["Choisissez votre *offre*", "Plus vous en prenez, *plus vous économisez*"],
      lead: ["Toutes les offres se paient à la livraison. Choisissez, on vous appelle pour confirmer.", "Livraison chez vous, paiement à la réception, sur toutes les offres."],
      cta: ["Je prends ce pack", "Choisir cette offre"],
    },
    guarantee: {
      title: ["Commandez *l'esprit tranquille*", "Zéro risque, *zéro avance*"],
      lines: [
        "Vous ne payez rien en ligne : vous réglez en espèces à la réception.",
        "Vous ouvrez et vérifiez votre colis devant le livreur avant de payer.",
        "{wa:Un souci avec votre commande ? Notre équipe vous répond sur WhatsApp.|Un souci avec votre commande ? Contactez-nous : on trouve une solution ensemble.}",
        "Notre équipe vous appelle pour confirmer avant l'envoi.",
      ],
    },
    form: {
      title: ["Commandez, vous payez *à la porte*", "Recevez-le *chez vous*"],
      lead: [
        "Remplissez le formulaire : un conseiller vous appelle pour confirmer. Vous ne payez qu'en recevant le colis.",
        "Quelques champs, et c'est fait. Paiement en espèces à la livraison.",
      ],
      submit: ["Confirmer ma commande", "Je commande, paiement à la livraison"],
      reassurance: ["Vous ne payez qu'à la réception, après avoir vu votre colis.", "Aucun paiement en ligne. Vous vérifiez avant de payer."],
    },
    cta: {
      title: ["Prêt à l'*essayer* ?", "Commandez maintenant, *payez à la porte*"],
      text: ["Commandez en trente secondes. Vous payez à la livraison, après avoir vérifié votre colis.", "{delivery}. Paiement à la réception, sans avance."],
      button: ["Je commande maintenant", "Commander"],
    },
    faqTitle: ["Vos questions, *nos réponses*", "Tout ce que vous voulez *savoir*"],
    faq: {
      cod: [
        { q: "Comment se passe le paiement ?", a: "Vous payez en espèces au livreur, à la réception de votre colis. Aucun paiement en ligne, aucune carte bancaire." },
        { q: "Dois-je payer quelque chose à l'avance ?", a: "Non. Vous ne payez rien à la commande : le règlement se fait à la livraison, en espèces." },
      ],
      delivery: [
        { q: "Quels sont les délais de livraison ?", a: "{delivery}. Notre équipe vous appelle pour confirmer la commande et l'adresse avant l'envoi." },
        { q: "Livrez-vous dans ma ville ?", a: "Nous livrons {where}. Indiquez votre ville dans le formulaire, nous vous confirmons tout par téléphone." },
      ],
      inspect: [
        { q: "Puis-je vérifier le colis avant de payer ?", a: "Oui. Vous ouvrez le colis devant le livreur, vous vérifiez le produit, puis vous payez." },
        { q: "Et si le produit ne correspond pas ?", a: "Vous le vérifiez à la livraison, avant de payer. En cas de souci, contactez-nous{wa: sur WhatsApp|} : on trouve une solution." },
      ],
      exchange: [
        { q: "Puis-je échanger mon produit ?", a: "Contactez-nous{wa: sur WhatsApp|} avec votre numéro de commande : notre équipe vous explique les conditions d'échange." },
        { q: "Que faire en cas de problème après la livraison ?", a: "{wa:Écrivez-nous sur WhatsApp avec une photo|Contactez-nous avec votre numéro de commande et une photo} : notre service client vous répond et vous accompagne." },
      ],
    },
    sticky: { label: ["Commander", "Je commande"], note: ["Paiement à la livraison", "Payé à la réception"] },
    whatsapp: {
      label: ["Une question ? Écrivez-nous", "On vous répond sur WhatsApp"],
      message: ["Bonjour, j'ai une question sur {product}.", "Bonjour, je souhaite commander {product}."],
    },
    bundles: [
      { title: "1 pièce", subtitle: "Pour découvrir" },
      { title: "Pack Duo", subtitle: "Pour vous et un proche" },
      { title: "Pack Trio", subtitle: "Le meilleur prix par pièce" },
    ],
    offers: {
      choice: { title: "Au choix", subtitle: "Choisissez votre préféré" },
      anyN: { title: "{n} au choix", subtitle: "Composez votre pack" },
      duo: { title: "Le duo", subtitle: "Les deux ensemble" },
      trio: { title: "Le trio complet", subtitle: "Les trois réunis" },
      set: { title: "Coffret complet", subtitle: "Toute la gamme réunie", short: "Coffret" },
      bogo: { title: "1 acheté, 1 offert", subtitle: "La deuxième pièce est offerte", short: "1 + 1" },
      colors: { title: "Pack {n} couleurs", subtitle: "Une pièce de chaque couleur", short: "{n} couleurs" },
    },
    seo: {
      title: ["{product} | Paiement à la livraison", "{product} | Livraison rapide, paiement à la réception"],
      description: [
        "Commandez {product} en ligne et payez à la livraison. {delivery}. Vérifiez votre colis avant de payer.",
        "{product} : livré chez vous, payé en espèces à la réception. Commande en quelques clics.",
      ],
    },
    thankYou: {
      title: ["Merci, votre commande est *bien reçue*", "C'est noté, *merci*"],
      message: [
        "Notre équipe vous appelle très vite pour confirmer votre commande et votre adresse. Gardez votre téléphone à portée de main.",
        "Un conseiller va vous appeler pour confirmer. Vous paierez à la livraison, après avoir vérifié votre colis.",
      ],
    },
    where: { MA: "partout au Maroc", other: "dans toute la zone de livraison" },
  },
  families: { skincare, haircare, fragrance, jewelry, fashion, modest, wellness, fitness, kitchen, home, kids, pets, tech, auto, terroir, general },
};
