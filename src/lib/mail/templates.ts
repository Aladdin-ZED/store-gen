/**
 * The transactional mails (docs/STORE-SAAS.md §B.10): one subject and one plain-text body per template and locale.
 * Plain text only (no HTML, no tracking pixel, no remote image); `{var}` placeholders filled from `MailMessage.vars`,
 * an unknown placeholder stays visible rather than guessing a value. `{brand}` is the platform brand
 * (`platform.brand.name`). Isomorphic and pure.
 */
import type { MailMessage, MailTemplateId } from "./index";

type Locale = MailMessage["locale"];

interface Template {
  subject: string;
  body: string;
}

const T: Record<MailTemplateId, Record<Locale, Template>> = {
  invite: {
    en: {
      subject: "{inviterName} invited you to {storeName}",
      body: "Hello,\n\n{inviterName} invited you to join {storeName} on {brand} as {role}.\n\nAccept the invitation here:\n{url}\n\nThe link works once and expires on {expiresAt}. If you weren't expecting it, you can ignore this e-mail.",
    },
    fr: {
      subject: "{inviterName} vous invite à rejoindre {storeName}",
      body: "Bonjour,\n\n{inviterName} vous invite à rejoindre {storeName} sur {brand} en tant que {role}.\n\nAcceptez l'invitation ici :\n{url}\n\nLe lien ne sert qu'une fois et expire le {expiresAt}. Si vous ne l'attendiez pas, ignorez simplement cet e-mail.",
    },
    ar: {
      subject: "{inviterName} يدعوك للانضمام إلى {storeName}",
      body: "مرحبًا،\n\nيدعوك {inviterName} للانضمام إلى {storeName} على {brand} بصفة {role}.\n\nاقبل الدعوة من هنا:\n{url}\n\nيعمل الرابط مرة واحدة وتنتهي صلاحيته في {expiresAt}. إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة.",
    },
  },
  staff_invite: {
    en: {
      subject: "Your {brand} team access",
      body: "Hello,\n\nYou were invited to the {brand} team as {role}.\n\nCreate your account here:\n{url}\n\nThe link works once and expires on {expiresAt}.",
    },
    fr: {
      subject: "Votre accès à l'équipe {brand}",
      body: "Bonjour,\n\nVous êtes invité dans l'équipe {brand} en tant que {role}.\n\nCréez votre compte ici :\n{url}\n\nLe lien ne sert qu'une fois et expire le {expiresAt}.",
    },
    ar: {
      subject: "دخولك إلى فريق {brand}",
      body: "مرحبًا،\n\nتمت دعوتك إلى فريق {brand} بصفة {role}.\n\nأنشئ حسابك من هنا:\n{url}\n\nيعمل الرابط مرة واحدة وتنتهي صلاحيته في {expiresAt}.",
    },
  },
  password_reset: {
    en: {
      subject: "Reset your {brand} password",
      body: "Hello,\n\nUse this link to choose a new password:\n{url}\n\nIt works once and expires in 60 minutes. If you didn't ask for it, ignore this e-mail: your password stays the same.",
    },
    fr: {
      subject: "Réinitialisez votre mot de passe {brand}",
      body: "Bonjour,\n\nUtilisez ce lien pour choisir un nouveau mot de passe :\n{url}\n\nIl ne sert qu'une fois et expire dans 60 minutes. Si vous n'avez rien demandé, ignorez cet e-mail : votre mot de passe ne change pas.",
    },
    ar: {
      subject: "إعادة تعيين كلمة مرور {brand}",
      body: "مرحبًا،\n\nاستخدم هذا الرابط لاختيار كلمة مرور جديدة:\n{url}\n\nيعمل مرة واحدة وتنتهي صلاحيته بعد 60 دقيقة. إذا لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.",
    },
  },
  signup_received: {
    en: {
      subject: "Welcome to {brand}: {storeName} is ready to build",
      body: "Hello,\n\nYour store {storeName} is created. You can build your pages right away; publishing and orders open once the store is approved.\n\nYour dashboard: {url}",
    },
    fr: {
      subject: "Bienvenue sur {brand} : {storeName} est prête",
      body: "Bonjour,\n\nVotre boutique {storeName} est créée. Vous pouvez construire vos pages dès maintenant ; la publication et les commandes s'ouvrent une fois la boutique validée.\n\nVotre tableau de bord : {url}",
    },
    ar: {
      subject: "مرحبًا بك في {brand}: متجرك {storeName} جاهز للبناء",
      body: "مرحبًا،\n\nتم إنشاء متجرك {storeName}. يمكنك بناء صفحاتك الآن، ويُفتح النشر واستقبال الطلبات بعد الموافقة على المتجر.\n\nلوحة التحكم: {url}",
    },
  },
  signup_approved: {
    en: { subject: "{storeName} is approved", body: "Good news: {storeName} is approved. You can publish your pages and take orders now.\n\n{url}" },
    fr: { subject: "{storeName} est validée", body: "Bonne nouvelle : {storeName} est validée. Vous pouvez publier vos pages et recevoir des commandes.\n\n{url}" },
    ar: { subject: "تمت الموافقة على {storeName}", body: "خبر سار: تمت الموافقة على {storeName}. يمكنك الآن نشر صفحاتك واستقبال الطلبات.\n\n{url}" },
  },
  signup_rejected: {
    en: { subject: "About your {brand} application", body: "Hello,\n\nWe couldn't approve {storeName} for now. You can read the reason and send one appeal from your dashboard:\n{url}" },
    fr: { subject: "Votre demande sur {brand}", body: "Bonjour,\n\nNous n'avons pas pu valider {storeName} pour le moment. Vous trouverez la raison et pourrez faire un recours depuis votre tableau de bord :\n{url}" },
    ar: { subject: "بخصوص طلبك على {brand}", body: "مرحبًا،\n\nلم نتمكن من الموافقة على {storeName} حاليًا. يمكنك الاطلاع على السبب وتقديم طعن واحد من لوحة التحكم:\n{url}" },
  },
  impersonation_notice: {
    en: { subject: "{brand} support opened {storeName}", body: "Hello,\n\nA member of the {brand} support team opened {storeName} in read-only mode for {minutes} minutes. They can't change anything, and customer details stay hidden from them.\n\nActivity: {url}" },
    fr: { subject: "Le support {brand} a ouvert {storeName}", body: "Bonjour,\n\nUn membre du support {brand} a ouvert {storeName} en lecture seule pour {minutes} minutes. Il ne peut rien modifier et les coordonnées de vos clients lui restent masquées.\n\nActivité : {url}" },
    ar: { subject: "فتح دعم {brand} متجرك {storeName}", body: "مرحبًا،\n\nفتح أحد أعضاء دعم {brand} متجرك {storeName} للقراءة فقط لمدة {minutes} دقيقة. لا يمكنه تغيير أي شيء، وتبقى بيانات زبائنك مخفية عنه.\n\nالنشاط: {url}" },
  },
  store_status: {
    en: { subject: "{storeName}: status update", body: "Hello,\n\nThe status of {storeName} changed: {status}.\n\nDetails: {url}" },
    fr: { subject: "{storeName} : changement de statut", body: "Bonjour,\n\nLe statut de {storeName} a changé : {status}.\n\nDétails : {url}" },
    ar: { subject: "{storeName}: تحديث الحالة", body: "مرحبًا،\n\nتغيّرت حالة {storeName}: {status}.\n\nالتفاصيل: {url}" },
  },
  export_ready: {
    en: { subject: "Your {storeName} export is ready", body: "Hello,\n\nThe data export of {storeName} is ready. Download it within 72 hours:\n{url}" },
    fr: { subject: "L'export de {storeName} est prêt", body: "Bonjour,\n\nL'export des données de {storeName} est prêt. Téléchargez-le sous 72 heures :\n{url}" },
    ar: { subject: "تصدير بيانات {storeName} جاهز", body: "مرحبًا،\n\nتصدير بيانات {storeName} جاهز. حمّله خلال 72 ساعة:\n{url}" },
  },
  digest: {
    en: { subject: "{storeName}: your summary", body: "Hello,\n\n{summary}\n\n{url}" },
    fr: { subject: "{storeName} : votre résumé", body: "Bonjour,\n\n{summary}\n\n{url}" },
    ar: { subject: "{storeName}: ملخصك", body: "مرحبًا،\n\n{summary}\n\n{url}" },
  },
  payout_ready: {
    en: { subject: "{storeName}: a payout is ready", body: "Hello,\n\nA payout of {storeName} is ready for you.\n\n{url}" },
    fr: { subject: "{storeName} : un paiement est prêt", body: "Bonjour,\n\nUn paiement de {storeName} est prêt pour vous.\n\n{url}" },
    ar: { subject: "{storeName}: دفعة جاهزة", body: "مرحبًا،\n\nدفعة من {storeName} جاهزة لك.\n\n{url}" },
  },
};

/** Header-safe single line (no CR / LF), at most `max` characters. */
const oneLine = (value: string, max: number) => value.replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);

function fill(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (whole, key: string) => (Object.hasOwn(vars, key) ? vars[key]! : whole));
}

/** The subject (one line) and the body of a mail. */
export function renderMail(id: MailTemplateId, locale: Locale, vars: Readonly<Record<string, string>>): { subject: string; text: string } {
  const t = T[id][locale] ?? T[id].en;
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) clean[k] = typeof v === "string" ? v.replace(/\u0000/g, "").slice(0, 2_000) : "";
  return { subject: oneLine(fill(t.subject, clean), 200), text: fill(t.body, clean) };
}
