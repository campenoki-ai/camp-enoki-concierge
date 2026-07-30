/**
 * ai-adapter.js
 * The ONLY layer the chat widget talks to for "answering a question". The
 * FAQ engine (free, instant, precise media/buttons) and a real AI provider
 * (Claude, via a small serverless proxy — see server/worker.js) are both
 * wired in here behind one interface, so chat-widget.js never needs to
 * change when the AI layer changes. New providers (OpenAI/Gemini/Meta)
 * register themselves the same way Claude does below.
 *
 * Response shape (always the same, regardless of provider):
 *   { type: 'answer',  text, media: [...], buttons: [...], lang, source? }
 *   { type: 'clarify', text, options: [{id, label}], lang }
 *   { type: 'none',    text, lang }
 */
(function (global) {
  const providers = {};
  let activeProvider = "auto";

  function registerProvider(name, handler) {
    providers[name] = handler;
  }

  function setActiveProvider(name) {
    if (!providers[name]) throw new Error(`AI provider "${name}" is not registered`);
    activeProvider = name;
  }

  async function resolveMedia(keys) {
    if (!keys || !keys.length) return [];
    const mediaList = await global.CampEnokiData.getMediaItems();
    const byId = new Map(mediaList.map((m) => [m.id, m]));
    return keys.map((k) => byId.get(k)).filter(Boolean);
  }

  async function localProvider(query) {
    const { detectLanguage, t, pickAnswer } = global.CampEnokiI18n;
    const lang = detectLanguage(query);
    const faqs = await global.CampEnokiData.getFaqs();
    const result = global.CampEnokiFaqEngine.search(query, faqs);

    if (result.type === "answer") {
      const entry = result.entry;
      return {
        type: "answer",
        text: pickAnswer(entry, lang),
        media: await resolveMedia([...(entry.images || []), ...(entry.videos || [])]),
        buttons: entry.buttons || [],
        lang,
      };
    }

    if (result.type === "clarify") {
      return {
        type: "clarify",
        text: t("clarify", lang),
        options: result.candidates.map((c) => ({ id: c.id, label: c.question })),
        lang,
      };
    }

    global.CampEnokiData.recordUnanswered(query);
    return { type: "none", text: t("noMatch", lang), lang };
  }

  registerProvider("local", localProvider);

  /** Builds a short, cheap-to-send knowledge-base excerpt to ground Claude's answer. */
  async function buildKbContext(query) {
    const faqs = await global.CampEnokiData.getFaqs();
    const ranked = faqs
      .map((f) => ({ f, score: global.CampEnokiFaqEngine.search(query, [f]).type === "answer" ? 1 : 0 }))
      .filter((x) => x.score > 0)
      .map((x) => x.f);
    const picked = (ranked.length ? ranked : faqs).slice(0, 6);
    return picked.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n");
  }

  /** Calls the serverless proxy (server/worker.js) which holds the Anthropic API key. */
  async function claudeProvider(query) {
    const { detectLanguage, t } = global.CampEnokiI18n;
    const lang = detectLanguage(query);
    const aiSettings = await global.CampEnokiData.getAiSettings();
    if (!aiSettings.proxyUrl) throw new Error("AI proxy URL is not configured");

    const context = await buildKbContext(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let data;
    try {
      const res = await fetch(aiSettings.proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, context, systemPromptOverride: aiSettings.systemPromptOverride || undefined }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`AI proxy returned ${res.status}`);
      data = await res.json();
    } finally {
      clearTimeout(timeout);
    }

    const text = (data.text || "").trim();
    if (!text || text.toUpperCase() === "NO_MATCH") {
      global.CampEnokiData.recordUnanswered(query);
      return { type: "none", text: t("noMatch", lang), lang };
    }
    return { type: "answer", text, media: [], buttons: [], lang, source: "ai" };
  }

  registerProvider("claude", claudeProvider);

  /**
   * Default routing: local-first keeps common questions instant and free;
   * an AI provider (if enabled + configured in Admin -> AI Concierge) only
   * gets called for what the local engine can't confidently answer, or
   * always, per the configured mode. Falls back to the local result if the
   * AI call fails for any reason (network, misconfigured proxy, etc.) so
   * the chat never breaks.
   */
  async function autoProvider(query, context) {
    const aiSettings = await global.CampEnokiData.getAiSettings();
    const aiReady = aiSettings.enabled && aiSettings.proxyUrl;

    if (!aiReady || aiSettings.mode === "local-only") {
      return localProvider(query, context);
    }

    if (aiSettings.mode === "always-ai") {
      try {
        return await claudeProvider(query, context);
      } catch (e) {
        console.warn("AI provider failed, falling back to local:", e);
        return localProvider(query, context);
      }
    }

    // "local-first" (default): only call the AI when local can't confidently answer.
    const localResult = await localProvider(query, context);
    if (localResult.type === "answer") return localResult;
    try {
      return await claudeProvider(query, context);
    } catch (e) {
      console.warn("AI provider failed, falling back to local:", e);
      return localResult;
    }
  }

  registerProvider("auto", autoProvider);

  /** Ask the active provider a question. `context` is reserved for future providers (conversation history, etc). */
  async function ask(query, context) {
    const handler = providers[activeProvider];
    return handler(query, context);
  }

  /** Look up a FAQ entry by id (used when the user clicks a clarifying-question option). */
  async function answerById(id) {
    const { detectLanguage, pickAnswer } = global.CampEnokiI18n;
    const faqs = await global.CampEnokiData.getFaqs();
    const entry = faqs.find((f) => f.id === id);
    if (!entry) return { type: "none", text: "Sorry, I lost track of that question.", lang: "en" };
    const lang = detectLanguage(entry.question);
    return {
      type: "answer",
      text: pickAnswer(entry, lang),
      media: await resolveMedia([...(entry.images || []), ...(entry.videos || [])]),
      buttons: entry.buttons || [],
      lang,
    };
  }

  global.CampEnokiAI = { ask, answerById, registerProvider, setActiveProvider };
})(window);
