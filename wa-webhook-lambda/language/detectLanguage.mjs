const ARABIC_SCRIPT = /[؀-ۿ]/;
const ETHIOPIC_SCRIPT = /[ሀ-፿]/;

// Common Amharic words/particles as commonly typed in Latin transliteration
// (romanized Amharic is widespread in WhatsApp chats since there's no native keyboard habit for many users).
const LATIN_AMHARIC_WORDS = [
    "selam", "salam", "tena", "yistilign", "ameseginalehu", "amesegenalew",
    "endet", "neh", "nesh", "nachihu", "eshi", "betam", "ayzosh", "ayzoh",
    "wey", "wof", "min", "kfa", "sint", "birr", "gize", "dehna",
];

function hasLatinAmharicWord(text) {
    const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
    return words.some((word) => LATIN_AMHARIC_WORDS.includes(word));
}

/** Detects "am" (Amharic, native or Latin-transliterated) or "ar" (Arabic); defaults to "am" otherwise. */
export function detectLanguage(text) {
    if (!text) return "am";
    if (ETHIOPIC_SCRIPT.test(text)) return "am";
    if (ARABIC_SCRIPT.test(text)) return "ar";
    if (hasLatinAmharicWord(text)) return "am";
    return "am";
}
