import { addDays, api, formatDate, todayIn } from "./api.js";

const $ = (sel) => document.querySelector(sel);
const els = {
  sizes: $("#sizes"),
  days: $("#days"),
  slots: $("#slots"),
  details: $("#step-details"),
  summary: $("#summary"),
  form: $("#booking"),
  submit: $("#submit"),
  error: $("#error"),
};

const state = { info: null, partySize: 2, date: null, time: null };
let availabilityRequest = 0;

const dayShort = new Intl.DateTimeFormat("es-ES", { weekday: "short", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" });

function chip({ label, pressed, disabled, onClick, className = "", html }) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `chip ${className}`;
  b.setAttribute("aria-pressed", String(pressed));
  b.disabled = Boolean(disabled);
  if (html) b.innerHTML = html;
  else b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function renderSizes() {
  els.sizes.replaceChildren(
    ...Array.from({ length: state.info.maxPartySize }, (_, i) => i + 1).map((n) =>
      chip({
        label: String(n),
        pressed: n === state.partySize,
        onClick: () => { state.partySize = n; state.time = null; renderSizes(); loadSlots(); },
      }),
    ),
  );
  els.sizes.lastChild?.setAttribute("aria-label", `${state.info.maxPartySize} personas`);
}

function renderDays() {
  const today = todayIn(state.info.timeZone);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  els.days.replaceChildren(
    ...days.map((iso, i) => {
      const d = new Date(`${iso}T00:00:00Z`);
      const closed = state.info.closedWeekdays.includes(d.getUTCDay());
      const top = i === 0 ? "hoy" : i === 1 ? "mañana" : dayShort.format(d);
      const b = chip({
        className: "chip--day",
        pressed: iso === state.date,
        disabled: closed,
        html: `<small>${top}</small><strong>${d.getUTCDate()}</strong><small>${monthShort.format(d)}</small>`,
        onClick: () => { state.date = iso; state.time = null; renderDays(); loadSlots(); },
      });
      b.setAttribute("aria-label", `${formatDate(iso)}${closed ? ", cerrado" : ""}`);
      return b;
    }),
  );
}

async function loadSlots() {
  updateSummary();
  if (!state.date) return;
  const request = ++availabilityRequest;
  els.slots.innerHTML = '<p class="slot-empty">Buscando mesas libres…</p>';
  try {
    const data = await api(`/availability?date=${state.date}&partySize=${state.partySize}`);
    if (request !== availabilityRequest) return; // llegó una respuesta más nueva
    renderSlots(data);
  } catch (err) {
    els.slots.innerHTML = "";
    const p = document.createElement("p");
    p.className = "error";
    p.textContent = err.message;
    els.slots.append(p);
  }
}

function renderSlots(data) {
  if (data.closed) {
    els.slots.innerHTML = '<p class="slot-empty">Ese día descansamos. Elige otro día.</p>';
    return;
  }
  const groups = data.services.map((service) => {
    const wrap = document.createElement("div");
    const h = document.createElement("h3");
    h.textContent = service.name;
    const list = document.createElement("div");
    list.className = "chips";
    const anyFree = service.slots.some((s) => s.available);
    if (!anyFree) {
      const p = document.createElement("p");
      p.className = "slot-empty";
      p.textContent = "No quedan mesas libres.";
      list.append(p);
    } else {
      list.append(
        ...service.slots.map((slot) =>
          chip({
            label: slot.time,
            pressed: slot.time === state.time,
            disabled: !slot.available,
            onClick: () => { state.time = slot.time; renderSlots(data); updateSummary(); $("#name").focus({ preventScroll: true }); },
          }),
        ),
      );
    }
    wrap.append(h, list);
    return wrap;
  });
  els.slots.replaceChildren(...groups);
}

function updateSummary() {
  const ready = Boolean(state.date && state.time);
  els.details.disabled = !ready;
  els.summary.textContent = ready
    ? `${state.partySize} ${state.partySize === 1 ? "persona" : "personas"}, ${formatDate(state.date)} a las ${state.time}.`
    : "Elige una hora para continuar.";
}

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.error.hidden = true;
  const form = new FormData(els.form);
  els.submit.disabled = true;
  els.submit.textContent = "Reservando…";
  try {
    const r = await api("/reservations", {
      method: "POST",
      body: {
        date: state.date,
        time: state.time,
        partySize: state.partySize,
        name: form.get("name"),
        phone: form.get("phone"),
        email: form.get("email"),
        notes: form.get("notes"),
      },
    });
    $("#done-code").textContent = r.code;
    $("#done-text").textContent = `Te esperamos el ${formatDate(r.date)} a las ${r.time}, ${r.partySize} ${r.partySize === 1 ? "persona" : "personas"} a nombre de ${r.name}.`;
    $('[data-view="form"]').hidden = true;
    $('[data-view="done"]').hidden = false;
  } catch (err) {
    els.error.textContent = err.message;
    els.error.hidden = false;
    if (err.code === "slot_taken") { state.time = null; loadSlots(); }
  } finally {
    els.submit.disabled = false;
    els.submit.textContent = "Confirmar reserva";
  }
});

async function init() {
  try {
    state.info = await api("/info");
  } catch (err) {
    els.slots.innerHTML = `<p class="error">${err.message}</p>`;
    return;
  }
  // Primer día abierto a partir de hoy
  const today = todayIn(state.info.timeZone);
  for (let i = 0; i < 7; i++) {
    const iso = addDays(today, i);
    if (!state.info.closedWeekdays.includes(new Date(`${iso}T00:00:00Z`).getUTCDay())) { state.date = iso; break; }
  }
  renderSizes();
  renderDays();
  loadSlots();
}

init();
