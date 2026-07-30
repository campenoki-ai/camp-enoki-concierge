/**
 * main.js
 * Renders the static content sections (amenities, rates, gallery, attractions,
 * reviews) from the JSON data files, and wires up theme toggle / mobile nav /
 * "Book Now" buttons. Independent of the chat/AI/booking modules — those
 * only need the DOM ids this file creates.
 */
(function () {
  const THEME_KEY = "ce_theme";

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

  /** Google Drive doesn't serve a directly-streamable file URL for <video src>,
   *  it needs its own embedded player frame — a plain <video> tag just 404s. */
  function isDriveUrl(src) {
    return /drive\.google\.com/.test(src || "");
  }

  function mediaEl(m) {
    if (m.type === "video" && isDriveUrl(m.src)) {
      return el("iframe", { src: m.src, allow: "autoplay", allowfullscreen: "true", frameborder: "0", class: "gallery-video-frame" });
    }
    if (m.type === "video") {
      return el("video", { src: m.src, controls: "controls" });
    }
    return el("img", { src: m.src, alt: m.caption || "" });
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    const toggle = document.getElementById("themeToggle");
    if (!toggle) return;
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

  function initMobileNav() {
    const toggle = document.getElementById("navToggle");
    const links = document.getElementById("navLinks");
    if (!toggle || !links) return;
    toggle.addEventListener("click", () => links.classList.toggle("open"));
    links.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => links.classList.remove("open")));
  }

  function initBookButtons() {
    document.querySelectorAll("[data-open-booking]").forEach((btn) => {
      btn.addEventListener("click", () => window.CampEnokiBooking?.open());
    });
  }

  async function renderAmenities() {
    const mount = document.getElementById("amenitiesGrid");
    if (!mount) return;
    const items = await window.CampEnokiData.getAmenities();
    mount.innerHTML = "";
    items.forEach((a) => {
      mount.appendChild(
        el("div", { class: "card amenity-card" }, [el("div", { class: "amenity-icon" }, a.icon), el("h3", {}, a.name), el("p", {}, a.description)])
      );
    });
  }

  const RATE_DESCRIPTION_CLAMP = 220;

  /** Renders a rate's description with real line breaks (if the admin used any)
   *  and a "Show more" toggle for long promo-style text, so one chatty rate
   *  card doesn't tower over its neighbors in the grid. */
  function renderRateDescription(text) {
    if (!text) return null;
    const wrap = el("div", { class: "rate-desc" });
    const body = el("p", { class: "rate-desc-text" }, text);
    wrap.appendChild(body);
    if (text.length > RATE_DESCRIPTION_CLAMP) {
      body.classList.add("clamped");
      const toggle = el("button", { class: "rate-desc-toggle", type: "button" }, "Show more");
      toggle.addEventListener("click", () => {
        const expanded = body.classList.toggle("clamped") === false;
        toggle.textContent = expanded ? "Show less" : "Show more";
      });
      wrap.appendChild(toggle);
    }
    return wrap;
  }

  async function renderRates() {
    const mount = document.getElementById("ratesGrid");
    if (!mount) return;
    const [rates, mediaList, settings] = await Promise.all([
      window.CampEnokiData.getRates(),
      window.CampEnokiData.getMediaItems(),
      window.CampEnokiData.getSettings(),
    ]);
    const media = Object.fromEntries(mediaList.map((m) => [m.id, m]));
    mount.innerHTML = "";
    mount.className = "grid grid-auto";
    rates.forEach((r) => {
      // r.image is normally a Media-tab id (looked up below), but Admin's Rates
      // photo field also accepts a direct upload/URL — fall back to using it as-is.
      const imgSrc = media[r.image]?.src || (r.image && r.image !== "" ? r.image : null);
      const meta = settings.offerDayTour
        ? `Day tour: ₱${r.daytour.toLocaleString()} · Good for ${r.capacity} pax · +₱${r.extraPaxFee}/extra pax`
        : `Good for ${r.capacity} pax · +₱${r.extraPaxFee}/extra pax`;
      mount.appendChild(
        el("div", { class: "card rate-card" }, [
          imgSrc ? el("img", { src: imgSrc, alt: r.name }) : null,
          el("h3", {}, r.name),
          el("div", { class: "price" }, [`₱${r.overnight.toLocaleString()} `, el("small", {}, "/ night")]),
          el("div", { class: "meta" }, meta),
          renderRateDescription(r.description),
        ])
      );
    });
  }

  async function renderGallery() {
    const tabsMount = document.getElementById("galleryTabs");
    const gridMount = document.getElementById("galleryGrid");
    if (!tabsMount || !gridMount) return;
    const mediaList = await window.CampEnokiData.getMediaItems();

    // Group media items by category (order of first appearance) instead of a separate gallery.json.
    const categories = [];
    const byCategory = new Map();
    mediaList.forEach((m) => {
      const cat = m.category || "Other";
      if (!byCategory.has(cat)) {
        byCategory.set(cat, []);
        categories.push(cat);
      }
      byCategory.get(cat).push(m);
    });

    function renderGrid(items) {
      gridMount.innerHTML = "";
      items.forEach((m) => {
        gridMount.appendChild(el("figure", { class: "gallery-item" }, [mediaEl(m)]));
      });
    }

    tabsMount.innerHTML = "";
    categories.forEach((cat, idx) => {
      const tab = el("button", { class: "gallery-tab" + (idx === 0 ? " active" : ""), type: "button" }, cat);
      tab.addEventListener("click", () => {
        tabsMount.querySelectorAll(".gallery-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        renderGrid(byCategory.get(cat));
      });
      tabsMount.appendChild(tab);
    });
    if (categories[0]) renderGrid(byCategory.get(categories[0]));
  }

  async function renderAttractions() {
    const mount = document.getElementById("attractionsGrid");
    if (!mount) return;
    const items = await window.CampEnokiData.getAttractions();
    mount.innerHTML = "";
    items.forEach((a) => {
      mount.appendChild(
        el("div", { class: "card attraction-card" }, [
          el("div", { class: "card-body" }, [el("h3", {}, a.name), el("span", { class: "distance" }, a.distance), el("p", {}, a.description)]),
        ])
      );
    });
  }

  async function renderReviews() {
    const mount = document.getElementById("reviewsGrid");
    if (!mount) return;
    const items = await window.CampEnokiData.getReviews();
    mount.innerHTML = "";
    items.forEach((r) => {
      mount.appendChild(
        el("div", { class: "card review-card" }, [
          el("div", { class: "card-body" }, [
            el("div", { class: "review-stars" }, "★".repeat(r.rating) + "☆".repeat(5 - r.rating)),
            el("p", {}, `"${r.comment}"`),
            el("div", { class: "review-name" }, r.name),
            el("div", { class: "review-date" }, r.date),
          ]),
        ])
      );
    });
  }

  function setYear() {
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  }

  function setText(id, text) {
    const node = document.getElementById(id);
    if (node && text) node.textContent = text;
  }

  async function renderSettings() {
    const s = await window.CampEnokiData.getSettings();
    setText("brandName", s.resortName);
    setText("heroTitle", s.heroTitle);
    setText("heroSubtitle", s.heroSubtitle);
    setText("footerResortName", s.resortName);
    setText(
      "ratesSubtitle",
      s.offerDayTour
        ? "Choose overnight or day tour. A downpayment confirms your booking (non-refundable — see our cancellation policy)."
        : "Overnight stays only. A downpayment confirms your booking (non-refundable — see our cancellation policy)."
    );
    if (s.contactAddress) document.getElementById("contactAddress").innerHTML = s.contactAddress.replace(/\n/g, "<br />");
    setText("contactPhone", s.contactPhone);
    setText("contactEmail", s.contactEmail);
    document.title = `${s.resortName} — Nature Resort & Getaway`;
    if (s.facebookUrl) {
      document.getElementById("contactFacebookItem").classList.remove("hidden");
      document.getElementById("contactFacebookLink").href = s.facebookUrl;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initMobileNav();
    initBookButtons();
    renderSettings();
    renderAmenities();
    renderRates();
    renderGallery();
    renderAttractions();
    renderReviews();
    setYear();
  });
})();
