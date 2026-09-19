/**
 * The interface in English and Arabic.
 *
 * Only the interface. Quran text is never translated or touched here -- it
 * comes from the data files in every locale, drawn in the mushaf fonts.
 *
 * Imported by both server and client components, so it holds no Node APIs.
 * Client components are handed the locale, never the dictionary: several
 * entries are functions, and functions cannot cross the server/client line.
 *
 * The Arabic copy keeps the same register as the English: plain, warm, and
 * never about falling short. Hifz vocabulary is used where it is the natural
 * word -- "سمِّعها" for reciting from memory to be checked.
 */

export type Locale = 'en' | 'ar';

export const LOCALE_COOKIE = 'locale';

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ar';
}

const arabicNumber = new Intl.NumberFormat('ar-EG');
const englishNumber = new Intl.NumberFormat('en-US');

/** Arabic-Indic figures in Arabic, Latin in English. */
export function num(value: number, locale: Locale): string {
  return (locale === 'ar' ? arabicNumber : englishNumber).format(value);
}

export function percent(fraction: number, locale: Locale): string {
  const whole = Math.round(fraction * 100);
  return locale === 'ar' ? `${num(whole, locale)}٪` : `${whole}%`;
}

/** Arabic counts agree with the number: آية واحدة، آيتان، ٣ آيات، ١١ آية. */
function ayatAr(n: number): string {
  if (n === 1) return 'آية واحدة';
  if (n === 2) return 'آيتان';
  if (n >= 3 && n <= 10) return `${num(n, 'ar')} آيات`;
  return `${num(n, 'ar')} آية`;
}

const en = {
  dir: 'ltr' as 'ltr' | 'rtl',
  brand: 'Ayah Arena',
  switchTo: { locale: 'ar' as Locale, label: 'العربية' },

  home: {
    headline: 'Someone recites.',
    headlineTurn: 'You continue.',
    intro: (total: number) =>
      `One ayah appears. Give the next one — typed, or recited out loud. All ${num(total, 'en')} ayat are loaded, so any juz or any surah is a round.`,
    heroCaption: 'Ayah 2 goes on the empty line. That is the whole game.',
    setUp: 'Set up a round',
    whatToPractise: 'What to practise',
    howMany: 'How many ayat',
    roundOption: (n: number) => `${n} ayat`,
    howManyHint: 'Short surahs hold fewer — you will get as many as your choice has.',
    howYouAnswer: 'How you answer',
    typeIt: 'Type it',
    typeItHint: 'Needs an Arabic keyboard. Graded word by word.',
    reciteIt: 'Recite it',
    reciteItHint: 'Say it out loud, reveal, and mark how it went.',
    start: 'Start a round',
    whereYouAre: 'Where you are',
    ayatPractised: 'ayat practised',
    roundsFinished: 'rounds finished',
    averageRecall: 'average recall',
    totalsOnly: 'Totals only — no streaks to break, and nothing here resets if you take a week off.',
    pickUp: 'Pick up where you like',
  },

  picker: {
    byJuz: 'By juz',
    bySurah: 'By surah',
    find: 'Find by name or number',
    fromEnd: 'Start from An-Nas',
    noMatch: 'No surah goes by that name. Try part of it, or its number.',
    juzTitle: (n: number) => `Juz ${n}`,
    sameSurahSpan: (surah: string, from: number, to: number) => `${surah} ${from}–${to}`,
    crossSurahSpan: (fromSurah: string, from: number, toSurah: string, to: number) =>
      `${fromSurah} ${from} to ${toSurah} ${to}`,
    juzDetail: (span: string, askable: number) => `${span} · ${askable} ayat can be asked`,
    surahDetail: (meaning: string, total: number, askable: number) =>
      `${meaning} · ${total} ayat, ${askable} can be asked`,
  },

  scope: {
    juz: (n: number) => `Juz ${n}`,
    surah: (nameSimple: string) => nameSimple,
  },

  locative: (surahName: string, ayah: number) => `${surahName} · ayah ${ayah}`,

  drill: {
    typed: 'typed',
    recited: 'recited',
    leave: 'Leave the round',
    leaveNote: 'Leaving keeps everything you have answered so far. There is no penalty for stopping.',
    loading: 'Setting up your ayat',
    didNotStart: 'That round did not start',
    backToStart: 'Back to the start',
    couldNotStart: 'Could not start the round',
    couldNotSave: 'Could not save that attempt',
    couldNotReveal: 'Could not reveal that ayah',
    elapsed: (s: number) => `${s}s elapsed`,
    position: (i: number, total: number) => `${i} of ${total}`,
    progressLabel: (i: number, total: number) => `Ayah ${i} of ${total}`,
    writeLabel: (n: number) => `Write ayah ${n}`,
    latinHint: 'That is Latin script. Switch your keyboard to Arabic to be scored.',
    writeHint: (n: number) =>
      `Write ayah ${n} on the line. Harakat are optional, and spelling is graded gently.`,
    checking: 'Checking…',
    check: 'Check my answer',
    showMe: 'Show me this one',
    reciteHint: (n: number) => `Recite ayah ${n} out loud, then reveal it to see how it went.`,
    reveal: 'Reveal the ayah',
    howDidItGo: 'How did that go?',
    recalled: 'recalled',
    points: 'points',
    runningTotal: 'running total',
    next: 'Next ayah',
    finish: 'See how it went',
    verdict: {
      whole: 'Word for word.',
      held: "That's the ayah.",
      most: 'Most of it came back.',
      some: 'Some of it came back.',
      none: 'Here it is.',
    },
    selfGrades: {
      got_it: { label: 'Got it', hint: 'Recited it as written' },
      almost: { label: 'Almost', hint: 'A word or two off' },
      not_yet: { label: 'Not yet', hint: 'Worth another look' },
    },
    legend: { exact: 'came back', close: 'nearly', missed: 'look again' },
  },

  results: {
    closing: {
      none: 'A set read through. Nothing scored, nothing lost.',
      solid: 'That set is solid.',
      holding: 'Most of that set is holding.',
      coming: 'It is coming together.',
      early: 'Early days with this set — that is exactly what practice is for.',
    },
    points: 'points',
    averageRecall: 'average recall',
    ayat: 'ayat',
    time: 'time',
    duration: (m: number, s: number) => `${m > 0 ? `${m}m ` : ''}${s}s`,
    heldFirm: 'Held firm',
    worthAnotherLook: 'Worth another look',
    item: (surah: string, ayah: number) => `${surah} · ayah ${ayah}`,
    shown: 'shown',
    revisitNote:
      'These are the ones that took longest to surface, plus any you asked to be shown. Once revision mode lands they will come back around on their own.',
    another: 'Another round',
    change: 'Change the setup',
  },

  footer: {
    textHeading: 'the text',
    text: 'Quran text via Quran.com (Tanzil.net Uthmani edition), drawn in the King Fahd Complex mushaf fonts via QUL. Nothing here is generated or paraphrased, and the app offers no tajweed rulings, tafsir or religious advice.',
    dataHeading: 'your data',
    data: 'One anonymous cookie holds your progress, and another remembers your language. No location, no contacts, no tracking, no ads, and nothing sold or shared.',
    phoneHeading: 'on a shared phone',
    phone: 'The browser tab and home-screen name stay neutral — just “Arena”, with no icon or title that announces what you are practising.',
  },
};

export type Dictionary = typeof en;

const ar: Dictionary = {
  dir: 'rtl',
  brand: 'ساحة الآيات',
  switchTo: { locale: 'en', label: 'English' },

  home: {
    headline: 'يتلو أحدهم.',
    headlineTurn: 'فتُكمِل أنت.',
    intro: (total) =>
      `تظهر آية، فتأتي بالتي تليها — كتابةً أو تلاوةً بصوت مسموع. الآيات كلها هنا، ${num(total, 'ar')} آية، فأيّ جزء أو سورة يصلح جولة.`,
    heroCaption: 'مكان الآية الثانية هو السطر الفارغ. هذه هي اللعبة كلها.',
    setUp: 'جهّز جولة',
    whatToPractise: 'ماذا تراجع',
    howMany: 'كم آية',
    roundOption: (n) => ayatAr(n),
    howManyHint: 'السور القصيرة آياتها أقل — ستأتيك بقدر ما في اختيارك.',
    howYouAnswer: 'كيف تجيب',
    typeIt: 'اكتبها',
    typeItHint: 'تحتاج لوحة مفاتيح عربية. تُصحَّح كلمةً كلمة.',
    reciteIt: 'سمِّعها',
    reciteItHint: 'اتلُها بصوت مسموع، ثم اكشفها وقيّم كيف كانت.',
    start: 'ابدأ جولة',
    whereYouAre: 'أين وصلت',
    ayatPractised: 'آيات راجعتها',
    roundsFinished: 'جولات أتممتها',
    averageRecall: 'متوسط الاستحضار',
    totalsOnly: 'مجاميع فقط — لا سلسلة أيام تنقطع، ولا يُصفَّر شيء إن غبت أسبوعًا.',
    pickUp: 'تابع من حيث شئت',
  },

  picker: {
    byJuz: 'حسب الجزء',
    bySurah: 'حسب السورة',
    find: 'ابحث بالاسم أو الرقم',
    fromEnd: 'ابدأ من الناس',
    noMatch: 'لا سورة بهذا الاسم. جرّب جزءًا منه، أو رقمها.',
    juzTitle: (n) => `الجزء ${num(n, 'ar')}`,
    sameSurahSpan: (surah, from, to) => `${surah} ${num(from, 'ar')}–${num(to, 'ar')}`,
    crossSurahSpan: (fromSurah, from, toSurah, to) =>
      `من ${fromSurah} ${num(from, 'ar')} إلى ${toSurah} ${num(to, 'ar')}`,
    juzDetail: (span, askable) => `${span} · يمكن السؤال عن ${ayatAr(askable)}`,
    surahDetail: (_meaning, total, askable) =>
      `${ayatAr(total)}، يمكن السؤال عن ${num(askable, 'ar')} منها`,
  },

  scope: {
    juz: (n) => `الجزء ${num(n, 'ar')}`,
    // Callers pass the Arabic name in this locale.
    surah: (nameArabic) => `سورة ${nameArabic}`,
  },

  locative: (surahName, ayah) => `سورة ${surahName} · الآية ${num(ayah, 'ar')}`,

  drill: {
    typed: 'كتابةً',
    recited: 'تسميعًا',
    leave: 'اترك الجولة',
    leaveNote: 'المغادرة تحفظ كل ما أجبت عنه حتى الآن. لا عقوبة على التوقّف.',
    loading: 'نجهّز آياتك',
    didNotStart: 'لم تبدأ الجولة',
    backToStart: 'العودة إلى البداية',
    couldNotStart: 'تعذّر بدء الجولة',
    couldNotSave: 'تعذّر حفظ هذه المحاولة',
    couldNotReveal: 'تعذّر كشف الآية',
    elapsed: (s) => `${num(s, 'ar')} ث`,
    position: (i, total) => `${num(i, 'ar')} من ${num(total, 'ar')}`,
    progressLabel: (i, total) => `الآية ${num(i, 'ar')} من ${num(total, 'ar')}`,
    writeLabel: (n) => `اكتب الآية ${num(n, 'ar')}`,
    latinHint: 'هذه حروف لاتينية. بدّل لوحة المفاتيح إلى العربية لتُحتسب إجابتك.',
    writeHint: (n) =>
      `اكتب الآية ${num(n, 'ar')} على السطر. التشكيل اختياري، والإملاء يُصحَّح برفق.`,
    checking: 'جارٍ التصحيح…',
    check: 'صحّح إجابتي',
    showMe: 'أرني هذه الآية',
    reciteHint: (n) => `اتلُ الآية ${num(n, 'ar')} بصوت مسموع، ثم اكشفها لترى كيف كانت.`,
    reveal: 'اكشف الآية',
    howDidItGo: 'كيف كانت؟',
    recalled: 'الاستحضار',
    points: 'النقاط',
    runningTotal: 'المجموع حتى الآن',
    next: 'الآية التالية',
    finish: 'انظر كيف كانت',
    verdict: {
      whole: 'كلمةً كلمة.',
      held: 'هي الآية.',
      most: 'حضر أكثرها.',
      some: 'حضر بعضها.',
      none: 'ها هي.',
    },
    selfGrades: {
      got_it: { label: 'حفظتها', hint: 'تلوتها كما كُتبت' },
      almost: { label: 'تقريبًا', hint: 'كلمة أو اثنتان' },
      not_yet: { label: 'ليس بعد', hint: 'تستحق نظرة أخرى' },
    },
    legend: { exact: 'حضرت', close: 'قاربت', missed: 'انظر مجددًا' },
  },

  results: {
    closing: {
      none: 'مجموعة قُرئت كلها. لم يُحتسب شيء، ولم يضع شيء.',
      solid: 'هذه المجموعة راسخة.',
      holding: 'أكثر هذه المجموعة ثابت.',
      coming: 'بدأت تتماسك.',
      early: 'ما زلت في أول الطريق مع هذه المجموعة — ولهذا بالضبط وُجدت المراجعة.',
    },
    points: 'النقاط',
    averageRecall: 'متوسط الاستحضار',
    ayat: 'الآيات',
    time: 'الوقت',
    duration: (m, s) => `${m > 0 ? `${num(m, 'ar')} د ` : ''}${num(s, 'ar')} ث`,
    heldFirm: 'ثبتت',
    worthAnotherLook: 'تستحق نظرة أخرى',
    item: (surah, ayah) => `${surah} · الآية ${num(ayah, 'ar')}`,
    shown: 'عُرضت',
    revisitNote:
      'هذه أبطأ الآيات حضورًا، ومعها ما طلبت رؤيته. حين يصل وضع المراجعة ستعود إليك من تلقاء نفسها.',
    another: 'جولة أخرى',
    change: 'غيّر الإعداد',
  },

  footer: {
    textHeading: 'النص',
    text: 'نص القرآن من Quran.com (نسخة Tanzil.net بالرسم العثماني)، مرسومًا بخطوط مصحف مجمع الملك فهد عبر QUL. لا شيء هنا مولَّد أو معاد صياغته، ولا يقدّم التطبيق أحكام تجويد ولا تفسيرًا ولا فتوى.',
    dataHeading: 'بياناتك',
    data: 'ملف تعريف مجهول (كوكي) يحفظ تقدّمك، وآخر يتذكّر لغتك. لا موقع، ولا جهات اتصال، ولا تتبّع، ولا إعلانات، ولا يُباع شيء أو يُشارَك.',
    phoneHeading: 'على هاتف مشترك',
    phone: 'يبقى اسم التبويب واسم الشاشة الرئيسية محايدَين — «Arena» فقط، بلا أيقونة أو عنوان يُعلن ما تراجعه.',
  },
};

export const dictionaries: Record<Locale, Dictionary> = { en, ar };

export function dict(locale: Locale): Dictionary {
  return dictionaries[locale];
}
