import { addDays, api, formatDate, todayIn } from "../js/api.js";

const $ = (sel) => document.querySelector(sel);
const TOKEN_KEY = "casa-anaga-token";

const STATUS = {
  confirmada: "Confirmada",
  sentada: "Sentada",
  completada: "Completada",
  no_show: "No vino",
  cancelada: "Cancelada",
};

const state = { token: null, info: null, tables: [], date: null, reservations: [], selected: null };

/* ---------- Sesión ---------- */
function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setToken(t) {
  state.token = t;
  try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* modo privado */ }
}

async function call(path, options = {}) {
  try {
    return await api(path, { ...options, token: state.token });
  } catch (err) {
    if (err.status === 401) { setToken(null); showLogin(); }
    throw err;
  }
}

function showLogin() {
  $("#app-view").hidden = true;
  $("#login-view").hidden = false;
  $("#password").focus();
}

$("#login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#login-error");
  error.hidden = true;
  try {
    const { token } = await api("/admin/login", { method: "POST", body: { password: $("#password").value } });
    setToken(token);
    $("#password").value = "";
    await start();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
});

$("#logout").addEventListener("click", () => { setToken(null); showLogin(); });

/* ---------- Utilidades ---------- */
const toMinutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
};

/* ---------- Día ---------- */
async function loadDay(date) {
  state.date = date;
  $("#date").value = date;
  $("#day-title").textContent = formatDate(date);
  try {
    state.reservations = await call(`/admin/reservations?date=${date}`);
  } catch (err) {
    if (err.status !== 401) $("#timelines").replaceChildren(el("p", { className: "error", textContent: err.message }));
    return;
  }
  if (state.selected && !state.reservations.some((r) => r.id === state.selected)) state.selected = null;
  render();
}

function render() {
  renderStats();
  renderTimelines();
  renderList();
  renderDetail();
}

function renderStats() {
  const active = state.reservations.filter((r) => !["cancelada", "no_show"].includes(r.status));
  const pax = active.reduce((sum, r) => sum + r.partySize, 0);
  const perService = state.info.services.map((s) => {
    const open = toMinutes(s.open);
    const last = toMinutes(s.lastSeating);
    return { name: s.name, count: active.filter((r) => r.start >= open && r.start <= last).length };
  });
  const stat = (value, label) => el("div", {}, el("dd", { textContent: value }), el("dt", { textContent: label }));
  $("#stats").replaceChildren(
    stat(active.length, active.length === 1 ? "reserva" : "reservas"),
    stat(pax, "comensales"),
    ...perService.map((s) => stat(s.count, `en ${s.name.toLowerCase()}`)),
  );
}

function renderTimelines() {
  const { services, durationMinutes } = state.info;
  const step = 30;
  const legend = el(
    "ul",
    { className: "legend" },
    ...[["confirmada", "var(--laurel-2)"], ["sentada", "var(--sun)"], ["completada", "#DCE3DD"], ["no_show", "#F6DADA"]].map(([s, color]) => {
      const i = el("i");
      i.style.background = color;
      return el("li", {}, i, STATUS[s]);
    }),
  );

  const blocks = services.map((service) => {
    const from = toMinutes(service.open);
    const to = toMinutes(service.lastSeating) + durationMinutes;
    const span = to - from;
    const pct = (m) => `${((m - from) / span) * 100}%`;

    const head = el("div", { className: "tl-row tl-head" }, el("div"), el("div", { className: "tl-track" }));
    for (let t = from; t < to; t += 60) {
      const tick = el("span", { className: "tl-tick", textContent: toHHMM(t) });
      tick.style.left = pct(t);
      head.lastChild.append(tick);
    }

    const rows = state.tables.map((table) => {
      const track = el("div", { className: "tl-track" });
      track.style.setProperty("--cell", `${(step / span) * 100}%`);
      state.reservations
        .filter((r) => r.table.id === table.id && r.status !== "cancelada" && r.start >= from && r.start < to)
        .forEach((r) => {
          const bar = el(
            "button",
            { type: "button", className: `res res--${r.status}`, title: `${r.time} ${r.name}, ${r.partySize} pax` },
            el("strong", { textContent: r.name }),
            el("span", { textContent: `${r.time} · ${r.partySize} pax` }),
          );
          bar.style.left = pct(r.start);
          bar.style.width = `calc(${((r.end - r.start) / span) * 100}% - 3px)`;
          bar.setAttribute("aria-pressed", String(state.selected === r.id));
          bar.addEventListener("click", () => select(r.id));
          track.append(bar);
        });
      return el(
        "div",
        { className: "tl-row" },
        el("div", { className: "tl-label" }, table.name, el("small", { textContent: `${table.capacity} pax · ${table.zone}` })),
        track,
      );
    });

    return el(
      "section",
      { className: "timeline" },
      el("h3", { textContent: `${service.name} (${service.open} a ${toHHMM(to)})` }),
      el("div", { className: "timeline__inner" }, head, ...rows),
    );
  });

  $("#timelines").replaceChildren(legend, ...blocks);
}

function renderList() {
  const tbody = $("#list");
  if (!state.reservations.length) {
    tbody.replaceChildren(el("tr", {}, el("td", { className: "empty", colSpan: 6, textContent: "No hay reservas este día." })));
    return;
  }
  tbody.replaceChildren(
    ...state.reservations.map((r) => {
      const open = el("button", { type: "button", textContent: r.name });
      open.addEventListener("click", () => select(r.id));
      return el(
        "tr",
        { className: r.status === "cancelada" ? "is-cancelled" : "" },
        el("td", { textContent: r.time }),
        el("td", {}, open),
        el("td", { textContent: r.partySize }),
        el("td", { textContent: r.table.name ?? "" }),
        el("td", { textContent: STATUS[r.status] }),
        el("td", { textContent: r.notes || "" }),
      );
    }),
  );
}

function select(id) {
  state.selected = id;
  renderTimelines();
  renderDetail();
  if (matchMedia("(max-width: 1000px)").matches) $("#detail").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDetail() {
  const aside = $("#detail");
  const r = state.reservations.find((x) => x.id === state.selected);
  if (!r) { aside.hidden = true; return; }
  aside.hidden = false;

  const row = (k, v) => [el("dt", { textContent: k }), el("dd", { textContent: v })];
  const details = el(
    "dl",
    { className: "details" },
    ...row("Teléfono", r.phone),
    ...(r.email ? row("Email", r.email) : []),
    ...row("Mesa", `${r.table.name} (${r.table.capacity} pax)`),
    ...row("Origen", r.source === "telefono" ? "Teléfono" : "Web"),
    ...(r.notes ? row("Notas", r.notes) : []),
  );

  const active = ["confirmada", "sentada"].includes(r.status);
  const actions = el("div", { className: "actions" });
  const action = (label, status, className = "") => {
    const b = el("button", { type: "button", textContent: label, className });
    b.addEventListener("click", () => update(r.id, { status }));
    return b;
  };
  if (r.status === "confirmada") actions.append(action("Sentar", "sentada"), action("No vino", "no_show", "danger"));
  if (r.status === "sentada") actions.append(action("Completar", "completada"));
  if (active) actions.append(action("Cancelar", "cancelada", "danger"));

  let move = null;
  if (active) {
    const select = el("select", { id: "move-table" });
    state.tables
      .filter((t) => t.capacity >= r.partySize)
      .forEach((t) => select.append(el("option", { value: t.id, textContent: `${t.name} (${t.capacity} pax, ${t.zone})`, selected: t.id === r.table.id })));
    select.addEventListener("change", () => update(r.id, { tableId: select.value }));
    move = el("div", { className: "field" }, el("label", { htmlFor: "move-table", textContent: "Cambiar de mesa" }), select);
  }

  aside.replaceChildren(
    el("h2", { textContent: r.name }),
    el("p", { className: "meta", textContent: `${r.time} · ${r.partySize} pax · ${STATUS[r.status]} · ${r.code}` }),
    details,
    actions.childElementCount ? actions : null,
    move,
    el("p", { className: "error", id: "detail-error", role: "alert", hidden: true }),
  );
}

async function update(id, body) {
  try {
    const updated = await call(`/admin/reservations/${id}`, { method: "PATCH", body });
    state.reservations = state.reservations.map((r) => (r.id === id ? updated : r));
    render();
  } catch (err) {
    renderDetail(); // devuelve el select a su valor
    const error = $("#detail-error");
    if (error) { error.textContent = err.message; error.hidden = false; }
  }
}

/* ---------- Nueva reserva ---------- */
const dialog = $("#new-dialog");

function fillTimes() {
  const select = $("#n-time");
  select.replaceChildren(
    ...state.info.services.flatMap((s) => {
      const group = el("optgroup", { label: s.name });
      for (let t = toMinutes(s.open); t <= toMinutes(s.lastSeating); t += 30) group.append(el("option", { value: toHHMM(t), textContent: toHHMM(t) }));
      return group;
    }),
  );
}

$("#new").addEventListener("click", () => {
  $("#new-form").reset();
  $("#n-date").value = state.date;
  $("#n-size").max = state.info.maxPartySize;
  $("#new-error").hidden = true;
  dialog.showModal();
  $("#n-name").focus();
});
$("#new-cancel").addEventListener("click", () => dialog.close());

$("#new-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  const body = Object.fromEntries(form.entries());
  body.partySize = Number(body.partySize);
  try {
    const created = await call("/admin/reservations", { method: "POST", body });
    dialog.close();
    await loadDay(created.date);
    select(created.id);
  } catch (err) {
    $("#new-error").textContent = err.message;
    $("#new-error").hidden = false;
  }
});

/* ---------- Arranque ---------- */
$("#prev").addEventListener("click", () => loadDay(addDays(state.date, -1)));
$("#next").addEventListener("click", () => loadDay(addDays(state.date, 1)));
$("#today").addEventListener("click", () => loadDay(todayIn(state.info.timeZone)));
$("#date").addEventListener("change", (e) => e.target.value && loadDay(e.target.value));

async function start() {
  try {
    [state.info, state.tables] = await Promise.all([api("/info"), call("/admin/tables")]);
  } catch {
    return; // call() ya muestra el login si la sesión no vale
  }
  fillTimes();
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  await loadDay(state.date ?? todayIn(state.info.timeZone));
}

state.token = getToken();
if (state.token) start();
else showLogin();
