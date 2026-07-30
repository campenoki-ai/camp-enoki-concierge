/**
 * data-store.js
 * Loads the static JSON knowledge base and layers a localStorage "overlay"
 * on top of each data/*.json file so Admin Mode can add/edit/delete entries
 * without a backend. Export downloads the merged result so it can be
 * committed back into the data/ files when ready.
 */
(function (global) {
  const FILES = {
    faq: "data/faq.json",
    rates: "data/rates.json",
    amenities: "data/amenities.json",
    policies: "data/policies.json",
    reviews: "data/reviews.json",
    attractions: "data/attractions.json",
    media: "data/media.json",
    settings: "data/settings.json",
    aiSettings: "data/ai-settings.json",
    adminAuth: "data/admin-auth.json",
    galleryFolders: "data/gallery-folders.json",
  };

  const LS_FAQ_OVERLAY = "ce_faq_overlay";
  const LS_BOOKINGS = "ce_bookings";
  const LS_UNANSWERED = "ce_unanswered";

  const cache = {};

  async function load(name) {
    if (cache[name]) return cache[name];
    const path = FILES[name];
    if (!path) throw new Error(`Unknown data file: ${name}`);
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    const json = await res.json();
    cache[name] = json;
    return json;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn("data-store: failed to read", key, e);
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function emptyOverlay() {
    return { added: [], edited: {}, deleted: [] };
  }

  function getOverlay() {
    return readJson(LS_FAQ_OVERLAY, emptyOverlay());
  }

  function setOverlay(overlay) {
    writeJson(LS_FAQ_OVERLAY, overlay);
  }

  /** Merged FAQ list = base data/faq.json + overlay (added/edited/deleted). */
  async function getFaqs() {
    const base = await load("faq");
    const overlay = getOverlay();
    const deleted = new Set(overlay.deleted);
    const merged = base
      .filter((f) => !deleted.has(f.id))
      .map((f) => (overlay.edited[f.id] ? { ...f, ...overlay.edited[f.id] } : f));
    const addedFiltered = overlay.added.filter((f) => !deleted.has(f.id));
    return [...merged, ...addedFiltered];
  }

  function nextFaqId() {
    return "faq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function addFaq(entry) {
    const overlay = getOverlay();
    const withId = { priority: 5, keywords: [], images: [], videos: [], buttons: [], language: "auto", ...entry, id: entry.id || nextFaqId() };
    overlay.added.push(withId);
    setOverlay(overlay);
    return withId;
  }

  async function updateFaq(id, patch) {
    const base = await load("faq");
    const overlay = getOverlay();
    const isBase = base.some((f) => f.id === id);
    if (isBase) {
      overlay.edited[id] = { ...(overlay.edited[id] || {}), ...patch };
    } else {
      const idx = overlay.added.findIndex((f) => f.id === id);
      if (idx >= 0) overlay.added[idx] = { ...overlay.added[idx], ...patch };
    }
    setOverlay(overlay);
  }

  async function deleteFaq(id) {
    const overlay = getOverlay();
    const addedIdx = overlay.added.findIndex((f) => f.id === id);
    if (addedIdx >= 0) {
      overlay.added.splice(addedIdx, 1);
    } else if (!overlay.deleted.includes(id)) {
      overlay.deleted.push(id);
    }
    setOverlay(overlay);
  }

  async function exportFaqJson() {
    const faqs = await getFaqs();
    return JSON.stringify(faqs, null, 2);
  }

  /** mode: 'replace' clears the overlay and re-seeds via 'added' entries so
   *  the imported set becomes the full list; 'merge' just adds/updates by id. */
  async function importFaqJson(list, mode = "merge") {
    if (!Array.isArray(list)) throw new Error("Import must be a JSON array of FAQ entries");
    if (mode === "replace") {
      const base = await load("faq");
      setOverlay({
        added: list.filter((f) => !base.some((b) => b.id === f.id)),
        edited: Object.fromEntries(list.filter((f) => base.some((b) => b.id === f.id)).map((f) => [f.id, f])),
        deleted: base.map((f) => f.id).filter((id) => !list.some((f) => f.id === id)),
      });
    } else {
      for (const entry of list) {
        const id = entry.id || nextFaqId();
        const existing = (await getFaqs()).find((f) => f.id === id);
        if (existing) await updateFaq(id, entry);
        else await addFaq({ ...entry, id });
      }
    }
  }

  function resetFaqOverlay() {
    setOverlay(emptyOverlay());
  }

  /**
   * Generic list-collection store: same added/edited/deleted overlay pattern
   * as FAQ above, parameterized over a data-file name + id prefix. Used for
   * every other "list of records" content type (rates, amenities, etc.) so
   * Admin Mode can CRUD them without a backend, same as FAQ.
   */
  function makeListStore(name, idPrefix) {
    const lsKey = `ce_${name}_overlay`;

    function overlay() {
      return readJson(lsKey, emptyOverlay());
    }
    function saveOverlay(o) {
      writeJson(lsKey, o);
    }
    function nextId() {
      return `${idPrefix}-` + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    async function getAll() {
      const base = await load(name);
      const o = overlay();
      const deleted = new Set(o.deleted);
      const merged = base.filter((item) => !deleted.has(item.id)).map((item) => (o.edited[item.id] ? { ...item, ...o.edited[item.id] } : item));
      const addedFiltered = o.added.filter((item) => !deleted.has(item.id));
      return [...merged, ...addedFiltered];
    }

    async function add(item) {
      const o = overlay();
      const withId = { ...item, id: item.id || nextId() };
      o.added.push(withId);
      saveOverlay(o);
      return withId;
    }

    async function update(id, patch) {
      const base = await load(name);
      const o = overlay();
      if (base.some((item) => item.id === id)) {
        o.edited[id] = { ...(o.edited[id] || {}), ...patch };
      } else {
        const idx = o.added.findIndex((item) => item.id === id);
        if (idx >= 0) o.added[idx] = { ...o.added[idx], ...patch };
      }
      saveOverlay(o);
    }

    async function remove(id) {
      const o = overlay();
      const addedIdx = o.added.findIndex((item) => item.id === id);
      if (addedIdx >= 0) o.added.splice(addedIdx, 1);
      else if (!o.deleted.includes(id)) o.deleted.push(id);
      saveOverlay(o);
    }

    async function exportJson() {
      return JSON.stringify(await getAll(), null, 2);
    }

    async function importJson(list, mode = "merge") {
      if (!Array.isArray(list)) throw new Error("Import must be a JSON array");
      if (mode === "replace") {
        const base = await load(name);
        saveOverlay({
          added: list.filter((item) => !base.some((b) => b.id === item.id)),
          edited: Object.fromEntries(list.filter((item) => base.some((b) => b.id === item.id)).map((item) => [item.id, item])),
          deleted: base.map((item) => item.id).filter((id) => !list.some((item) => item.id === id)),
        });
      } else {
        for (const item of list) {
          const id = item.id || nextId();
          const existing = (await getAll()).find((x) => x.id === id);
          if (existing) await update(id, item);
          else await add({ ...item, id });
        }
      }
    }

    function resetOverlay() {
      saveOverlay(emptyOverlay());
    }

    return { getAll, add, update, remove, exportJson, importJson, resetOverlay };
  }

  /**
   * Generic singleton-config store (policies, site settings, AI settings):
   * a single shallow-merged patch overlay on top of the base JSON object.
   */
  function makeSingletonStore(name) {
    const lsKey = `ce_${name}_patch`;

    async function get() {
      const base = await load(name);
      const patch = readJson(lsKey, {});
      return { ...base, ...patch };
    }

    async function update(patch) {
      const current = readJson(lsKey, {});
      writeJson(lsKey, { ...current, ...patch });
      return get();
    }

    function resetOverlay() {
      localStorage.removeItem(lsKey);
    }

    return { get, update, resetOverlay };
  }

  const ratesStore = makeListStore("rates", "rate");
  const amenitiesStore = makeListStore("amenities", "amenity");
  const attractionsStore = makeListStore("attractions", "attraction");
  const reviewsStore = makeListStore("reviews", "review");
  const mediaStore = makeListStore("media", "media");
  const galleryFoldersStore = makeListStore("galleryFolders", "gfolder");
  const policiesStore = makeSingletonStore("policies");
  const settingsStore = makeSingletonStore("settings");
  const aiSettingsStore = makeSingletonStore("aiSettings");
  const adminAuthStore = makeSingletonStore("adminAuth");

  // ---- Bookings (localStorage now; swap for a real API later) ----
  function getBookings() {
    return readJson(LS_BOOKINGS, []);
  }

  function saveBooking(booking) {
    const list = getBookings();
    const withMeta = { ...booking, id: "bk-" + Date.now().toString(36), createdAt: new Date().toISOString() };
    list.unshift(withMeta);
    writeJson(LS_BOOKINGS, list);
    return withMeta;
  }

  // ---- Unanswered questions (for staff follow-up) ----
  function getUnanswered() {
    return readJson(LS_UNANSWERED, []);
  }

  function recordUnanswered(question) {
    const list = getUnanswered();
    list.unshift({ question, at: new Date().toISOString() });
    writeJson(LS_UNANSWERED, list.slice(0, 200));
  }

  function clearUnanswered() {
    writeJson(LS_UNANSWERED, []);
  }

  global.CampEnokiData = {
    load,
    // FAQ
    getFaqs,
    addFaq,
    updateFaq,
    deleteFaq,
    exportFaqJson,
    importFaqJson,
    resetFaqOverlay,
    // Rates
    getRates: ratesStore.getAll,
    addRate: ratesStore.add,
    updateRate: ratesStore.update,
    deleteRate: ratesStore.remove,
    exportRatesJson: ratesStore.exportJson,
    importRatesJson: ratesStore.importJson,
    resetRatesOverlay: ratesStore.resetOverlay,
    // Amenities
    getAmenities: amenitiesStore.getAll,
    addAmenity: amenitiesStore.add,
    updateAmenity: amenitiesStore.update,
    deleteAmenity: amenitiesStore.remove,
    exportAmenitiesJson: amenitiesStore.exportJson,
    importAmenitiesJson: amenitiesStore.importJson,
    resetAmenitiesOverlay: amenitiesStore.resetOverlay,
    // Attractions
    getAttractions: attractionsStore.getAll,
    addAttraction: attractionsStore.add,
    updateAttraction: attractionsStore.update,
    deleteAttraction: attractionsStore.remove,
    exportAttractionsJson: attractionsStore.exportJson,
    importAttractionsJson: attractionsStore.importJson,
    resetAttractionsOverlay: attractionsStore.resetOverlay,
    // Reviews
    getReviews: reviewsStore.getAll,
    addReview: reviewsStore.add,
    updateReview: reviewsStore.update,
    deleteReview: reviewsStore.remove,
    exportReviewsJson: reviewsStore.exportJson,
    importReviewsJson: reviewsStore.importJson,
    resetReviewsOverlay: reviewsStore.resetOverlay,
    // Media (gallery + FAQ image/video attachments)
    getMediaItems: mediaStore.getAll,
    addMediaItem: mediaStore.add,
    updateMediaItem: mediaStore.update,
    deleteMediaItem: mediaStore.remove,
    exportMediaJson: mediaStore.exportJson,
    importMediaJson: mediaStore.importJson,
    resetMediaOverlay: mediaStore.resetOverlay,
    // Gallery folders (Drive folder -> auto-populated gallery tab)
    getGalleryFolders: galleryFoldersStore.getAll,
    addGalleryFolder: galleryFoldersStore.add,
    updateGalleryFolder: galleryFoldersStore.update,
    deleteGalleryFolder: galleryFoldersStore.remove,
    exportGalleryFoldersJson: galleryFoldersStore.exportJson,
    importGalleryFoldersJson: galleryFoldersStore.importJson,
    resetGalleryFoldersOverlay: galleryFoldersStore.resetOverlay,
    // Policies / Settings / AI settings (singletons)
    getPolicies: policiesStore.get,
    updatePolicies: policiesStore.update,
    resetPoliciesOverlay: policiesStore.resetOverlay,
    getSettings: settingsStore.get,
    updateSettings: settingsStore.update,
    resetSettingsOverlay: settingsStore.resetOverlay,
    getAiSettings: aiSettingsStore.get,
    updateAiSettings: aiSettingsStore.update,
    resetAiSettingsOverlay: aiSettingsStore.resetOverlay,
    getAdminAuth: adminAuthStore.get,
    updateAdminAuth: adminAuthStore.update,
    resetAdminAuthOverlay: adminAuthStore.resetOverlay,
    // Bookings
    getBookings,
    saveBooking,
    // Unanswered questions
    getUnanswered,
    recordUnanswered,
    clearUnanswered,
  };
})(window);
