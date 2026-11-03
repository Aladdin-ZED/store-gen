/**
 * The platform documents a person accepts (P1 CONSOLE; platform.md PLA-§13.4, PD17, PD49): Terms of service, Privacy
 * policy and Acceptable use policy, in ar / fr / en. Seeded as version 1 drafts flagged `needs_legal_review` (./index.ts,
 * the boot seeder); the owner has them reviewed, edits them in the console and publishes them. Written from what the
 * product does (core spec), with no company number, address, registration or certification: the operator's identity
 * is the owner's to add. Markdown-lite only (PLA-§13.6): headings, lists, bold; no placeholder, no link.
 */
import type { LegalSeedDoc } from "./index";

const TOS_EN = `# Terms of service

These terms apply between Store Gen and every person who creates an account on it ("you"). By creating an account, you accept them.

## 1. The service

Store Gen lets sellers build landing pages and online stores that take cash-on-delivery orders, and manage those orders with their team.

## 2. Your account

- Give accurate information and keep it up to date.
- Keep your password and your two-factor codes to yourself. What is done from your account is your responsibility.
- You must be old enough to enter into a contract where you live.

## 3. Your store

- You are the seller. You choose what you sell and at what price, and you deliver it. Store Gen is not a party to your sales.
- You are responsible for your products, your pages, your prices, your delivery and your after-sales service, and for following the laws that apply to them.
- A new store may be reviewed before it can publish. We may ask you questions, or decline a store.

## 4. Acceptable use

Your use of Store Gen follows the **Acceptable use policy**, which is part of these terms.

## 5. Your customers' data

You collect your customers' names, phone numbers and addresses to handle their orders. Use them only for that, and treat them as the **Privacy policy** describes. Store Gen processes them on your behalf to run the service.

## 6. Plans and limits

Each store is on a plan with limits, such as storage, pages and team size. Your dashboard shows the limits that apply to your store. Orders are never blocked by a plan limit.

## 7. Restriction, suspension and closing

- We may restrict or suspend a store that breaks these terms or puts buyers at risk. The store's dashboard says why.
- You can close your store from its settings. A closed store can be reopened within 30 days; after that, its data is scheduled for deletion.

## 8. Availability

We work to keep the service available but cannot promise it will never be interrupted. During maintenance, dashboards may be read-only for a while.

## 9. Liability

To the extent the law allows, Store Gen is not liable for indirect losses, lost profits, or the acts of your customers, delivery companies or other third parties.

## 10. Changes to these terms

We may update these terms. When a change matters, your dashboard asks you to accept the new version and shows a summary of what changed.

## 11. Questions

Use the Help button in your dashboard.`;

const TOS_FR = `# Conditions d'utilisation

Ces conditions s'appliquent entre Store Gen et toute personne qui y crée un compte (« vous »). En créant un compte, vous les acceptez.

## 1. Le service

Store Gen permet aux vendeurs de créer des pages de vente et des boutiques en ligne qui reçoivent des commandes payées à la livraison, et de gérer ces commandes avec leur équipe.

## 2. Votre compte

- Donnez des informations exactes et tenez-les à jour.
- Gardez pour vous votre mot de passe et vos codes de double authentification. Ce qui est fait depuis votre compte relève de votre responsabilité.
- Vous devez avoir l'âge de conclure un contrat là où vous vivez.

## 3. Votre boutique

- C'est vous le vendeur. Vous choisissez ce que vous vendez et à quel prix, et vous le livrez. Store Gen n'est pas partie à vos ventes.
- Vous êtes responsable de vos produits, de vos pages, de vos prix, de votre livraison et de votre service après-vente, ainsi que du respect des lois qui s'y appliquent.
- Une nouvelle boutique peut être examinée avant de pouvoir publier. Nous pouvons vous poser des questions ou refuser une boutique.

## 4. Usage acceptable

Votre utilisation de Store Gen suit la **Politique d'usage acceptable**, qui fait partie de ces conditions.

## 5. Les données de vos clients

Vous recueillez le nom, le numéro de téléphone et l'adresse de vos clients pour traiter leurs commandes. Utilisez-les uniquement à cette fin, et traitez-les comme le décrit la **Politique de confidentialité**. Store Gen les traite pour votre compte afin de faire fonctionner le service.

## 6. Offres et limites

Chaque boutique a une offre avec des limites, par exemple le stockage, le nombre de pages et la taille de l'équipe. Votre tableau de bord affiche les limites qui s'appliquent à votre boutique. Les commandes ne sont jamais bloquées par une limite d'offre.

## 7. Restriction, suspension et fermeture

- Nous pouvons restreindre ou suspendre une boutique qui enfreint ces conditions ou met des acheteurs en danger. Le tableau de bord de la boutique en indique la raison.
- Vous pouvez fermer votre boutique depuis ses paramètres. Une boutique fermée peut être rouverte pendant 30 jours ; ensuite, la suppression de ses données est programmée.

## 8. Disponibilité

Nous faisons en sorte que le service reste disponible, sans pouvoir promettre qu'il ne sera jamais interrompu. Pendant une maintenance, les tableaux de bord peuvent passer en lecture seule pour un temps.

## 9. Responsabilité

Dans la mesure permise par la loi, Store Gen n'est pas responsable des pertes indirectes, des manques à gagner, ni des actes de vos clients, des sociétés de livraison ou d'autres tiers.

## 10. Modification de ces conditions

Nous pouvons mettre à jour ces conditions. Quand un changement compte, votre tableau de bord vous demande d'accepter la nouvelle version et en résume les changements.

## 11. Questions

Utilisez le bouton Aide de votre tableau de bord.`;

const TOS_AR = `# شروط الاستخدام

تسري هذه الشروط بين Store Gen وكل شخص ينشئ حسابًا عليه ("أنت"). بإنشائك حسابًا فإنك تقبلها.

## 1. الخدمة

يتيح Store Gen للبائعين إنشاء صفحات بيع ومتاجر إلكترونية تستقبل طلبات الدفع عند الاستلام، وإدارة هذه الطلبات مع فريقهم.

## 2. حسابك

- قدّم معلومات صحيحة وحافظ على تحديثها.
- احتفظ لنفسك بكلمة المرور ورموز التحقق بخطوتين. ما يتم من حسابك يقع على مسؤوليتك.
- يجب أن تكون قد بلغت السن الذي يسمح لك بإبرام عقد في بلد إقامتك.

## 3. متجرك

- أنت البائع. أنت من يختار ما يبيعه وبأي سعر، وأنت من يسلّمه. Store Gen ليس طرفًا في مبيعاتك.
- أنت مسؤول عن منتجاتك وصفحاتك وأسعارك وتوصيلك وخدمة ما بعد البيع، وعن احترام القوانين التي تنطبق عليها.
- قد تتم مراجعة المتجر الجديد قبل أن يتمكن من النشر. يمكننا أن نطرح عليك أسئلة أو أن نرفض متجرًا.

## 4. الاستخدام المقبول

يخضع استخدامك لـ Store Gen لـ **سياسة الاستخدام المقبول**، وهي جزء من هذه الشروط.

## 5. بيانات زبائنك

تجمع اسم زبائنك ورقم هاتفهم وعنوانهم لمعالجة طلباتهم. استعملها لهذا الغرض فقط، وتعامل معها كما تصف **سياسة الخصوصية**. يعالجها Store Gen نيابةً عنك لتشغيل الخدمة.

## 6. الباقات والحدود

لكل متجر باقة بحدود، مثل التخزين وعدد الصفحات وحجم الفريق. تعرض لوحة التحكم الحدود التي تنطبق على متجرك. لا تُمنع الطلبات أبدًا بسبب حدّ في الباقة.

## 7. التقييد والتعليق والإغلاق

- يمكننا تقييد أو تعليق متجر يخالف هذه الشروط أو يعرّض المشترين للخطر. تبيّن لوحة تحكم المتجر السبب.
- يمكنك إغلاق متجرك من إعداداته. يمكن إعادة فتح المتجر المغلق خلال 30 يومًا، وبعدها تتم جدولة حذف بياناته.

## 8. التوفر

نعمل على إبقاء الخدمة متاحة، لكن لا يمكننا أن نعد بأنها لن تتوقف أبدًا. أثناء الصيانة قد تصبح لوحات التحكم للقراءة فقط لبعض الوقت.

## 9. المسؤولية

في الحدود التي يسمح بها القانون، لا يتحمل Store Gen مسؤولية الخسائر غير المباشرة أو الأرباح الفائتة أو أفعال زبائنك أو شركات التوصيل أو أي أطراف أخرى.

## 10. تعديل هذه الشروط

يمكننا تحديث هذه الشروط. عندما يكون التغيير مهمًا، تطلب منك لوحة التحكم قبول النسخة الجديدة وتعرض ملخصًا لما تغيّر.

## 11. أسئلة

استعمل زر المساعدة في لوحة التحكم.`;

const PRIVACY_EN = `# Privacy policy

This policy explains what Store Gen does with personal data: the data of people who use Store Gen, and the data of the buyers who order from stores built on it.

## Data about you, as a user

- **Account:** your name, e-mail address, phone number if you give it, language, and your password stored only as a secure hash.
- **Security:** sign-ins, two-factor settings, and the device and network a request came from, used to protect accounts and stop abuse.
- **Your stores:** what you enter in the dashboard, such as store name, pages, settings and team.

## Data about buyers

When someone orders from a store, the store collects their name, phone number, city, address and any note. The store is responsible for this data; Store Gen stores and processes it on the store's behalf so the store can confirm and deliver orders.

## Why we use data

- To run the service: accounts, stores, pages and orders.
- To keep it secure: sign-in checks, fraud and abuse prevention, reviewing new stores.
- To support you when you ask for help.

We do not sell personal data.

## Who receives data

- Our hosting and network providers, to run the service.
- Services a store chooses to connect, such as Google Sheets, Meta, TikTok or Telegram, receive what that connection sends.
- When a store uses AI features, the content it submits is sent to an AI provider to produce the result.
- Authorities, when the law requires it.

## How long we keep data

- Account data: while the account exists.
- Security and audit records: up to 400 days.
- A closed store's data: deleted after the reopen window and the deletion schedule.

## Your choices

You can see and correct your account details in your account settings, and delete your account there. If you bought from a store, contact that store about your order data.

## Changes

We may update this policy. When a change matters, your dashboard asks you to read and accept the new version.

## Questions

Use the Help button in your dashboard.`;

const PRIVACY_FR = `# Politique de confidentialité

Cette politique explique ce que Store Gen fait des données personnelles : celles des personnes qui utilisent Store Gen, et celles des acheteurs qui commandent dans les boutiques créées avec.

## Vos données, en tant qu'utilisateur

- **Compte :** votre nom, votre adresse e-mail, votre numéro de téléphone si vous le donnez, votre langue, et votre mot de passe conservé uniquement sous forme d'empreinte sécurisée.
- **Sécurité :** les connexions, les réglages de double authentification, ainsi que l'appareil et le réseau d'où vient une requête, pour protéger les comptes et empêcher les abus.
- **Vos boutiques :** ce que vous saisissez dans le tableau de bord, comme le nom de la boutique, les pages, les réglages et l'équipe.

## Les données des acheteurs

Quand quelqu'un commande dans une boutique, la boutique recueille son nom, son numéro de téléphone, sa ville, son adresse et une éventuelle note. La boutique est responsable de ces données ; Store Gen les conserve et les traite pour son compte afin qu'elle puisse confirmer et livrer les commandes.

## Pourquoi nous utilisons les données

- Pour faire fonctionner le service : comptes, boutiques, pages et commandes.
- Pour le sécuriser : contrôle des connexions, prévention de la fraude et des abus, examen des nouvelles boutiques.
- Pour vous aider quand vous le demandez.

Nous ne vendons pas de données personnelles.

## Qui reçoit des données

- Nos hébergeurs et fournisseurs réseau, pour faire fonctionner le service.
- Les services qu'une boutique choisit de connecter, comme Google Sheets, Meta, TikTok ou Telegram, reçoivent ce que cette connexion envoie.
- Quand une boutique utilise les fonctions d'IA, le contenu qu'elle soumet est envoyé à un fournisseur d'IA pour produire le résultat.
- Les autorités, quand la loi l'exige.

## Durée de conservation

- Données de compte : tant que le compte existe.
- Journaux de sécurité et d'audit : jusqu'à 400 jours.
- Données d'une boutique fermée : supprimées après le délai de réouverture et la suppression programmée.

## Vos choix

Vous pouvez consulter et corriger les informations de votre compte dans ses paramètres, et y supprimer votre compte. Si vous avez acheté dans une boutique, contactez cette boutique au sujet des données de votre commande.

## Modifications

Nous pouvons mettre à jour cette politique. Quand un changement compte, votre tableau de bord vous demande de lire et d'accepter la nouvelle version.

## Questions

Utilisez le bouton Aide de votre tableau de bord.`;

const PRIVACY_AR = `# سياسة الخصوصية

توضح هذه السياسة ما يفعله Store Gen بالبيانات الشخصية: بيانات الأشخاص الذين يستخدمون Store Gen، وبيانات المشترين الذين يطلبون من المتاجر المبنية عليه.

## بياناتك كمستخدم

- **الحساب:** اسمك وبريدك الإلكتروني ورقم هاتفك إن قدّمته ولغتك، وكلمة المرور محفوظة فقط في صورة بصمة آمنة.
- **الأمان:** عمليات تسجيل الدخول وإعدادات التحقق بخطوتين، والجهاز والشبكة التي جاء منها الطلب، لحماية الحسابات ومنع إساءة الاستخدام.
- **متاجرك:** ما تدخله في لوحة التحكم، مثل اسم المتجر والصفحات والإعدادات والفريق.

## بيانات المشترين

عندما يطلب شخص ما من متجر، يجمع المتجر اسمه ورقم هاتفه ومدينته وعنوانه وأي ملاحظة. المتجر هو المسؤول عن هذه البيانات، ويحفظها Store Gen ويعالجها نيابةً عنه حتى يتمكن من تأكيد الطلبات وتوصيلها.

## لماذا نستعمل البيانات

- لتشغيل الخدمة: الحسابات والمتاجر والصفحات والطلبات.
- للحفاظ على أمانها: مراقبة تسجيل الدخول، ومنع الاحتيال وإساءة الاستخدام، ومراجعة المتاجر الجديدة.
- لمساعدتك عندما تطلب ذلك.

نحن لا نبيع البيانات الشخصية.

## من يتلقى البيانات

- مزودو الاستضافة والشبكة لدينا، لتشغيل الخدمة.
- الخدمات التي يختار المتجر ربطها، مثل Google Sheets وMeta وTikTok وTelegram، تتلقى ما يرسله هذا الربط.
- عندما يستعمل المتجر ميزات الذكاء الاصطناعي، يُرسل المحتوى الذي يقدمه إلى مزود ذكاء اصطناعي لإنتاج النتيجة.
- السلطات، عندما يفرض القانون ذلك.

## مدة الاحتفاظ بالبيانات

- بيانات الحساب: ما دام الحساب موجودًا.
- سجلات الأمان والتدقيق: حتى 400 يوم.
- بيانات المتجر المغلق: تُحذف بعد انتهاء مهلة إعادة الفتح والحذف المجدول.

## اختياراتك

يمكنك الاطلاع على معلومات حسابك وتصحيحها من إعدادات الحساب، ويمكنك حذف حسابك من هناك. إذا اشتريت من متجر، فتواصل مع ذلك المتجر بخصوص بيانات طلبك.

## التغييرات

يمكننا تحديث هذه السياسة. عندما يكون التغيير مهمًا، تطلب منك لوحة التحكم قراءة النسخة الجديدة وقبولها.

## أسئلة

استعمل زر المساعدة في لوحة التحكم.`;

const AUP_EN = `# Acceptable use policy

This policy says what stores and users may not do on Store Gen. It is part of the Terms of service.

## Products you may not sell

- Anything illegal where you sell or where you deliver.
- Counterfeits, or products that copy a brand's name or logo without its permission.
- Weapons, drugs, medicines sold without the required authorisation, and other dangerous products.
- Stolen goods.

## Honest selling

- No invented prices, discounts, ratings, reviews, stock levels or countdowns.
- No health, income or results claims you cannot prove.
- No page that pretends to be another company, a bank, an administration or a delivery company.
- Say clearly what the buyer gets, the price and how delivery works.

## Buyers' data

- Collect only what an order needs, and use it only for that order and its after-sales service.
- No spam, and no selling or sharing of buyers' data with others.

## The service itself

- No attempt to break into accounts, stores or the service, or to get around its limits or reviews.
- No automated scraping, no overloading, no reselling of accounts.
- No phishing, malware or links to them.

## What we do

When a store or an account breaks this policy, we may ask questions, remove content, restrict or suspend the store, or close the account. Serious cases may be reported to the authorities. Anyone can report a store with the "Report this store" link at the bottom of its pages.`;

const AUP_FR = `# Politique d'usage acceptable

Cette politique dit ce que les boutiques et les utilisateurs n'ont pas le droit de faire sur Store Gen. Elle fait partie des Conditions d'utilisation.

## Produits interdits à la vente

- Tout ce qui est illégal là où vous vendez ou là où vous livrez.
- Les contrefaçons, ou les produits qui reprennent le nom ou le logo d'une marque sans son autorisation.
- Les armes, les drogues, les médicaments vendus sans l'autorisation requise, et les autres produits dangereux.
- Les biens volés.

## Vendre honnêtement

- Aucun prix, remise, note, avis, niveau de stock ou compte à rebours inventé.
- Aucune promesse de santé, de revenu ou de résultat que vous ne pouvez pas prouver.
- Aucune page qui se fait passer pour une autre entreprise, une banque, une administration ou une société de livraison.
- Dites clairement ce que l'acheteur reçoit, le prix et le fonctionnement de la livraison.

## Les données des acheteurs

- Ne recueillez que ce dont une commande a besoin, et utilisez-le uniquement pour cette commande et son service après-vente.
- Pas de spam, et aucune vente ni transmission des données des acheteurs à d'autres.

## Le service lui-même

- Aucune tentative d'entrer dans des comptes, des boutiques ou le service, ni de contourner ses limites ou ses examens.
- Pas d'aspiration automatisée, pas de surcharge, pas de revente de comptes.
- Pas d'hameçonnage, de logiciel malveillant ni de lien vers eux.

## Ce que nous faisons

Quand une boutique ou un compte enfreint cette politique, nous pouvons poser des questions, retirer du contenu, restreindre ou suspendre la boutique, ou fermer le compte. Les cas graves peuvent être signalés aux autorités. Chacun peut signaler une boutique avec le lien « Signaler cette boutique » en bas de ses pages.`;

const AUP_AR = `# سياسة الاستخدام المقبول

توضح هذه السياسة ما لا يحق للمتاجر والمستخدمين فعله على Store Gen. وهي جزء من شروط الاستخدام.

## منتجات يُمنع بيعها

- كل ما هو غير قانوني حيث تبيع أو حيث تسلّم.
- المنتجات المقلدة، أو التي تستعمل اسم علامة تجارية أو شعارها دون إذنها.
- الأسلحة والمخدرات والأدوية المباعة دون الترخيص اللازم، وغيرها من المنتجات الخطرة.
- البضائع المسروقة.

## البيع بنزاهة

- لا أسعار ولا تخفيضات ولا تقييمات ولا آراء ولا كميات مخزون ولا عدادات تنازلية مختلقة.
- لا ادعاءات صحية أو مالية أو وعود بنتائج لا يمكنك إثباتها.
- لا صفحات تنتحل صفة شركة أخرى أو بنك أو إدارة أو شركة توصيل.
- وضّح للمشتري ما سيحصل عليه والسعر وطريقة التوصيل.

## بيانات المشترين

- اجمع فقط ما يحتاجه الطلب، واستعمله فقط لهذا الطلب وخدمة ما بعد البيع.
- لا رسائل مزعجة، ولا بيع لبيانات المشترين ولا مشاركتها مع الغير.

## الخدمة نفسها

- لا محاولة لاختراق الحسابات أو المتاجر أو الخدمة، ولا للتحايل على حدودها أو مراجعاتها.
- لا جمع آلي للبيانات، ولا إثقال للخدمة، ولا إعادة بيع للحسابات.
- لا تصيّد احتيالي ولا برمجيات خبيثة ولا روابط إليها.

## ما نقوم به

عندما يخالف متجر أو حساب هذه السياسة، يمكننا طرح أسئلة أو إزالة محتوى أو تقييد المتجر أو تعليقه أو إغلاق الحساب. وقد يتم إبلاغ السلطات بالحالات الخطيرة. يمكن لأي شخص الإبلاغ عن متجر عبر رابط "الإبلاغ عن هذا المتجر" في أسفل صفحاته.`;

export const PLATFORM_LEGAL: readonly LegalSeedDoc[] = [
  { kind: "tos", locale: "en", title: "Terms of service", body: TOS_EN, summary: null },
  { kind: "tos", locale: "fr", title: "Conditions d'utilisation", body: TOS_FR, summary: null },
  { kind: "tos", locale: "ar", title: "شروط الاستخدام", body: TOS_AR, summary: null },
  { kind: "privacy", locale: "en", title: "Privacy policy", body: PRIVACY_EN, summary: null },
  { kind: "privacy", locale: "fr", title: "Politique de confidentialité", body: PRIVACY_FR, summary: null },
  { kind: "privacy", locale: "ar", title: "سياسة الخصوصية", body: PRIVACY_AR, summary: null },
  { kind: "aup", locale: "en", title: "Acceptable use policy", body: AUP_EN, summary: null },
  { kind: "aup", locale: "fr", title: "Politique d'usage acceptable", body: AUP_FR, summary: null },
  { kind: "aup", locale: "ar", title: "سياسة الاستخدام المقبول", body: AUP_AR, summary: null },
];
