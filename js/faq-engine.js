/**
 * faq-engine.js
 * Local knowledge-base search: ranks FAQ entries against a user query using
 * keyword/phrase overlap (not exact string matching). Isolated from the AI
 * layer (see ai-adapter.js) so a real LLM can be swapped in later without
 * touching this ranking logic or the UI.
 */
(function (global) {
  // Function words filtered out of scoring so a bare "what"/"ang"/"is" can't
  // rack up matches against unrelated FAQ questions.
  const STOPWORDS = new Set([
    "what", "who", "when", "where", "why", "how", "is", "are", "am", "do", "does",
    "did", "the", "a", "an", "to", "of", "for", "in", "on", "at", "it", "this",
    "that", "you", "your", "we", "i", "me", "my", "can", "could", "would", "will",
    "please", "about", "and", "or", "but",
    "ang", "mga", "ng", "sa", "na", "po", "ba", "ito", "yan", "iyan", "yung",
    "hindi", "oo", "opo", "meron", "mayroon", "may", "wala", "walang", "tayo",
    "kami", "kayo", "sila", "siya", "ako", "ikaw", "natin", "namin", "ninyo",
  ]);

  function normalize(text) {
    return (text || "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  function tokenize(text) {
    return normalize(text)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /** Word-boundary phrase test — plain substring search would let a short
   *  keyword like "cr" match inside an unrelated word like "crow". */
  function containsPhrase(haystack, phrase) {
    if (!phrase) return false;
    return new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i").test(haystack);
  }

  /** Score one FAQ entry against the tokenized + raw query. */
  function scoreEntry(qTokens, qLowerRaw, entry) {
    let score = 0;
    const keywordTokens = new Set();

    for (const kw of entry.keywords || []) {
      const kwLower = normalize(kw).trim();
      if (!kwLower) continue;
      const kwParts = kwLower.split(/\s+/);
      if (containsPhrase(qLowerRaw, kwLower)) {
        score += 5 + kwParts.length; // longer phrase match = more specific = higher bonus
      }
      // Only single-word keywords contribute standalone token matches — a word
      // that's merely PART of a multi-word phrase (e.g. "time" inside
      // "check-in time") shouldn't score as a strong match on its own.
      if (kwParts.length === 1) {
        tokenize(kw).forEach((t) => keywordTokens.add(t));
      }
    }

    const questionLower = normalize(entry.question || "");
    if (questionLower && (containsPhrase(qLowerRaw, questionLower) || containsPhrase(questionLower, qLowerRaw))) {
      score += 8;
    }
    const questionTokens = new Set(tokenize(entry.question));

    for (const t of qTokens) {
      if (keywordTokens.has(t)) score += 3;
      else if (questionTokens.has(t)) score += 1;
    }

    return score;
  }

  /**
   * Returns one of:
   *  { type: 'none' }
   *  { type: 'answer', entry }
   *  { type: 'clarify', candidates: [entry, entry, ...] }
   */
  const MIN_SCORE = 3; // below this, a match is too weak/coincidental to answer confidently

  function search(query, faqs) {
    const qTokens = tokenize(query);
    const qLowerRaw = normalize(query);
    if (!qTokens.length) return { type: "none" };

    const scored = faqs
      .map((entry) => ({ entry, score: scoreEntry(qTokens, qLowerRaw, entry) }))
      .filter((s) => s.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score || (b.entry.priority || 0) - (a.entry.priority || 0));

    if (!scored.length) return { type: "none" };

    const top = scored[0];
    const runnerUp = scored[1];

    const isClearWinner = !runnerUp || top.score >= runnerUp.score * 1.6;
    if (isClearWinner) {
      return { type: "answer", entry: top.entry };
    }

    const close = scored.filter((s) => s.score >= top.score * 0.7).slice(0, 4);
    return { type: "clarify", candidates: close.map((c) => c.entry) };
  }

  global.CampEnokiFaqEngine = { search, tokenize, normalize };
})(window);
