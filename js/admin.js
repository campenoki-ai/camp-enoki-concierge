/**
 * admin.js
 * Full content-management admin: FAQ CRUD (bespoke, unchanged from Phase 1)
 * plus a generic schema-driven CRUD engine reused for every other list
 * collection (rates/amenities/attractions/reviews/media), and simple forms
 * for the singleton configs (site settings, policies, AI concierge, auth).
 *
 * Auth note: authGate() below is a CLIENT-SIDE password check (SHA-256
 * hash comparison, sessionStorage session) — it deters casual/accidental
 * discovery (search engines, a stumbled-upon URL) but is not real
 * server-side auth. A static GitHub Pages site has nowhere secure to hold
 * a secret; anyone determined enough to read the JS/network traffic could
 * still get in. Good enough for "don't let just anyone edit the site",
 * not good enough for anything actually sensitive.
 */
(function () {
  const SESSION_KEY = "ce_admin_authed";

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function initAuthGate(onUnlocked) {
    const gate = document.getElementById("authGate");
    const content = document.getElementById("adminContent");
    const passwordInput = document.getElementById("authPasswordInput");
    const errorEl = document.getElementById("authError");

    async function reveal() {
      sessionStorage.setItem(SESSION_KEY, "1");
      gate.classList.add("hidden");
      content.classList.remove("hidden");
      await onUnlocked();
    }

    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      await reveal();
      return;
    }

    async function attempt() {
      const auth = await window.CampEnokiData.getAdminAuth();
      const hash = await sha256Hex(passwordInput.value);
      if (hash === auth.passwordHash) {
        errorEl.textContent = "";
        await reveal();
      } else {
        errorEl.textContent = "Incorrect password.";
        passwordInput.select();
      }
    }

    document.getElementById("authSubmitBtn").addEventListener("click", attempt);
    passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") attempt();
    });
    passwordInput.focus();
  }

  function initLogout() {
    document.getElementById("logoutBtn")?.addEventListener("click", () => {
      sessionStorage.removeItem(SESSION_KEY);
      location.reload();
    });
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue; // e.g. conditional `selected` on <option> — must be omitted, not stringified
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v);
    }
    for (const child of [].concat(children)) {
      if (child) node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function initTheme() {
    const THEME_KEY = "ce_theme";
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    const toggle = document.getElementById("themeToggle");
    const setIcon = () => {
      const isDark =
        document.documentElement.getAttribute("data-theme") === "dark" ||
        (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
      toggle.textContent = isDark ? "☀️" : "🌙";
    };
    setIcon();
    toggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(THEME_KEY, next);
      setIcon();
    });
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".admin-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
        document.querySelector(`.tab-panel[data-panel="${tab.dataset.tab}"]`)?.classList.remove("hidden");
      });
    });
  }

  // ===================================================================
  // FAQ (bespoke — unchanged behavior from Phase 1)
  // ===================================================================
  let allFaqs = [];
  let faqSearchTerm = "";

  async function refreshFaqs() {
    allFaqs = await window.CampEnokiData.getFaqs();
    renderFaqTable();
  }

  function matchesSearch(f, term) {
    if (!term) return true;
    const hay = [f.question, f.category, ...(f.keywords || [])].join(" ").toLowerCase();
    return hay.includes(term.toLowerCase());
  }

  function renderFaqTable() {
    const body = document.getElementById("faqTableBody");
    body.innerHTML = "";
    const filtered = allFaqs.filter((f) => matchesSearch(f, faqSearchTerm));
    if (!filtered.length) {
      body.appendChild(el("tr", {}, el("td", { colspan: "6", class: "admin-empty" }, "No FAQ entries match.")));
      return;
    }
    filtered.forEach((f) => {
      const mediaCount = (f.images?.length || 0) + (f.videos?.length || 0);
      const editBtn = el("button", { class: "btn btn-outline btn-sm" }, "Edit");
      editBtn.addEventListener("click", () => openFaqModal(f));
      const delBtn = el("button", { class: "btn btn-ghost btn-sm" }, "Delete");
      delBtn.addEventListener("click", async () => {
        if (confirm(`Delete FAQ "${f.question}"?`)) {
          await window.CampEnokiData.deleteFaq(f.id);
          refreshFaqs();
        }
      });
      body.appendChild(
        el("tr", {}, [
          el("td", {}, f.question),
          el("td", {}, el("span", { class: "tag" }, f.category || "—")),
          el("td", {}, String(f.priority ?? 5)),
          el("td", {}, f.language || "auto"),
          el("td", {}, mediaCount ? `${mediaCount} file(s)` : "—"),
          el("td", { class: "admin-actions" }, [editBtn, delBtn]),
        ])
      );
    });
  }

  function parseList(text) {
    return text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function openFaqModal(entry) {
    const overlay = document.getElementById("faqModalOverlay");
    const box = document.getElementById("faqModalBox");
    const isEdit = !!entry;
    box.innerHTML = "";

    const fields = {
      category: entry?.category || "",
      keywords: (entry?.keywords || []).join(", "),
      question: entry?.question || "",
      answer: entry?.answer || "",
      answer_tl: entry?.answer_tl || "",
      images: (entry?.images || []).join(", "),
      videos: (entry?.videos || []).join(", "),
      priority: entry?.priority ?? 5,
      language: entry?.language || "auto",
    };

    function row(labelText, inputNode) {
      return el("div", { class: "form-row" }, [el("label", {}, labelText), inputNode]);
    }

    const closeX = el("button", { class: "modal-close-x", type: "button" }, "×");
    closeX.addEventListener("click", closeFaqModal);
    box.appendChild(closeX);
    box.appendChild(el("h2", {}, isEdit ? "Edit FAQ" : "Add FAQ"));

    const categoryInput = el("input", { type: "text", value: fields.category, placeholder: "rates / amenities / booking ..." });
    const keywordsInput = el("input", { type: "text", value: fields.keywords, placeholder: "comma, separated, keywords" });
    const questionInput = el("input", { type: "text", value: fields.question, placeholder: "What guests might ask" });
    const answerInput = el("textarea", {}, fields.answer);
    const answerTlInput = el("textarea", {}, fields.answer_tl);
    const imagesInput = el("input", { type: "text", value: fields.images, placeholder: "media ids, comma separated" });
    const videosInput = el("input", { type: "text", value: fields.videos, placeholder: "media ids, comma separated" });
    const priorityInput = el("input", { type: "number", value: String(fields.priority), min: "1", max: "10" });

    box.appendChild(row("Category", categoryInput));
    box.appendChild(row("Keywords", keywordsInput));
    box.appendChild(row("Question", questionInput));
    box.appendChild(row("Answer (English/default)", answerInput));
    box.appendChild(row("Answer (Tagalog, optional)", answerTlInput));
    box.appendChild(row("Image media ids (optional — see Media tab)", imagesInput));
    box.appendChild(row("Video media ids (optional)", videosInput));
    box.appendChild(row("Priority (1-10)", priorityInput));

    const saveBtn = el("button", { class: "btn btn-primary" }, isEdit ? "Save Changes" : "Add FAQ");
    saveBtn.addEventListener("click", async () => {
      const patch = {
        category: categoryInput.value.trim(),
        keywords: parseList(keywordsInput.value),
        question: questionInput.value.trim(),
        answer: answerInput.value.trim(),
        answer_tl: answerTlInput.value.trim() || undefined,
        images: parseList(imagesInput.value),
        videos: parseList(videosInput.value),
        priority: parseInt(priorityInput.value, 10) || 5,
        language: "auto",
      };
      if (!patch.question || !patch.answer) {
        alert("Question and Answer are required.");
        return;
      }
      if (isEdit) await window.CampEnokiData.updateFaq(entry.id, patch);
      else await window.CampEnokiData.addFaq(patch);
      closeFaqModal();
      refreshFaqs();
    });
    const cancelBtn = el("button", { class: "btn btn-ghost" }, "Cancel");
    cancelBtn.addEventListener("click", closeFaqModal);
    box.appendChild(el("div", { class: "form-actions" }, [cancelBtn, saveBtn]));

    overlay.classList.add("open");
  }

  function closeFaqModal() {
    document.getElementById("faqModalOverlay").classList.remove("open");
  }

  function initFaqToolbar() {
    document.getElementById("addFaqBtn").addEventListener("click", () => openFaqModal(null));
    document.getElementById("faqSearch").addEventListener("input", (e) => {
      faqSearchTerm = e.target.value;
      renderFaqTable();
    });
    document.getElementById("exportBtn").addEventListener("click", async () => {
      const json = await window.CampEnokiData.exportFaqJson();
      download("faq-export.json", json);
    });
    document.getElementById("importInput").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const list = JSON.parse(text);
        const replace = confirm("Click OK to REPLACE the entire FAQ list with this file, or Cancel to MERGE it into the existing list.");
        await window.CampEnokiData.importFaqJson(list, replace ? "replace" : "merge");
        refreshFaqs();
        alert(`Import complete (${replace ? "replace" : "merge"} mode).`);
      } catch (err) {
        alert("Import failed: " + err.message);
      }
      e.target.value = "";
    });
    document.getElementById("faqModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "faqModalOverlay") closeFaqModal();
    });
  }

  // ===================================================================
  // Generic schema-driven CRUD for the other list collections
  // ===================================================================
  const D = window.CampEnokiData;

  const SECTIONS = {
    rates: {
      label: "accommodation",
      columns: [
        { label: "Name", key: "name" },
        { label: "Overnight", key: "overnight", prefix: "₱" },
        { label: "Day Tour", key: "daytour", prefix: "₱" },
        { label: "Pax", key: "capacity" },
      ],
      fields: [
        { key: "name", label: "Name", type: "text" },
        { key: "description", label: "Description", type: "textarea" },
        { key: "capacity", label: "Capacity (pax)", type: "number" },
        { key: "extraPaxFee", label: "Extra pax fee (₱)", type: "number" },
        { key: "overnight", label: "Overnight rate (₱)", type: "number" },
        { key: "daytour", label: "Day tour rate (₱)", type: "number" },
        { key: "image", label: "Rates Photo", type: "image" },
      ],
      store: {
        getAll: D.getRates,
        add: D.addRate,
        update: D.updateRate,
        remove: D.deleteRate,
        exportJson: D.exportRatesJson,
        importJson: D.importRatesJson,
      },
    },
    amenities: {
      label: "amenity",
      columns: [
        { label: "Icon", key: "icon" },
        { label: "Name", key: "name" },
        { label: "Description", key: "description" },
      ],
      fields: [
        { key: "name", label: "Name", type: "text" },
        { key: "icon", label: "Icon (emoji)", type: "text" },
        { key: "description", label: "Description", type: "textarea" },
      ],
      store: {
        getAll: D.getAmenities,
        add: D.addAmenity,
        update: D.updateAmenity,
        remove: D.deleteAmenity,
        exportJson: D.exportAmenitiesJson,
        importJson: D.importAmenitiesJson,
      },
    },
    attractions: {
      label: "attraction",
      columns: [
        { label: "Photo", key: "photo", isImage: true },
        { label: "Name", key: "name" },
        { label: "Distance", key: "distance" },
        { label: "Description", key: "description" },
      ],
      fields: [
        { key: "name", label: "Name", type: "text" },
        { key: "distance", label: "Distance (e.g. '15 minutes by car')", type: "text" },
        { key: "description", label: "Description", type: "textarea" },
        { key: "photo", label: "Photo", type: "image" },
        {
          key: "video",
          label: "Video (optional)",
          type: "text",
          hint: "Paste a Google Drive share link (Anyone with the link) — shown instead of the photo if both are set.",
        },
      ],
      store: {
        getAll: D.getAttractions,
        add: D.addAttraction,
        update: D.updateAttraction,
        remove: D.deleteAttraction,
        exportJson: D.exportAttractionsJson,
        importJson: D.importAttractionsJson,
      },
    },
    reviews: {
      label: "review",
      columns: [
        { label: "Name", key: "name" },
        { label: "Rating", key: "rating" },
        { label: "Comment", key: "comment" },
        { label: "Date", key: "date" },
      ],
      fields: [
        { key: "name", label: "Guest name", type: "text" },
        { key: "rating", label: "Rating (1-5)", type: "number" },
        { key: "comment", label: "Comment", type: "textarea" },
        { key: "date", label: "Date (YYYY-MM-DD)", type: "text" },
      ],
      store: {
        getAll: D.getReviews,
        add: D.addReview,
        update: D.updateReview,
        remove: D.deleteReview,
        exportJson: D.exportReviewsJson,
        importJson: D.importReviewsJson,
      },
    },
    media: {
      label: "media item",
      columns: [
        { label: "Preview", key: "src", isImage: true },
        { label: "ID (use this in a FAQ's image/video field)", key: "id", isCode: true },
        { label: "Category", key: "category" },
        { label: "Type", key: "type" },
        { label: "Caption", key: "caption" },
      ],
      fields: [
        { key: "category", label: "Category (groups it in the Gallery)", type: "text" },
        { key: "type", label: "Type", type: "select", options: ["image", "video"] },
        { key: "src", label: "Image/Video", type: "image" },
        { key: "caption", label: "Caption", type: "text" },
      ],
      store: {
        getAll: D.getMediaItems,
        add: D.addMediaItem,
        update: D.updateMediaItem,
        remove: D.deleteMediaItem,
        exportJson: D.exportMediaJson,
        importJson: D.importMediaJson,
      },
    },
  };

  const sectionSearch = {};

  function matchesSectionSearch(item, term) {
    if (!term) return true;
    const hay = Object.values(item).join(" ").toLowerCase();
    return hay.includes(term.toLowerCase());
  }

  async function renderSectionTable(key) {
    const config = SECTIONS[key];
    const mount = document.getElementById(`${key}-table`);
    const items = (await config.store.getAll()).filter((item) => matchesSectionSearch(item, sectionSearch[key]));

    const table = el("table", { class: "admin-table" });
    const thead = el(
      "thead",
      {},
      el("tr", {}, [...config.columns.map((c) => el("th", {}, c.label)), el("th", {}, "Actions")])
    );
    const tbody = el("tbody");
    if (!items.length) {
      tbody.appendChild(el("tr", {}, el("td", { colspan: String(config.columns.length + 1), class: "admin-empty" }, `No ${config.label} entries yet.`)));
    } else {
      items.forEach((item) => {
        const editBtn = el("button", { class: "btn btn-outline btn-sm" }, "Edit");
        editBtn.addEventListener("click", () => openItemModal(key, item));
        const delBtn = el("button", { class: "btn btn-ghost btn-sm" }, "Delete");
        delBtn.addEventListener("click", async () => {
          if (confirm(`Delete this ${config.label}?`)) {
            await config.store.remove(item.id);
            renderSectionTable(key);
          }
        });
        const cells = config.columns.map((c) => {
          if (c.isImage) {
            return el("td", {}, item[c.key] ? el("img", { class: "image-field-preview", src: item[c.key], alt: "" }) : "—");
          }
          if (c.isCode) {
            return el("td", {}, el("code", {}, item[c.key] ?? "—"));
          }
          const val = item[c.key];
          return el("td", {}, val === undefined || val === null || val === "" ? "—" : `${c.prefix || ""}${val}`);
        });
        tbody.appendChild(el("tr", {}, [...cells, el("td", { class: "admin-actions" }, [editBtn, delBtn])]));
      });
    }
    table.appendChild(thead);
    table.appendChild(tbody);
    mount.innerHTML = "";
    mount.appendChild(el("div", { class: "admin-table-wrap" }, table));
  }

  function renderSectionToolbar(key) {
    const config = SECTIONS[key];
    const mount = document.getElementById(`${key}-toolbar`);
    const search = el("input", { type: "search", placeholder: `Search ${config.label}s...` });
    search.addEventListener("input", (e) => {
      sectionSearch[key] = e.target.value;
      renderSectionTable(key);
    });
    const addBtn = el("button", { class: "btn btn-primary btn-sm" }, `+ Add ${config.label}`);
    addBtn.addEventListener("click", () => openItemModal(key, null));
    const exportBtn = el("button", { class: "btn btn-outline btn-sm" }, "Export JSON");
    exportBtn.addEventListener("click", async () => download(`${key}-export.json`, await config.store.exportJson()));
    const importInput = el("input", { type: "file", accept: "application/json", style: "display:none" });
    importInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const list = JSON.parse(await file.text());
        const replace = confirm(`Click OK to REPLACE the entire ${key} list with this file, or Cancel to MERGE it in.`);
        await config.store.importJson(list, replace ? "replace" : "merge");
        renderSectionTable(key);
        alert("Import complete.");
      } catch (err) {
        alert("Import failed: " + err.message);
      }
      e.target.value = "";
    });
    const importLabel = el("label", { class: "btn btn-outline btn-sm", style: "cursor:pointer" }, ["Import JSON", importInput]);

    mount.innerHTML = "";
    mount.appendChild(el("div", { class: "admin-toolbar" }, [search, addBtn, exportBtn, importLabel]));
  }

  const UPLOAD_MAX_DIMENSION = 1400;
  const UPLOAD_JPEG_QUALITY = 0.82;

  /** A raw phone photo can be several MB — as a data URL that blows through
   *  localStorage's ~5-10MB-per-origin quota fast (the site's only storage,
   *  since it's static hosting with no backend). Downscale + re-encode as
   *  JPEG client-side before it ever becomes a data URL. */
  function compressImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("Could not read the file"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not decode the image"));
        img.onload = () => {
          const scale = Math.min(1, UPLOAD_MAX_DIMENSION / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", UPLOAD_JPEG_QUALITY));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function imageFieldInput(field, currentValue) {
    const wrap = el("div", { style: "display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap" });
    const urlInput = el("input", { type: "text", value: currentValue || "", placeholder: "images/photo.jpg or paste a URL" });
    const preview = el("img", { class: "image-field-preview", src: currentValue || "", style: currentValue ? "" : "display:none" });
    const fileInput = el("input", { type: "file", accept: "image/*" });
    const status = el("div", { style: "font-size:.78rem;color:var(--text-muted);margin-top:4px" });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      status.textContent = "Compressing image...";
      try {
        const dataUrl = await compressImageFile(file);
        urlInput.value = dataUrl;
        preview.src = dataUrl;
        preview.style.display = "";
        status.textContent = `Ready (${Math.round(dataUrl.length / 1024)} KB after compression)`;
      } catch (e) {
        status.textContent = "Couldn't process that image: " + e.message;
      }
    });
    urlInput.addEventListener("input", () => {
      preview.src = urlInput.value;
      preview.style.display = urlInput.value ? "" : "none";
    });
    wrap.appendChild(el("div", { style: "flex:1;min-width:200px" }, [urlInput, el("div", { style: "margin-top:6px" }, fileInput), status]));
    wrap.appendChild(preview);
    wrap.getValue = () => urlInput.value;
    return wrap;
  }

  function openItemModal(sectionKey, item) {
    const config = SECTIONS[sectionKey];
    const overlay = document.getElementById("itemModalOverlay");
    const box = document.getElementById("itemModalBox");
    const isEdit = !!item;
    box.innerHTML = "";

    const closeX = el("button", { class: "modal-close-x", type: "button" }, "×");
    closeX.addEventListener("click", closeItemModal);
    box.appendChild(closeX);
    box.appendChild(el("h2", {}, isEdit ? `Edit ${config.label}` : `Add ${config.label}`));

    const inputs = {};
    config.fields.forEach((field) => {
      const current = item ? item[field.key] : field.default ?? "";
      let inputNode;
      if (field.type === "textarea") {
        inputNode = el("textarea", {}, current ?? "");
      } else if (field.type === "select") {
        inputNode = el(
          "select",
          {},
          field.options.map((opt) => el("option", { value: opt, selected: opt === current ? "selected" : undefined }, opt))
        );
      } else if (field.type === "image") {
        inputNode = imageFieldInput(field, current);
      } else {
        inputNode = el("input", { type: field.type === "number" ? "number" : "text", value: current ?? "" });
      }
      inputs[field.key] = inputNode;
      const row = el("div", { class: "form-row" }, [el("label", {}, field.label), inputNode]);
      if (field.hint) row.appendChild(el("div", { style: "font-size:.78rem;color:var(--text-muted);margin-top:4px" }, field.hint));
      box.appendChild(row);
    });

    const saveBtn = el("button", { class: "btn btn-primary" }, isEdit ? "Save Changes" : "Add");
    saveBtn.addEventListener("click", async () => {
      const patch = {};
      config.fields.forEach((field) => {
        const node = inputs[field.key];
        const raw = node.getValue ? node.getValue() : node.value;
        patch[field.key] = field.type === "number" ? parseFloat(raw) || 0 : raw;
      });
      try {
        if (isEdit) await config.store.update(item.id, patch);
        else await config.store.add(patch);
      } catch (e) {
        // Most likely cause: browser storage quota exceeded — this site's only
        // storage is localStorage, so a big enough photo can fill it (~5-10MB total).
        const quota = e.name === "QuotaExceededError";
        alert(
          quota
            ? "Save failed: browser storage is full. Try a smaller photo, or remove an old one first (Media/Rates photos all share the same limited storage on this static site)."
            : "Save failed: " + e.message
        );
        return; // keep the modal open so nothing typed is lost
      }
      closeItemModal();
      renderSectionTable(sectionKey);
    });
    const cancelBtn = el("button", { class: "btn btn-ghost" }, "Cancel");
    cancelBtn.addEventListener("click", closeItemModal);
    box.appendChild(el("div", { class: "form-actions" }, [cancelBtn, saveBtn]));

    overlay.classList.add("open");
  }

  function closeItemModal() {
    document.getElementById("itemModalOverlay").classList.remove("open");
  }

  function initSections() {
    Object.keys(SECTIONS).forEach((key) => {
      renderSectionToolbar(key);
      renderSectionTable(key);
    });
    document.getElementById("itemModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "itemModalOverlay") closeItemModal();
    });
  }

  // ===================================================================
  // Singleton config forms: Site Settings / Policies / AI Concierge
  // ===================================================================
  function singletonRow(label, inputNode) {
    return el("div", { class: "form-row" }, [el("label", {}, label), inputNode]);
  }

  async function renderSingletonForm({ containerId, fields, getFn, updateFn, saveLabel }) {
    const mount = document.getElementById(containerId);
    const current = await getFn();
    const inputs = {};
    const form = el("div", { class: "settings-form" });

    fields.forEach((field) => {
      const value = current[field.key];
      let inputNode;
      if (field.type === "textarea") {
        inputNode = el("textarea", { rows: field.rows || 3 }, value ?? "");
      } else if (field.type === "checkbox") {
        inputNode = el("input", { type: "checkbox" });
        inputNode.checked = !!value;
      } else if (field.type === "select") {
        inputNode = el(
          "select",
          {},
          field.options.map((opt) => el("option", { value: opt.value, selected: opt.value === value ? "selected" : undefined }, opt.label))
        );
      } else if (field.type === "array-csv") {
        inputNode = el("input", { type: "text", value: (value || []).join(", ") });
      } else {
        inputNode = el("input", { type: field.type === "number" ? "number" : "text", value: value ?? "" });
      }
      inputs[field.key] = inputNode;
      form.appendChild(
        singletonRow(field.label, field.type === "checkbox" ? el("div", {}, [inputNode, el("span", { style: "margin-left:8px" }, field.hint || "")]) : inputNode)
      );
      if (field.hint && field.type !== "checkbox") {
        form.lastChild.appendChild(el("div", { style: "font-size:.78rem;color:var(--text-muted);margin-top:-8px" }, field.hint));
      }
    });

    const saveBtn = el("button", { class: "btn btn-primary" }, saveLabel || "Save");
    const savedNote = el("span", { style: "margin-left:12px;color:var(--brand);font-size:.85rem" }, "");
    saveBtn.addEventListener("click", async () => {
      const patch = {};
      fields.forEach((field) => {
        const node = inputs[field.key];
        if (field.type === "checkbox") patch[field.key] = node.checked;
        else if (field.type === "number") patch[field.key] = parseFloat(node.value) || 0;
        else if (field.type === "array-csv") patch[field.key] = parseList(node.value);
        else patch[field.key] = node.value;
      });
      await updateFn(patch);
      savedNote.textContent = "Saved ✓";
      setTimeout(() => (savedNote.textContent = ""), 2000);
    });
    form.appendChild(el("div", { class: "form-actions", style: "justify-content:flex-start" }, [saveBtn, savedNote]));

    mount.innerHTML = "";
    mount.appendChild(form);
  }

  function renderSettingsForm() {
    return renderSingletonForm({
      containerId: "settingsForm",
      getFn: D.getSettings,
      updateFn: D.updateSettings,
      fields: [
        { key: "resortName", label: "Resort name", type: "text" },
        { key: "tagline", label: "Tagline", type: "text" },
        { key: "heroTitle", label: "Homepage hero title", type: "text" },
        { key: "heroSubtitle", label: "Homepage hero subtitle", type: "textarea" },
        { key: "contactPhone", label: "Contact phone", type: "text" },
        { key: "contactEmail", label: "Contact email", type: "text" },
        { key: "contactAddress", label: "Contact address", type: "textarea" },
        { key: "facebookUrl", label: "Facebook page URL (optional)", type: "text" },
        {
          key: "bookingUrl",
          label: "Booking site URL",
          type: "text",
          hint: "Every \"Book Now\" button/link on the site (and the concierge chat's booking button) sends guests here instead of a built-in form.",
        },
        {
          key: "offerDayTour",
          label: "Offer day tours",
          type: "checkbox",
          hint: "Off = day tour pricing/booking option is hidden site-wide (per-accommodation day tour rates in the Rates tab are kept, just hidden, so you can turn this back on later without re-entering them).",
        },
      ],
    });
  }

  function renderPoliciesForm() {
    return renderSingletonForm({
      containerId: "policiesForm",
      getFn: D.getPolicies,
      updateFn: D.updatePolicies,
      fields: [
        { key: "checkinTime", label: "Check-in time", type: "text" },
        { key: "checkoutTime", label: "Check-out time", type: "text" },
        { key: "daytourEnd", label: "Day tour end time", type: "text" },
        { key: "downpaymentNonRefundable", label: "Downpayment is non-refundable", type: "checkbox" },
        { key: "rebookWindowDaysBeforeCheckin", label: "Rebooking notice required (days before check-in)", type: "number" },
        { key: "rebookValidMonths", label: "Rebooking valid for (months)", type: "number" },
        { key: "petsAllowed", label: "Pets allowed", type: "checkbox" },
        { key: "petPolicy", label: "Pet policy text", type: "textarea" },
        { key: "idRequirements", label: "ID requirements text", type: "textarea" },
        { key: "gcashNumber", label: "GCash number", type: "text" },
        { key: "paymentChannels", label: "Payment channels (comma separated)", type: "array-csv" },
        { key: "extraGuestFeeOvernight", label: "Extra guest fee — overnight (₱)", type: "number" },
        { key: "extraGuestFeeDaytour", label: "Extra guest fee — day tour (₱)", type: "number" },
        { key: "policyText", label: "Full cancellation/rebooking/weather policy (shown to guests)", type: "textarea", rows: 10 },
      ],
    });
  }

  function renderAiForm() {
    return renderSingletonForm({
      containerId: "aiForm",
      getFn: D.getAiSettings,
      updateFn: D.updateAiSettings,
      fields: [
        { key: "enabled", label: "Enable live AI", type: "checkbox", hint: "Off = FAQ engine only (Phase 1 behavior)" },
        {
          key: "mode",
          label: "Mode",
          type: "select",
          options: [
            { value: "local-first", label: "Local first, AI fallback (recommended)" },
            { value: "always-ai", label: "Always use AI" },
            { value: "local-only", label: "Local only (AI off even if enabled)" },
          ],
        },
        { key: "proxyUrl", label: "Proxy URL", type: "text", hint: "Your deployed Cloudflare Worker URL — see server/README.md. The API key never lives here." },
        { key: "systemPromptOverride", label: "Custom system prompt (optional)", type: "textarea", hint: "Leave blank to use the built-in Enoki AI persona + knowledge-base grounding." },
      ],
    });
  }

  function renderSecurityForm() {
    const mount = document.getElementById("securityForm");
    const form = el("div", { class: "settings-form" });
    const newPw = el("input", { type: "password", autocomplete: "new-password" });
    const confirmPw = el("input", { type: "password", autocomplete: "new-password" });
    form.appendChild(singletonRow("New password", newPw));
    form.appendChild(singletonRow("Confirm new password", confirmPw));

    const saveBtn = el("button", { class: "btn btn-primary" }, "Change password");
    const note = el("span", { style: "margin-left:12px;font-size:.85rem" }, "");
    saveBtn.addEventListener("click", async () => {
      note.style.color = "#c0392b";
      if (!newPw.value || newPw.value.length < 6) {
        note.textContent = "Password must be at least 6 characters.";
        return;
      }
      if (newPw.value !== confirmPw.value) {
        note.textContent = "Passwords don't match.";
        return;
      }
      const hash = await sha256Hex(newPw.value);
      await window.CampEnokiData.updateAdminAuth({ passwordHash: hash });
      newPw.value = "";
      confirmPw.value = "";
      note.style.color = "var(--brand)";
      note.textContent = "Password changed ✓";
      setTimeout(() => (note.textContent = ""), 3000);
    });
    form.appendChild(el("div", { class: "form-actions", style: "justify-content:flex-start" }, [saveBtn, note]));

    mount.innerHTML = "";
    mount.appendChild(form);
  }

  // ===================================================================
  // Publish: commits the current merged content straight to the site's
  // GitHub repo, so it goes live for every visitor instead of sitting in
  // this one browser's localStorage. Uses a GitHub Personal Access Token
  // the user generates and pastes in themselves — stored only in this
  // browser's localStorage, sent only to api.github.com, never bundled
  // into any export/content flow.
  // ===================================================================
  const PUBLISH_CONFIG_KEY = "ce_publish_config";

  function getPublishConfig() {
    try {
      return JSON.parse(localStorage.getItem(PUBLISH_CONFIG_KEY)) || {};
    } catch {
      return {};
    }
  }

  function savePublishConfig(cfg) {
    localStorage.setItem(PUBLISH_CONFIG_KEY, JSON.stringify(cfg));
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }

  const PUBLISH_TARGETS = [
    { path: "data/settings.json", getFn: () => D.getSettings(), resetFn: D.resetSettingsOverlay },
    { path: "data/policies.json", getFn: () => D.getPolicies(), resetFn: D.resetPoliciesOverlay },
    { path: "data/ai-settings.json", getFn: () => D.getAiSettings(), resetFn: D.resetAiSettingsOverlay },
    { path: "data/admin-auth.json", getFn: () => D.getAdminAuth(), resetFn: D.resetAdminAuthOverlay },
    { path: "data/rates.json", getFn: () => D.getRates(), resetFn: D.resetRatesOverlay },
    { path: "data/amenities.json", getFn: () => D.getAmenities(), resetFn: D.resetAmenitiesOverlay },
    { path: "data/attractions.json", getFn: () => D.getAttractions(), resetFn: D.resetAttractionsOverlay },
    { path: "data/reviews.json", getFn: () => D.getReviews(), resetFn: D.resetReviewsOverlay },
    { path: "data/media.json", getFn: () => D.getMediaItems(), resetFn: D.resetMediaOverlay },
    { path: "data/faq.json", getFn: () => D.getFaqs(), resetFn: D.resetFaqOverlay },
  ];

  /** Reads the file's current sha (required by GitHub to update it), then
   *  writes the new content. A 404 on the GET means the file doesn't exist
   *  yet, so we create it (no sha needed). */
  async function publishOneFile(cfg, target, content) {
    const base = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${target.path}`;
    const headers = { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json" };

    let sha;
    const getRes = await fetch(`${base}?ref=${encodeURIComponent(cfg.branch)}`, { headers });
    if (getRes.ok) {
      sha = (await getRes.json()).sha;
    } else if (getRes.status !== 404) {
      throw new Error(`Couldn't read ${target.path} (${getRes.status})`);
    }

    const putRes = await fetch(base, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Publish content update from Admin (${target.path})`,
        content: utf8ToBase64(content),
        branch: cfg.branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!putRes.ok) {
      const detail = await putRes.json().catch(() => ({}));
      throw new Error(`Failed to publish ${target.path}: ${detail.message || putRes.status}`);
    }
  }

  function renderPublishForm() {
    const mount = document.getElementById("publishForm");
    const cfg = getPublishConfig();
    const form = el("div", { class: "settings-form" });

    const ownerInput = el("input", { type: "text", value: cfg.owner || "campenoki-ai", placeholder: "GitHub username/org" });
    const repoInput = el("input", { type: "text", value: cfg.repo || "camp-enoki-concierge", placeholder: "repo name" });
    const branchInput = el("input", { type: "text", value: cfg.branch || "main", placeholder: "main" });
    const tokenInput = el("input", { type: "password", value: cfg.token || "", autocomplete: "off", placeholder: "github_pat_..." });

    form.appendChild(singletonRow("GitHub repo owner", ownerInput));
    form.appendChild(singletonRow("Repo name", repoInput));
    form.appendChild(singletonRow("Branch", branchInput));
    form.appendChild(
      singletonRow(
        "Personal Access Token",
        el("div", {}, [
          tokenInput,
          el(
            "div",
            { style: "font-size:.78rem;color:var(--text-muted);margin-top:6px" },
            'Generate at github.com -> Settings -> Developer settings -> Fine-grained tokens. Scope it to ONLY this repo, permission "Contents: Read and write". Treat it like a password — anyone with access to this browser could read it from local storage.'
          ),
        ])
      )
    );

    const saveConfigBtn = el("button", { class: "btn btn-outline" }, "Save Connection");
    saveConfigBtn.addEventListener("click", () => {
      savePublishConfig({ owner: ownerInput.value.trim(), repo: repoInput.value.trim(), branch: branchInput.value.trim() || "main", token: tokenInput.value.trim() });
      configNote.textContent = "Connection saved ✓";
      configNote.style.color = "var(--brand)";
      setTimeout(() => (configNote.textContent = ""), 2500);
    });
    const configNote = el("span", { style: "margin-left:12px;font-size:.85rem" }, "");
    form.appendChild(el("div", { class: "form-actions", style: "justify-content:flex-start" }, [saveConfigBtn, configNote]));

    const log = el("div", { class: "admin-table-wrap", style: "padding:14px;font-family:ui-monospace,monospace;font-size:.82rem;max-height:260px;overflow-y:auto;margin-top:18px" }, "Not published yet this session.");
    const publishBtn = el("button", { class: "btn btn-primary", style: "margin-top:6px" }, "Publish to Live Site");
    publishBtn.addEventListener("click", async () => {
      const current = getPublishConfig();
      if (!current.owner || !current.repo || !current.token) {
        alert("Fill in and save the GitHub connection details above first.");
        return;
      }
      publishBtn.disabled = true;
      publishBtn.textContent = "Publishing...";
      log.innerHTML = "";
      const lines = [];
      const addLine = (text) => {
        lines.push(text);
        log.innerText = lines.join("\n");
        log.scrollTop = log.scrollHeight;
      };

      let successCount = 0;
      for (const target of PUBLISH_TARGETS) {
        try {
          addLine(`Publishing ${target.path}...`);
          const data = await target.getFn();
          await publishOneFile(current, target, JSON.stringify(data, null, 2));
          if (target.resetFn) target.resetFn();
          addLine(`  done.`);
          successCount++;
        } catch (e) {
          addLine(`  FAILED: ${e.message}`);
        }
      }
      addLine(
        successCount === PUBLISH_TARGETS.length
          ? `\nAll ${successCount} files published. GitHub Pages will rebuild in about a minute — then it's live for everyone.`
          : `\n${successCount}/${PUBLISH_TARGETS.length} files published. Check the FAILED lines above (usually a token permission or repo-name issue).`
      );
      publishBtn.disabled = false;
      publishBtn.textContent = "Publish to Live Site";
    });

    mount.innerHTML = "";
    mount.appendChild(form);
    mount.appendChild(publishBtn);
    mount.appendChild(log);
  }

  // ===================================================================
  // Bookings / Unanswered (read-only, unchanged from Phase 1)
  // ===================================================================
  function renderBookings() {
    const body = document.getElementById("bookingTableBody");
    body.innerHTML = "";
    const bookings = window.CampEnokiData.getBookings();
    if (!bookings.length) {
      body.appendChild(el("tr", {}, el("td", { colspan: "9", class: "admin-empty" }, "No booking requests yet.")));
      return;
    }
    bookings.forEach((b) => {
      body.appendChild(
        el("tr", {}, [
          el("td", {}, b.id),
          el("td", {}, b.name || "—"),
          el("td", {}, b.mobile || "—"),
          el("td", {}, b.date || "—"),
          el("td", {}, b.stayType === "overnight" ? "Overnight" : "Day Tour"),
          el("td", {}, `${b.adults}A / ${b.children}C`),
          el("td", {}, b.pets === "yes" ? b.petNotes || "Yes" : "No"),
          el("td", {}, b.requests || "—"),
        ])
      );
    });
  }

  function renderUnanswered() {
    const body = document.getElementById("unansweredTableBody");
    body.innerHTML = "";
    const list = window.CampEnokiData.getUnanswered();
    if (!list.length) {
      body.appendChild(el("tr", {}, el("td", { colspan: "2", class: "admin-empty" }, "No unanswered questions logged.")));
      return;
    }
    list.forEach((u) => {
      body.appendChild(el("tr", {}, [el("td", {}, u.question), el("td", {}, new Date(u.at).toLocaleString())]));
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initLogout();
    initAuthGate(async () => {
      initTabs();
      initFaqToolbar();
      refreshFaqs();
      initSections();
      renderSettingsForm();
      renderPoliciesForm();
      renderAiForm();
      renderSecurityForm();
      renderPublishForm();
      renderBookings();
      renderUnanswered();
    });
  });
})();
