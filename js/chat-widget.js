/**
 * chat-widget.js
 * Floating "Enoki AI Concierge" button + chat panel. Talks only to
 * CampEnokiAI.ask()/answerById() — never touches the FAQ engine or data
 * store directly, so the AI layer stays swappable.
 */
(function (global) {
  const WELCOMED_KEY = "ce_chat_welcomed";
  let panelEl, messagesEl, inputEl, fabEl;
  let open = false;

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v);
    }
    for (const child of [].concat(children)) {
      if (child) node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addUserMessage(text) {
    messagesEl.appendChild(el("div", { class: "msg user" }, text));
    scrollToBottom();
  }

  function renderMedia(mediaList) {
    if (!mediaList || !mediaList.length) return null;
    const wrap = el("div", { class: "msg-media" });
    for (const m of mediaList) {
      const fig = el("figure", { style: "margin:0 0 8px" });
      if (m.type === "video") {
        fig.appendChild(el("video", { src: m.src, controls: "controls", playsinline: "true" }));
      } else {
        fig.appendChild(el("img", { src: m.src, alt: m.caption || "" }));
      }
      if (m.caption) fig.appendChild(el("figcaption", {}, m.caption));
      wrap.appendChild(fig);
    }
    return wrap;
  }

  function runButtonAction(btn) {
    if (btn.action === "scroll") {
      const target = document.querySelector(btn.target);
      if (target) target.scrollIntoView({ behavior: "smooth" });
      closePanel();
    } else if (btn.action === "open-booking") {
      global.CampEnokiBooking?.open();
    } else if (btn.action === "map") {
      window.open(btn.target, "_blank", "noopener");
    }
  }

  function renderButtons(buttons) {
    if (!buttons || !buttons.length) return null;
    const wrap = el("div", { class: "msg-buttons" });
    for (const b of buttons) {
      const btn = el("button", { class: "msg-btn", type: "button" }, b.label);
      btn.addEventListener("click", () => runButtonAction(b));
      wrap.appendChild(btn);
    }
    return wrap;
  }

  function renderQuickReplies(options, onPick) {
    const wrap = el("div", { class: "msg-quick" });
    for (const opt of options) {
      const btn = el("button", { class: "msg-btn", type: "button" }, opt.label);
      btn.addEventListener("click", () => onPick(opt));
      wrap.appendChild(btn);
    }
    return wrap;
  }

  function addBotResponse(response) {
    const bubble = el("div", { class: "msg bot" }, response.text);
    if (response.source === "ai") {
      bubble.appendChild(el("div", { style: "font-size:.7rem;color:var(--text-muted);margin-top:6px" }, "✨ Enoki AI"));
    }
    const media = renderMedia(response.media);
    if (media) bubble.appendChild(media);
    const btns = renderButtons(response.buttons);
    if (btns) bubble.appendChild(btns);

    if (response.type === "clarify") {
      bubble.appendChild(
        renderQuickReplies(response.options, async (opt) => {
          addUserMessage(opt.label);
          const answer = await global.CampEnokiAI.answerById(opt.id);
          addBotResponse(answer);
        })
      );
    }

    if (response.type === "none") {
      const lang = response.lang || "en";
      const t = global.CampEnokiI18n.t;
      bubble.appendChild(
        renderQuickReplies(
          [
            { label: t("sendToStaffYes", lang), value: "yes" },
            { label: t("sendToStaffNo", lang), value: "no" },
          ],
          (opt) => {
            bubble.querySelector(".msg-quick")?.remove();
            if (opt.value === "yes") {
              bubble.appendChild(el("div", { class: "msg-buttons" }, el("em", {}, t("sentToStaff", lang))));
            }
          }
        )
      );
    }

    messagesEl.appendChild(bubble);
    scrollToBottom();
  }

  async function handleSend() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    addUserMessage(text);
    const typingBubble = el("div", { class: "msg bot" }, "…");
    messagesEl.appendChild(typingBubble);
    scrollToBottom();
    const response = await global.CampEnokiAI.ask(text);
    typingBubble.remove();
    addBotResponse(response);
  }

  function detectDefaultLang() {
    const nav = (navigator.language || "en").toLowerCase();
    if (nav.startsWith("tl") || nav.startsWith("fil")) return "tl";
    return "en";
  }

  function showWelcomeIfNeeded() {
    if (sessionStorage.getItem(WELCOMED_KEY)) return;
    const lang = detectDefaultLang();
    const text = global.CampEnokiI18n.t("welcome", lang);
    messagesEl.appendChild(el("div", { class: "msg bot" }, text));
    scrollToBottom();
    sessionStorage.setItem(WELCOMED_KEY, "1");
  }

  function openPanel() {
    open = true;
    panelEl.classList.add("open");
    showWelcomeIfNeeded();
    inputEl.focus();
  }

  function closePanel() {
    open = false;
    panelEl.classList.remove("open");
  }

  function togglePanel() {
    open ? closePanel() : openPanel();
  }

  function build() {
    fabEl = el("button", { class: "chat-fab", type: "button", "aria-label": "Open Enoki AI Concierge chat", html: "💬" });

    const closeBtn = el("button", { class: "chat-close", type: "button", "aria-label": "Close chat", html: "&times;" });
    closeBtn.addEventListener("click", closePanel);

    const header = el("div", { class: "chat-header" }, [
      el("div", {}, [el("div", { class: "title" }, "Enoki AI Concierge"), el("div", { class: "subtitle" }, "Usually replies instantly")]),
      closeBtn,
    ]);

    messagesEl = el("div", { class: "chat-messages" });
    inputEl = el("input", { type: "text", placeholder: global.CampEnokiI18n.t("inputPlaceholder", detectDefaultLang()) });
    const sendBtn = el("button", { class: "chat-send", type: "button", "aria-label": "Send", html: "&#10148;" });
    sendBtn.addEventListener("click", handleSend);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSend();
    });

    const inputRow = el("div", { class: "chat-input-row" }, [inputEl, sendBtn]);

    panelEl = el("div", { class: "chat-panel", role: "dialog", "aria-label": "Enoki AI Concierge" }, [header, messagesEl, inputRow]);

    fabEl.addEventListener("click", togglePanel);

    document.body.appendChild(fabEl);
    document.body.appendChild(panelEl);
  }

  document.addEventListener("DOMContentLoaded", build);

  global.CampEnokiChat = { open: openPanel, close: closePanel };
})(window);
