import { describe, it, expect } from "vitest";
import { moderateQuestion } from "./moderation";

const ok = (s: string) => expect(moderateQuestion(s).ok).toBe(true);
const blocked = (s: string) => expect(moderateQuestion(s)).toEqual({ ok: false, reason: "blocked" });

describe("moderation", () => {
  it("allows Arabic, English, code and math", () => {
    ok("ما الفرق بين الذاكرة المؤقتة والدائمة؟");
    ok("Why does for (let i = 0; i < n; i++) { sum += a[i]; } run in O(n)?");
    ok("هل √x ≤ x² دائماً؟ وما معنى ∑ و ∫ و π ± ∞");
    ok("Is the class assessment graded? what about Scunthorpe or classic passes");
    ok("الرقم ٣٤٥ في المعادلة a → b");
  });
  it("collapses whitespace", () => {
    expect(moderateQuestion("  a   b \n c ")).toEqual({ ok: true, text: "a b c" });
    expect(moderateQuestion("cafe\u0301")).toEqual({ ok: true, text: "café" });
  });
  it("blocks emoji", () => {
    blocked("great lecture 👍");
    blocked("❤️");
    blocked("1️⃣ first");
    blocked("🇧🇭");
    blocked("a\u200Db");
    blocked("x\uFE0F");
    blocked("1\u20E3");
  });
  it("blocks restricted words incl. obfuscation", () => {
    blocked("this is shit");
    blocked("f.u.c.k this");
    blocked("f u c k");
    blocked("a$$hole");
    blocked("يا شرمــوطة");
    blocked("shit,why");
    blocked("f . u . c . k");
    blocked("ش ر م و ط ة");
    blocked("قَحْبَة");
    blocked("ابن،الكلب");
  });
  it("does not match restricted substrings in ordinary words", () => {
    ok("class assessment assistant assignment classical passage");
    ok("كسوف الشمس وتقييم المحاضرة");
    ok("obj.class[0] + assessment.total");
  });
  it("rejects empty and too long", () => {
    expect(moderateQuestion("   ")).toEqual({ ok: false, reason: "empty" });
    expect(moderateQuestion("a".repeat(301))).toEqual({ ok: false, reason: "too_long" });
    ok("a".repeat(300));
    ok("𐞀".repeat(300));
  });
});

describe("moderation: stronger word filter", () => {
  it("blocks English profanity, variants and obfuscation", () => {
    for (const s of [
      "motherfucking lecture", "FUCKING hard", "fuuuuuck this", "f*ck", "f**king slides", "sh#t", "b_tch", "sh!t", "5h1t",
      "bullshit question", "you are a dumbass", "dumb ass", "fu ck", "phuck", "wtf is this", "stfu", "kys",
      "this is f-u-c-k-e-d", "fück", "fυck", "ASSHOLE", "son of a bitch", "kill yourself", "piece of shit",
      "nigga", "faggot", "send nudes", "pornhub", "you idiot", "u suck", "you moron", "ur retarded",
    ]) blocked(s);
  });
  it("blocks Arabic profanity incl. dialects, letter variants and spacing", () => {
    for (const s of [
      "كسمك", "كس امك", "كس أمك يا دكتور", "يا ابن الكلب", "ابن كلب", "شرموطة", "يا شرموطه", "الشراميط", "شررررموطة",
      "قحبة", "گحبة", "كحبة", "منيوك", "متناك", "عرص", "معرص", "زبي", "طيزك", "ديوث", "خرا عليك",
      "يلعن ابوك", "الله يلعنك", "يا حمار", "ياحمار", "يا كلب", "يا غبي", "يا حيوان", "يا خنزير", "ي حمار", "يا مطي", "يا زق",
      "شر موطة", "ق ح ب ة", "شـرمـوطـة", "انيكك", "سكس",
    ]) blocked(s);
  });
  it("blocks Arabizi (Franco-Arabic)", () => {
    for (const s of ["kos omak", "kosomak", "ya 7mar", "ya kalb", "sharmoota", "ga7ba", "manyok", "3ars", "ibn el kalb", "zebi", "ya ghabi"]) blocked(s);
  });
  it("lets ordinary academic questions through (English)", () => {
    for (const s of [
      "What is the assessment weighting for the class assignment?", "Can you explain the Slutsky equation?",
      "Is a FK the same as a primary key?", "Why is the retarded potential used in electrodynamics?",
      "How does the cocktail party effect work?", "Is Scunthorpe in England?", "What is a shiitake mushroom made of?",
      "Explain sex-linked inheritance", "How do we prevent rape in conflict zones?", "Is the penis part of the urinary system?",
      "What is the hit rate of the cache? it's hit or miss", "Does s_t mean the state at time t?", "Is x_1 * y_2 allowed?", "what is a hash#tag", "C# vs Java", "my_list.append(x)", "__init__ method", "a*b*c = 12",
      "Why does your garbage collector pause?", "What does Dickens say about class?", "Is it a chink in the armour?",
      "magna cum laude requirements", "flame retardant materials", "What's the difference between pass and bass?",
      "Is this question stupid? I feel dumb", "e.g. a.s. convergence", "Can u explain this again", "you mean the dog example?",
    ]) ok(s);
  });
  it("lets ordinary academic questions through (Arabic)", () => {
    for (const s of [
      "ما الفرق بين كسر العدد وكسوف الشمس؟", "كيف نتعامل مع الزبون في التسويق؟", "ما هو المكوك الفضائي؟",
      "من هم قواد الجيش في معركة اليرموك؟", "هل خوّل الدستور البرلمان هذا الحق؟", "ما حكم اللواط في الفقه؟",
      "كيف نحسب سرعة الأجسام الساقطة؟", "ما معنى القيم الشاذة في الإحصاء؟", "شرح حديث وللعاهر الحجر",
      "هل الحمار من الثدييات؟", "ما الفرق بين الكلب والذئب؟", "كتب فخرا بإنجازه", "ما سبب فخره بالنتيجة؟",
      "هل يمكن أن تكون لدى بنيك نفس الصفات الوراثية؟", "ما هي عرصات القيامة؟", "شو يعني نيكل في الكيمياء؟ النيكل عنصر",
      "هل الخيار الأول صحيح يا دكتور؟", "انا غبي في الرياضيات، كيف أتحسن؟", "ما هي النكتة في هذا المثال؟",
      "إذا كانت س = ٣ و ص = ٤ فما قيمة ك؟", "Max Born و بورن في الفيزياء",
    ]) ok(s);
  });
});
