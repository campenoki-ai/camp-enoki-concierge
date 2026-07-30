/**
 * booking-wizard.js
 * Multi-step booking request form. No payments — just collects the request
 * and saves it via CampEnokiData.saveBooking(), which is the single seam to
 * swap for a real backend/API later without touching this UI.
 */
(function (global) {
  const TOTAL_STEPS = 4;
  let overlayEl, boxEl;
  let step = 1;
  let state = defaultState();

  function defaultState() {
    return {
      date: "",
      stayType: "overnight",
      adults: 2,
      children: 0,
      pets: "no",
      petNotes: "",
      name: "",
      mobile: "",
      requests: "",
    };
  }

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

  function stepsIndicator() {
    const wrap = el("div", { class: "steps-indicator" });
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      wrap.appendChild(el("span", { class: i <= step ? "active" : "" }));
    }
    return wrap;
  }

  function fieldRow(labelText, inputEl) {
    return el("div", { class: "form-row" }, [el("label", {}, labelText), inputEl]);
  }

  function renderStep1() {
    const dateInput = el("input", { type: "date", value: state.date });
    dateInput.addEventListener("input", (e) => (state.date = e.target.value));

    const overnightRadio = el("input", { type: "radio", name: "stayType", value: "overnight" });
    overnightRadio.checked = state.stayType === "overnight";
    overnightRadio.addEventListener("change", () => (state.stayType = "overnight"));
    const daytourRadio = el("input", { type: "radio", name: "stayType", value: "daytour" });
    daytourRadio.checked = state.stayType === "daytour";
    daytourRadio.addEventListener("change", () => (state.stayType = "daytour"));

    const toggle = el("div", { class: "pill-toggle" }, [
      el("label", {}, [overnightRadio, el("span", {}, "Overnight")]),
      el("label", {}, [daytourRadio, el("span", {}, "Day Tour")]),
    ]);

    return [fieldRow("Preferred date", dateInput), fieldRow("Stay type", toggle)];
  }

  function numberField(labelText, key, min = 0) {
    const input = el("input", { type: "number", min: String(min), value: String(state[key]) });
    input.addEventListener("input", (e) => (state[key] = Math.max(min, parseInt(e.target.value, 10) || min)));
    return fieldRow(labelText, input);
  }

  function renderStep2() {
    const yesRadio = el("input", { type: "radio", name: "pets", value: "yes" });
    yesRadio.checked = state.pets === "yes";
    yesRadio.addEventListener("change", () => {
      state.pets = "yes";
      renderBody();
    });
    const noRadio = el("input", { type: "radio", name: "pets", value: "no" });
    noRadio.checked = state.pets === "no";
    noRadio.addEventListener("change", () => {
      state.pets = "no";
      renderBody();
    });
    const petsToggle = el("div", { class: "pill-toggle" }, [
      el("label", {}, [noRadio, el("span", {}, "No pets")]),
      el("label", {}, [yesRadio, el("span", {}, "Bringing pet(s)")]),
    ]);

    const rows = [
      el("div", { class: "form-row-2" }, [numberField("Adults", "adults", 1), numberField("Children", "children", 0)]),
      fieldRow("Pets", petsToggle),
    ];

    if (state.pets === "yes") {
      const petNotes = el("input", { type: "text", placeholder: "e.g. 1 small dog", value: state.petNotes });
      petNotes.addEventListener("input", (e) => (state.petNotes = e.target.value));
      rows.push(fieldRow("Pet details", petNotes));
    }
    return rows;
  }

  function renderStep3() {
    const nameInput = el("input", { type: "text", placeholder: "Juan Dela Cruz", value: state.name });
    nameInput.addEventListener("input", (e) => (state.name = e.target.value));
    const mobileInput = el("input", { type: "tel", placeholder: "09XX XXX XXXX", value: state.mobile });
    mobileInput.addEventListener("input", (e) => (state.mobile = e.target.value));
    const requestsInput = el("textarea", { placeholder: "Anything else we should know?" }, state.requests);
    requestsInput.value = state.requests;
    requestsInput.addEventListener("input", (e) => (state.requests = e.target.value));

    return [fieldRow("Guest name", nameInput), fieldRow("Mobile number", mobileInput), fieldRow("Special requests", requestsInput)];
  }

  function renderStep4() {
    const summary = el("div", { class: "booking-summary" }, [
      el("div", {}, [el("span", {}, "Date"), el("strong", {}, state.date || "—")]),
      el("div", {}, [el("span", {}, "Stay type"), el("strong", {}, state.stayType === "overnight" ? "Overnight" : "Day Tour")]),
      el("div", {}, [el("span", {}, "Adults"), el("strong", {}, String(state.adults))]),
      el("div", {}, [el("span", {}, "Children"), el("strong", {}, String(state.children))]),
      el("div", {}, [el("span", {}, "Pets"), el("strong", {}, state.pets === "yes" ? state.petNotes || "Yes" : "No")]),
      el("div", {}, [el("span", {}, "Name"), el("strong", {}, state.name || "—")]),
      el("div", {}, [el("span", {}, "Mobile"), el("strong", {}, state.mobile || "—")]),
    ]);
    return [summary];
  }

  function isStepValid() {
    if (step === 1) return !!state.date;
    if (step === 3) return !!state.name.trim() && !!state.mobile.trim();
    return true;
  }

  function renderBody() {
    boxEl.innerHTML = "";
    const closeX = el("button", { class: "modal-close-x", type: "button", "aria-label": "Close" }, "×");
    closeX.addEventListener("click", close);
    boxEl.appendChild(closeX);
    boxEl.appendChild(el("h2", {}, "Book Your Stay"));
    boxEl.appendChild(el("p", { style: "color:var(--text-muted);margin:0 0 4px;font-size:.9rem" }, `Step ${step} of ${TOTAL_STEPS}`));
    boxEl.appendChild(stepsIndicator());

    const form = el("div", {});
    const rows = { 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4 }[step]();
    rows.forEach((r) => form.appendChild(r));
    boxEl.appendChild(form);

    const backBtn = el("button", { class: "btn btn-ghost", type: "button" }, "Back");
    backBtn.disabled = step === 1;
    backBtn.addEventListener("click", () => {
      step = Math.max(1, step - 1);
      renderBody();
    });

    const nextBtn = el("button", { class: "btn btn-primary", type: "button" }, step === TOTAL_STEPS ? "Submit Request" : "Next");
    nextBtn.addEventListener("click", () => {
      if (!isStepValid()) {
        nextBtn.insertAdjacentHTML(
          "beforebegin",
          '<div style="color:#c0392b;font-size:.82rem;margin-right:auto;align-self:center">Please fill in the required fields.</div>'
        );
        return;
      }
      if (step === TOTAL_STEPS) {
        submit();
      } else {
        step++;
        renderBody();
      }
    });

    boxEl.appendChild(el("div", { class: "form-actions" }, [backBtn, nextBtn]));
  }

  function submit() {
    const saved = global.CampEnokiData.saveBooking({ ...state });
    boxEl.innerHTML = "";
    const closeX = el("button", { class: "modal-close-x", type: "button", "aria-label": "Close" }, "×");
    closeX.addEventListener("click", close);
    boxEl.appendChild(closeX);
    boxEl.appendChild(
      el("div", { class: "booking-success" }, [
        el("div", { class: "icon" }, "🌿"),
        el("h2", {}, "Request Sent!"),
        el("p", { style: "color:var(--text-muted)" }, `Thanks, ${state.name || "guest"}! Our staff will reach out to ${state.mobile} to confirm availability and payment.`),
        el("p", { style: "font-size:.8rem;color:var(--text-muted)" }, `Reference: ${saved.id}`),
        (() => {
          const btn = el("button", { class: "btn btn-primary btn-block" }, "Done");
          btn.addEventListener("click", close);
          return btn;
        })(),
      ])
    );
  }

  function open() {
    state = defaultState();
    step = 1;
    overlayEl.classList.add("open");
    renderBody();
  }

  function close() {
    overlayEl.classList.remove("open");
  }

  function build() {
    boxEl = el("div", { class: "modal-box" });
    overlayEl = el("div", { class: "modal-overlay" }, [boxEl]);
    overlayEl.addEventListener("click", (e) => {
      if (e.target === overlayEl) close();
    });
    document.body.appendChild(overlayEl);
  }

  document.addEventListener("DOMContentLoaded", build);

  global.CampEnokiBooking = { open, close };
})(window);
