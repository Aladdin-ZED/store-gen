/**
 * Admin messages (ar) of the design file (P6 DESIGN, design.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/ar.ts;
 * a partial of ../en/design.ts (a missing key falls back to English).
 */
import type { messages as en } from "../en/design";

export const messages: Partial<Record<keyof typeof en, string>> = {
  "design.reveal.use": "استعمل هذا التصميم",
  "design.reveal.analysing": "نقرأ صورك",
  "design.reveal.error": "تعذّر تجهيز التصاميم.",
  "design.reveal.retry": "حاول مرة أخرى",
  "design.copy.C01": "عوّض الشرطات الطويلة بنقطة أو فاصلة أو نقطتين.",
  "design.copy.C02": "«{phrase}» عبارة عامة. قل شيئا محددا عن منتجك.",
  "design.copy.C03": "عدة عناوين مبنية بنفس الطريقة. غيّر واحدا منها: جملة بسيطة، أو طلب مباشر، أو كلمة قصيرة بعدها سطر.",
  "design.copy.C04": "قليل من الجمل يذكر تفصيلا حقيقيا عن المنتج. أضف المادة أو المقاس أو الرائحة أو طريقة التوصيل والدفع.",
  "design.copy.C05": "خلّي علامة تعجب واحدة على الأكثر، في الزر الأخير.",
  "design.copy.C06": "هذا العنوان يكرر صياغة من صفحة أخرى عندك.",
  "design.copy.C07": "استعمل النقطة الوسطى مرة واحدة في السطر على الأكثر، وأبدا في العنوان.",
  "design.copy.C08": "هذا العنوان قريب من صياغة منشورة في متجر آخر.",
  "design.copy.C09": "احذف الإيموجي: الصفحة متجر، ماشي رسالة.",
  "design.copy.D1": "بعض الأرقام في الصفحة ليست من المعلومات التي أعطيتها. راجعها قبل النشر.",
  "design.copy.D3": "هذا السؤال وجوابه مكتوبان بأسلوبين مختلفين. استعمل نفس الأسلوب للاثنين.",
  "design.copy.D4": "أداة التعريف قبل اسم المنتج غير مناسبة. اختر «le» أو «la» للاسم، أو أعد الصياغة.",
  "design.copy.N05": "هذه الصياغة منتشرة في مجالك. أعد كتابتها بكلماتك باش تتميز.",
  "design.copy.fixPunctuation": "صحّح علامات الترقيم",
};
