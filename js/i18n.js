/**
 * i18n.js
 * Lightweight language detection (English / Tagalog / Taglish) and the
 * fixed UI strings the chat widget needs in each language. No external
 * translation service — just enough to route to the right canned string
 * and to pick the right `answer` field on a FAQ entry.
 */
(function (global) {
  const TAGALOG_MARKERS = [
    "ang", "mga", "ng", "sa", "na", "po", "ba", "ito", "yan", "iyan", "yung", "ito'y",
    "hindi", "oo", "opo", "hindi po", "magkano", "pwede", "puwede", "gusto", "salamat",
    "kumusta", "saan", "kailan", "paano", "meron", "mayroon", "may", "wala", "walang",
    "tayo", "kami", "kayo", "sila", "siya", "ako", "ikaw", "natin", "namin", "ninyo",
    "bakante", "presyo", "bayad", "magbook", "magbayad", "araw", "gabi", "tao", "pera",
    "libre", "malapit", "malayo", "kanino", "alin", "dito", "doon", "tuloy",
  ];

  const ENGLISH_MARKERS = [
    "the", "is", "are", "you", "we", "how", "much", "where", "when", "what", "can",
    "do", "does", "book", "booking", "rate", "price", "available", "please", "thanks",
    "hello", "hi", "location", "pet", "pets", "amenities",
  ];

  function wordsOf(text) {
    return (text || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9ñ\s'-]/gi, " ")
      .split(/\s+/)
      .filter(Boolean);
  }

  /** Returns 'tl' | 'en' | 'taglish' */
  function detectLanguage(text) {
    const words = wordsOf(text);
    if (!words.length) return "en";
    let tlHits = 0;
    let enHits = 0;
    for (const w of words) {
      if (TAGALOG_MARKERS.includes(w)) tlHits++;
      if (ENGLISH_MARKERS.includes(w)) enHits++;
    }
    const tlRatio = tlHits / words.length;
    const enRatio = enHits / words.length;
    if (tlHits > 0 && enHits > 0) return "taglish";
    if (tlRatio > 0) return "tl";
    if (enRatio > 0) return "en";
    return "en";
  }

  const STRINGS = {
    en: {
      welcome:
        "👋 Hi! I'm Enoki AI.\nI can help you with:\n• Rates\n• Availability inquiries\n• Directions\n• Amenities\n• Booking\n• Pets\n• Nearby attractions\nAsk me anything.",
      noMatch: "I'm sorry. I don't know the answer yet.\nWould you like me to send your question to Camp Enoki staff?",
      sendToStaffYes: "Yes, send it",
      sendToStaffNo: "No, thanks",
      sentToStaff: "Thanks! I've noted your question for our staff — they'll follow up with you soon.",
      continueOnMessenger: "Continue on Messenger →",
      clarify: "I found a few things that might match. Which one did you mean?",
      inputPlaceholder: "Type your question...",
      bookNow: "Book Now",
    },
    tl: {
      welcome:
        "👋 Hi! Ako si Enoki AI.\nPwede kitang tulungan tungkol sa:\n• Presyo\n• Availability\n• Direksyon\n• Amenities\n• Booking\n• Pets\n• Malapit na atraksyon\nItanong mo lang.",
      noMatch: "Pasensya na po, hindi ko pa alam ang sagot dyan.\nGusto niyo bang ipadala ang tanong niyo sa staff ng Camp Enoki?",
      sendToStaffYes: "Oo, ipadala",
      sendToStaffNo: "Hindi, salamat",
      sentToStaff: "Salamat! Na-note ko na ang tanong niyo — fofollow-up kayo ng staff namin sa lalong madaling panahon.",
      continueOnMessenger: "Ituloy sa Messenger →",
      clarify: "May ilan akong nahanap na baka ito ang gusto niyong itanong. Alin dito?",
      inputPlaceholder: "I-type ang tanong niyo...",
      bookNow: "Mag-book Na",
    },
    taglish: {
      welcome:
        "👋 Hi! I'm Enoki AI.\nPwede kitang tulungan sa:\n• Rates\n• Availability\n• Directions\n• Amenities\n• Booking\n• Pets\n• Nearby attractions\nAsk me anything, ask mo lang!",
      noMatch: "Sorry, hindi ko pa alam ang sagot dyan.\nWant mo bang ipadala ko yung tanong mo sa Camp Enoki staff?",
      sendToStaffYes: "Yes, send it",
      sendToStaffNo: "No, salamat",
      sentToStaff: "Thanks! Na-note ko na — fofollow-up ka ng staff namin soon.",
      continueOnMessenger: "Continue sa Messenger →",
      clarify: "May mga nahanap akong pwedeng match. Alin dito ang tinatanong mo?",
      inputPlaceholder: "Type your question...",
      bookNow: "Book Now",
    },
  };

  function t(key, lang) {
    const l = STRINGS[lang] ? lang : "en";
    return STRINGS[l][key] ?? STRINGS.en[key] ?? key;
  }

  /** Picks the best-matching answer field on a FAQ entry for the detected language. */
  function pickAnswer(entry, lang) {
    if (lang === "tl" && entry.answer_tl) return entry.answer_tl;
    if (lang === "taglish" && (entry.answer_taglish || entry.answer_tl)) {
      return entry.answer_taglish || entry.answer_tl;
    }
    return entry.answer;
  }

  global.CampEnokiI18n = { detectLanguage, t, pickAnswer };
})(window);
