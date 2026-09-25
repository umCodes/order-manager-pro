const NOTICE_BY_LANGUAGE = {
    en: "This number is for notification purposes. Please contact us on the number below.",
    ar: "هذا الرقم مخصص للإشعارات فقط. يرجى التواصل معنا عبر الرقم أدناه.",
    am: "ይህ ቁጥር ለማሳወቂያ አገልግሎት ብቻ ነው። እባክዎ ከዚህ በታች ባለው ቁጥር ያግኙን።",
};

export function getContactNotice(language) {
    return NOTICE_BY_LANGUAGE[language] ?? NOTICE_BY_LANGUAGE.am;
}
