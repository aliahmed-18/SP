// Shared moderation: runs in the browser for instant feedback, but the server is authoritative.
//
// How the word filter works (in order):
//   1. Normalise: NFKC, lower case, strip Latin accents, map Greek look-alikes to Latin,
//      fold Arabic letter variants (أ/إ/آ → ا, ة → ه, ى/ی → ي, گ/ک → ك, ڤ → ف…), drop harakat/tatweel.
//   2. Build variants of each token: letters only, leetspeak decoded (f4ck, sh!t), repeated
//      letters collapsed (fuuuck, شررموطه), and Arabizi kept with its digits (kos, 9a7ba, 3ars).
//   3. Match: whole words, Arabic words with common prefixes (ال، و، يا، ب…), English roots inside
//      longer words (motherfucking), masked words (f*ck, sh#t), spaced letters (f u c k, ش ر م و ط),
//      words split in two (shi t, شر موطه), insult phrases, and "you/يا + insult" (يا حمار, you idiot).
//   4. An allow-list protects ordinary words (Scunthorpe, class, assessment, كسوف, زبون, شاذ…).
// Ordinary academic vocabulary (sex, rape, penis, حكم اللواط, الأجسام الساقطة…) is deliberately NOT
// blocked: a lecture question about those topics is legitimate. Insults that need context are left to
// the AI pass that runs when the instructor classifies, and to the instructor's Remove button.

export const MAX_QUESTION_LENGTH = 300;

export type ModerationResult =
  | { ok: true; text: string }
  | { ok: false; reason: "empty" | "too_long" | "blocked" };

/** NFC normalize, trim, collapse whitespace. */
export function cleanText(input: string): string {
  return input.normalize("NFC").replace(/\s+/gu, " ").trim();
}

// Emoji and emoji building blocks: pictographs, ZWJ, variation selector-16, regional indicators, keycap.
const EMOJI_RE = /\p{Extended_Pictographic}|‍|️|\p{Regional_Indicator}|⃣/u;

const ALLOWED_SYMBOLS = "+-*/%=<>!&|^~_\\$@#:;,.?'\"()[]{}`" + "√∑∫∞≤≥≠≈π±×÷°²³∆∂→←" + "،؛؟«»…–—";
const escapeForClass = (s: string) => s.replace(/[\\\]\[^-]/g, "\\$&");
// Latin, Arabic (incl. Arabic-Indic digits and harakat), Greek, any decimal digit, whitespace, combining marks, allowed symbols.
const ALLOWED_RE = new RegExp(
  `^[\\p{Script=Latin}\\p{Script=Arabic}\\p{Script=Greek}\\p{Nd}\\p{Mn}\\s${escapeForClass(ALLOWED_SYMBOLS)}]*$`,
  "u",
);

export function passesCharacterRules(text: string): boolean {
  if (EMOJI_RE.test(text)) return false;
  return ALLOWED_RE.test(text);
}

// --- Word lists ------------------------------------------------------------------
// Kept as data so they are easy to extend. Lists are matched after normalisation, so one spelling
// per word is enough for letter variants (أ/ا, ة/ه, ى/ي) and for doubled letters.

/** English: blocked anywhere inside a word (motherfucking, bullshit, dumbbitch). */
const EN_ROOTS = ["fuck", "shit", "bitch", "asshole", "faggot", "whore", "slut", "pussy", "dickhead", "cocksuck", "blowjob", "handjob"];
/** English: blocked only as a whole word (these letters appear inside innocent words). */
const EN_WHOLE = [
  "fck", "fuk", "fuks", "fuq", "fux", "fvck", "phuck", "phuk", "fking", "fkin", "fcking", "fckin", "effing", "mofo",
  "sht", "shyt", "btch", "biatch", "beyotch", "ass", "arse", "asses", "arsehole", "asshat", "asswipe", "assclown", "dumbass", "jackass", "smartass", "badass",
  "dick", "dicks", "cunt", "cunts", "twat", "twats", "bastard", "bastards", "wank", "wanker", "wankers", "wanking", "bollocks",
  "tits", "titties", "boobs", "boobies", "dildo", "horny", "sexy", "nudes", "porno", "pornhub", "xvideos", "xnxx", "onlyfans", "milf",
  "nigger", "niggers", "nigga", "niggas", "fag", "fags", "tranny", "spic", "kike", "wetback",
  "wtf", "stfu", "gtfo", "kys",
];
/** English multi-word phrases. */
const EN_PHRASES = ["kill yourself", "kill urself", "kill your self", "suck my", "suck it", "son of a bitch", "jerk off", "piece of shit"];
/** "you <insult>", "ur <insult>", "you're <insult>" … */
const EN_YOU = ["you", "u", "ur", "youre", "ya"];
const EN_INSULTS = ["idiot", "idiots", "moron", "morons", "stupid", "dumb", "loser", "losers", "clown", "pig", "pigs", "donkey", "trash", "garbage", "imbecile", "freak", "scum", "suck", "sucks", "retard", "retarded"];

/** Arabizi / Franco-Arabic, written with Latin letters and digits. Whole words. */
const ARABIZI_WHOLE = [
  "kos", "koss", "kus", "kuss", "kosomak", "kosommak", "kosomk", "ksomk", "ksmk", "kusumak", "kosokhtak",
  "zeb", "zebi", "zebbi", "zib", "zibi", "zobr", "zbr",
  "sharmoota", "sharmota", "sharmouta", "sharmoot", "sharmut", "sharmuta", "sharmoto", "sharmo6a", "sharmoo6a", "sharmo6",
  "manyak", "manyok", "manyook", "manyouk", "mnyok", "mnyook", "metnak", "metnaka", "mitnak", "mitnaka",
  "gahba", "gahbah", "ga7ba", "qa7ba", "qahba", "kahba", "ka7ba", "8a7ba", "9a7ba", "g7ba", "q7ba",
  "teez", "teezak", "tezak", "6eez", "6ez", "6eezak", "6yz",
  "3ars", "3rs", "a3ras", "m3ars", "m3rs", "m3ras",
  "khara", "5ara", "5ra", "5raa", "5ra2", "khra",
  "neek", "neik", "aneek", "anik", "aneekak", "anikak", "tneek", "yneek", "nayek", "nayk", "neeki",
  "dayooth", "dayoos", "dyoos", "dyooth", "gawad", "gwad", "qawad", "9wad",
  "5awal", "khawal", "5wal",
];
const ARABIZI_PHRASES = ["kos omak", "kos ommak", "kos omk", "kos okhtak", "kos ukhtak", "ibn el kalb", "ibn al kalb", "ebn el kalb", "ibn kalb", "ibn el sharmoota", "yel3an abook", "yil3an abook", "yl3n abok", "yel3an omak", "yil3an omak"];
const ARABIZI_YA = ["ya", "yaa"];
const ARABIZI_INSULTS = ["7mar", "hmar", "7imar", "himar", "kalb", "chalb", "7ayawan", "hayawan", "ghabi", "3'abi", "8abi", "ghby", "7a8eer", "haqeer", "7aqeer", "tafeh", "zbala", "zibala", "wase5", "wasikh", "khanzeer", "5anzeer", "ba8ra", "ba2ra", "jahsh", "ja7sh", "mutee", "mtee", "zg", "zig", "zag", "tafih"];

/**
 * Arabic: whole words; common prefixes (ال، و، يا، ب، ف، ل، وال، بال، يال) are also checked.
 * Forms are listed explicitly instead of stripping suffixes, because generic suffix stripping
 * turns ordinary words into matches (زب + ون = زبون "customer", عرص + ات = عرصات "courtyards").
 */
const AR_WHOLE = [
  // Sexual / genital
  "كس", "كسك", "كسها", "كسمك", "كسامك", "كسختك", "كسخالتك", "كسعرضك", "كسين",
  "زب", "زبي", "زبك", "زبه", "زبري", "زبرك", "ازبار",
  "طيز", "طيزك", "طيزي", "طيزه", "طيزها", "طياز",
  "عيري", "عيرك", "بزازك", "بزازها",
  "نيك", "نيكه", "انيك", "انيكك", "انيكها", "انيكم", "ينيك", "ينيكك", "تنيك", "نياك", "نياكه", "منيوك", "منيوكه", "منيك", "منيكه", "منايك", "متناك", "متناكه", "متناكين", "اتناك", "انتاك",
  "سكس", "سكسي",
  // Prostitution / sexual insults
  "شرموط", "شرموطه", "شراميط", "شرموطي", "قحبه", "قحاب", "قحبتك", "كحبه", "كحاب", "عاهره", "عواهر", "داعره", "داعر",
  "عرص", "عرصه", "معرص", "معرصين", "عرصنه", "قوادين", "ديوث", "ديوس", "دياييث", "خولات", "منيوج",
  // Excrement / filth used as insults
  "خرا", "خره", "خرى", "خري", "زق", "زقك",
  // Curses
  "يلعنك", "يلعنكم",
];
const AR_PHRASES = [
  "كس امك", "كس اختك", "كس خالتك", "كس عرضك", "كس ام", "كس اخت",
  "ابن الكلب", "ابن كلب", "بنت الكلب", "بنت كلب", "ولد الكلب", "ابن الشرموطه", "ابن القحبه", "ابن الحرام", "ولد الحرام", "ابن العاهره", "ابن المتناكه",
  "يلعن ابوك", "يلعن امك", "يلعن اختك", "يلعن دينك", "يلعن ابو", "يلعن شكلك", "يلعن والديك", "الله يلعنك", "انعل ابوك", "انعل والديك", "نعال ابوك",
  "مص زبي", "تمص زبي", "روح انتاك", "روح انقلع يا",
];
/** Insults blocked only when addressed: "يا حمار", "ياحمار", "يا ابن …". Alone they are ordinary words (حمار = donkey). */
const AR_YA = ["يا", "ي", "ياا"];
const AR_INSULTS = [
  "حمار", "حماره", "حمير", "كلب", "كلبه", "كلاب", "حيوان", "حيوانه", "حيوانات", "غبي", "غبيه", "اغبياء", "حقير", "حقيره", "حقيرين",
  "تافه", "تافهه", "تافهين", "زباله", "وسخ", "وسخه", "وصخ", "وصخه", "خنزير", "خنزيره", "خنازير", "بهيمه", "بهايم", "ثور", "جحش", "بقره",
  "اهبل", "هبله", "ابله", "قذر", "قذره", "مطي", "مطيه", "سخيف", "سخيفه", "نذل", "نذله", "واطي", "واطيه", "سافل", "سافله", "منحط", "منحطه",
  "متخلف", "متخلفه", "متخلفين", "معاق", "لوطي", "مخنث", "خول", "قواد", "زفت", "خايس", "خايسه", "داشر", "داشره", "تيس", "جزمه",
];
const AR_PREFIXES = ["", "ال", "و", "وال", "يا", "ب", "بال", "ل", "لل", "يال", "ك"];
/** Short words take fewer prefixes: ب + نيك = بنيك ("your sons"), و + كس = وكس (classical word). */
const AR_SHORT_PREFIXES: Record<number, string[]> = { 2: ["", "ال", "يا", "يال"], 3: ["", "ال", "يا", "يال", "وال"] };

/** Innocent words that would otherwise trip a root or a letter join. */
const ALLOW = new Set([
  "scunthorpe", "shitake", "shiitake", "mishit", "mishits", "shittim", "shittah", "pussyfoot", "pussyfooting", "pussycat", "pussywillow", "slutsky",
  "cockpit", "cocktail", "peacock", "hancock", "dickens", "dickinson", "assessment", "assignment", "assistant", "assume", "class", "classic", "classical", "bass", "pass", "passage",
  "therapist", "grape", "drape", "documents", "analysis",
]);

// --- Normalisation ---------------------------------------------------------------

const GREEK_TO_LATIN: Record<string, string> = {
  α: "a", β: "b", ε: "e", η: "n", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", ω: "w", ς: "c", σ: "o", μ: "u",
};
const ARABIC_VARIANTS: Record<string, string> = {
  أ: "ا", إ: "ا", آ: "ا", ٱ: "ا", ة: "ه", ۃ: "ه", ى: "ي", ی: "ي", ې: "ي", ئ: "ي", ؤ: "و", ک: "ك", ڪ: "ك", گ: "ك", ڤ: "ف", ڨ: "ق", پ: "ب", چ: "ج", ژ: "ز", ء: "",
};

/** Lowercase + Arabic folding (diacritics, tatweel, alef forms, taa marbuta, alef maqsura, Persian/Gulf letters). */
export function foldForMatching(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/(\p{Script=Latin})\p{Mn}+/gu, "$1") // é → e, ü → u
    .normalize("NFC")
    .replace(/[ً-ٰٟۖ-ۭ]/g, "") // harakat and Quranic marks
    .replace(/ـ/g, "") // tatweel
    .replace(/[أإآٱةۃىیېئؤکڪگڤڨپچژء]/g, (c) => ARABIC_VARIANTS[c] ?? c)
    .replace(/[αβεηικνορτυχωςσμ]/g, (c) => GREEK_TO_LATIN[c] ?? c);
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s", "!": "i", "|": "i", "€": "e" };
const lettersOnly = (s: string) => s.replace(/[^\p{L}]/gu, "");
const alnumOnly = (s: string) => s.replace(/[^\p{L}\p{Nd}]/gu, "");
const deLeet = (s: string) => s.replace(/[0134578@$!|€]/g, (c) => LEET[c] ?? c);
/** fuuuuck → fuck, شرررموطه → شرموطه */
const collapse = (s: string) => s.replace(/(\p{L})\1+/gu, "$1");
/** asss → ass (keeps real doubles) */
const collapseTo2 = (s: string) => s.replace(/(\p{L})\1{2,}/gu, "$1$1");

const fold = (w: string) => foldForMatching(w);
const EN_ROOT_LIST = EN_ROOTS.map(fold);
const EN_SET = new Set([...EN_WHOLE, ...EN_ROOTS].map(fold));
const ARABIZI_SET = new Set(ARABIZI_WHOLE.map(fold));
const AR_SET = new Set(AR_WHOLE.map(fold));
const AR_INSULT_SET = new Set(AR_INSULTS.map(fold));
const AR_YA_SET = new Set(AR_YA.map(fold));
const EN_INSULT_SET = new Set([...EN_INSULTS, ...ARABIZI_INSULTS].map(fold));
const EN_YOU_SET = new Set([...EN_YOU, ...ARABIZI_YA]);
const PHRASES = [...EN_PHRASES, ...ARABIZI_PHRASES, ...AR_PHRASES].map((p) => fold(p).split(" ").filter(Boolean));
/** Words long enough to check when split in two ("shi t", "شر موطه"). */
const JOINABLE = new Set([...[...EN_SET].filter((w) => w.length >= 4), ...[...AR_SET].filter((w) => w.length >= 5)]);
const ALLOW_FOLDED = new Set([...ALLOW].map(fold));

const isArabic = (s: string) => /\p{Script=Arabic}/u.test(s);

function variants(token: string): Set<string> {
  const out = new Set<string>();
  for (const base of [lettersOnly(token), lettersOnly(deLeet(token)), alnumOnly(token)]) {
    if (!base) continue;
    out.add(base);
    out.add(collapse(base));
    out.add(collapseTo2(base));
  }
  return out;
}

function arabicMatch(v: string, set: Set<string>): boolean {
  for (const p of AR_PREFIXES) {
    if (!v.startsWith(p)) continue;
    const rest = v.slice(p.length);
    if (!set.has(rest)) continue;
    const allowed = AR_SHORT_PREFIXES[rest.length];
    if (allowed && !allowed.includes(p)) continue;
    return true;
  }
  return false;
}

function isBadWord(v: string): boolean {
  if (!v || ALLOW_FOLDED.has(v)) return false;
  if (EN_SET.has(v) || ARABIZI_SET.has(v)) return true;
  if (isArabic(v)) return arabicMatch(v, AR_SET);
  return EN_ROOT_LIST.some((r) => v.includes(r));
}

function isBadToken(token: string): boolean {
  if (!token) return false;
  for (const v of variants(token)) if (isBadWord(v)) return true;
  return maskedMatch(token);
}

/** f*ck, sh#t, b_tch, f**king: a masking character stands for a hidden letter. */
const MASKABLE = [...EN_SET].filter((w) => w.length >= 4).map((w) => ({
  // Anchored at the start so "hash#tag" does not hide "sh#t"; roots may carry a suffix (f**king).
  re: new RegExp(`^${[...w].map((c) => `[${c}*#_]`).join("")}${EN_ROOT_LIST.includes(w) ? "" : "$"}`, "u"),
}));
function maskedMatch(token: string): boolean {
  if (!/[*#_]/.test(token) || !/\p{L}/u.test(token)) return false;
  const core = deLeet(token).replace(/[^\p{L}*#_]/gu, "");
  if (!/[*#_]/.test(core) || core.replace(/[*#_]/g, "").length < 2) return false;
  return MASKABLE.some(({ re }) => re.test(core));
}

function isAddressedInsult(word: string, next: string | undefined): boolean {
  // Separate words: "يا حمار", "you idiot", "ya 7mar"
  if (next !== undefined) {
    const nv = [...variants(next)];
    if (AR_YA_SET.has(word) && nv.some((v) => AR_INSULT_SET.has(v))) return true;
    if (EN_YOU_SET.has(word) && nv.some((v) => EN_INSULT_SET.has(v) && !ALLOW_FOLDED.has(v))) return true;
  }
  // Joined: "ياحمار"
  for (const v of variants(word)) {
    for (const ya of AR_YA_SET) if (ya.length > 1 && v.startsWith(ya) && AR_INSULT_SET.has(v.slice(ya.length))) return true;
  }
  return false;
}

export function containsRestrictedWord(text: string): boolean {
  const folded = foldForMatching(text);
  // Tokens split on anything that is not a letter, digit or masking/leet symbol.
  const words = folded.split(/[^\p{L}\p{Nd}@$*#_!|]+/u).filter(Boolean);
  // Whitespace tokens keep in-word punctuation together (f.u.c.k → fuck).
  const chunks = folded.split(/\s+/u).filter(Boolean);
  const plainWords = words.map((w) => alnumOnly(w)).filter(Boolean);

  // Phrases (on letter/digit words, so "ابن،الكلب" and "kos-omak" still match).
  const joined = ` ${plainWords.join(" ")} `;
  const joinedLeet = ` ${plainWords.map((w) => lettersOnly(deLeet(w)) || w).join(" ")} `;
  for (const p of PHRASES) {
    const needle = ` ${p.join(" ")} `;
    if (joined.includes(needle) || joinedLeet.includes(needle)) return true;
  }

  if (chunks.some(isBadToken) || words.some(isBadToken)) return true;

  for (let i = 0; i < plainWords.length; i++) {
    if (isAddressedInsult(plainWords[i]!, plainWords[i + 1])) return true;
    // Words split in two: "shi t", "شر موطه".
    const next = plainWords[i + 1];
    if (next && lettersOnly(plainWords[i]!).length >= 2 && lettersOnly(next).length >= 2) {
      for (const v of variants(plainWords[i]! + next)) if (JOINABLE.has(v)) return true;
    }
  }

  // Spaced-out letters: "f u c k", "ش ر م و ط ه" → join runs of single-letter tokens.
  let run = "";
  for (const t of [...plainWords, "  "]) {
    const l = lettersOnly(deLeet(t));
    if (l.length === 1) {
      run += l;
    } else {
      if (run.length >= 3 && isBadToken(run)) return true;
      run = "";
    }
  }
  return false;
}

export function moderateQuestion(input: string): ModerationResult {
  const text = cleanText(input);
  if (!text) return { ok: false, reason: "empty" };
  if ([...text].length > MAX_QUESTION_LENGTH) return { ok: false, reason: "too_long" };
  if (!passesCharacterRules(text)) return { ok: false, reason: "blocked" };
  if (containsRestrictedWord(text)) return { ok: false, reason: "blocked" };
  return { ok: true, text };
}
