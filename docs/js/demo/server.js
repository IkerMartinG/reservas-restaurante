// Backend simulado para la demo de GitHub Pages.
// Responde a las mismas rutas que la API real usando la misma lógica de disponibilidad
// (src/lib), con datos de ejemplo guardados en el navegador (localStorage).
// No se usa en producción: solo lo carga js/api.js cuando la página está en modo demo.
import { bookingProblem, dayAvailability, fittingTables, isTableFree, busySet, seatingTimes } from "../lib/availability.js";
import { restaurant as config } from "../lib/restaurant.js";
import { addDays, blocksFor, isISODate, nowIn, toHHMM, toMinutes, weekday } from "../lib/time.js";
import { normalizePhone, parsePartySize, validateReservation } from "../lib/validate.js";

const STORE_KEY = "casa-anaga-demo-v1";
const TOKEN = "demo-token";
export const DEMO_PASSWORD = "demo";

const ACTIVE = ["confirmada", "sentada"];
const RELEASING = ["cancelada", "no_show"];

const TABLES = [
  ["Mesa 1", 2, "Salón"], ["Mesa 2", 2, "Salón"], ["Mesa 3", 2, "Terraza"], ["Mesa 4", 2, "Terraza"],
  ["Mesa 5", 4, "Salón"], ["Mesa 6", 4, "Salón"], ["Mesa 7", 4, "Salón"], ["Mesa 8", 4, "Terraza"],
  ["Mesa 9", 6, "Salón"], ["Mesa 10", 6, "Terraza"], ["Mesa 11", 8, "Salón"],
].map(([name, capacity, zone], i) => ({ id: `t${i + 1}`, name, capacity, zone, active: true }));

const NAMES = [
  "Carmen Díaz", "Acerina Rodríguez", "Jonay Hernández", "Yaiza Pérez", "Airam González", "Nira Expósito",
  "Beneharo Martín", "Dácil Afonso", "Guillermo Suárez", "Tamara Cabrera", "Echedey Delgado", "Laura Mesa",
  "Iballa Torres", "Adrián Castro", "Raquel Báez", "Tinerfe Ramos", "Marta Padrón", "Aday Morales",
];
const NOTES = ["", "", "", "Cumpleaños", "Una persona celíaca", "Preferimos terraza", "Vamos con carrito de bebé", ""];
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const now = () => nowIn(config.timeZone);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class DemoError extends Error {
  constructor(status, message, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* ---------- Datos ---------- */

// Generador pseudoaleatorio con semilla (mulberry32): los datos de ejemplo salen igual todo el día.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function code(random = Math.random) {
  let c = "";
  for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return c;
}

function lockedFor(db, date) {
  return db.reservations
    .filter((r) => r.date === date && ACTIVE.includes(r.status))
    .flatMap((r) => blocksFor(r.start, r.end - r.start, config.slotMinutes).map((block) => ({ table: r.tableId, block })));
}

function freeTable(db, date, start, partySize, { exceptId } = {}) {
  const busy = busySet(lockedFor({ reservations: db.reservations.filter((r) => r.id !== exceptId) }, date));
  const blocks = blocksFor(start, config.durationMinutes, config.slotMinutes);
  return fittingTables(TABLES, partySize, config.maxExtraSeats).find((t) => isTableFree(busy, t.id, blocks)) ?? null;
}

function seed() {
  const today = now();
  const random = rng(Number(today.date.replaceAll("-", "")));
  const pick = (list) => list[Math.floor(random() * list.length)];
  const db = { seededFor: today.date, reservations: [], nextId: 1 };

  for (let d = 0; d < 8; d++) {
    const date = addDays(today.date, d);
    if (config.closedWeekdays.includes(weekday(date))) continue;
    const target = d === 0 ? 24 : 8 + Math.floor(random() * 10);
    for (let i = 0; i < target; i++) {
      const service = pick(config.services);
      const start = pick(seatingTimes(service, config.slotMinutes));
      const partySize = pick([2, 2, 2, 2, 3, 4, 4, 4, 5, 6, 8]);
      const table = freeTable(db, date, start, partySize);
      if (!table) continue;
      const end = start + config.durationMinutes;
      let status = "confirmada";
      if (d === 0 && end <= today.minutes) status = random() < 0.1 ? "no_show" : "completada";
      else if (d === 0 && start <= today.minutes) status = "sentada";
      db.reservations.push({
        id: `r${db.nextId++}`, code: code(random), date, start, end, partySize, tableId: table.id,
        name: pick(NAMES), phone: `6${String(Math.floor(10000000 + random() * 89999999))}`, email: "",
        notes: pick(NOTES), status, source: random() < 0.3 ? "telefono" : "web",
      });
    }
  }
  return db;
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved?.seededFor === now().date) return saved;
  } catch { /* sin almacenamiento: datos nuevos */ }
  const fresh = seed();
  save(fresh);
  return fresh;
}

function save(db) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch { /* modo privado */ }
}

export function resetDemo() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* nada */ }
}

/* ---------- Vistas ---------- */

const publicView = (r) => ({ code: r.code, date: r.date, time: toHHMM(r.start), partySize: r.partySize, name: r.name, status: r.status });

const adminView = (r) => {
  const t = TABLES.find((x) => x.id === r.tableId);
  return {
    id: r.id, code: r.code, date: r.date, time: toHHMM(r.start), start: r.start, end: r.end, partySize: r.partySize,
    name: r.name, phone: r.phone, email: r.email, notes: r.notes, status: r.status, source: r.source,
    table: { id: t.id, name: t.name, capacity: t.capacity, zone: t.zone },
  };
};

/* ---------- Operaciones ---------- */

function create(db, body, source) {
  const { errors, value } = validateReservation(body, config);
  if (errors.length) throw new DemoError(400, errors.join(" "), "invalid");
  const start = toMinutes(value.time);
  const problem = bookingProblem(config, value.date, start, now(), { ignoreNotice: source !== "web" });
  if (problem) throw new DemoError(400, problem, "not_bookable");
  if (!fittingTables(TABLES, value.partySize, config.maxExtraSeats).length) {
    throw new DemoError(409, "No tenemos mesas para ese número de personas. Llámanos y lo vemos.", "no_tables");
  }
  const table = freeTable(db, value.date, start, value.partySize);
  if (!table) throw new DemoError(409, "Esa hora se acaba de completar. Elige otra, por favor.", "slot_taken");
  const r = {
    id: `r${db.nextId++}`, code: code(), date: value.date, start, end: start + config.durationMinutes,
    partySize: value.partySize, tableId: table.id, name: value.name, phone: value.phone, email: value.email,
    notes: value.notes, status: "confirmada", source,
  };
  db.reservations.push(r);
  return r;
}

function findForCustomer(db, body) {
  const r = db.reservations.find((x) => x.code === String(body?.code ?? "").trim().toUpperCase());
  if (!r || normalizePhone(r.phone) !== normalizePhone(body?.phone)) {
    throw new DemoError(404, "No encontramos ninguna reserva con ese código y teléfono.", "not_found");
  }
  return r;
}

function setStatus(r, status) {
  if (!["confirmada", "sentada", "completada", "cancelada", "no_show"].includes(status)) throw new DemoError(400, "Estado no válido.", "invalid");
  if (RELEASING.includes(r.status) && status !== r.status) {
    throw new DemoError(409, "Una reserva cancelada o no presentada no se puede reactivar. Crea una nueva.", "released");
  }
  r.status = status;
}

function moveTable(db, r, tableId) {
  if (!ACTIVE.includes(r.status)) throw new DemoError(409, "Solo se pueden mover reservas confirmadas o sentadas.", "not_active");
  const table = TABLES.find((t) => t.id === tableId);
  if (!table) throw new DemoError(404, "La mesa no existe.", "not_found");
  if (table.capacity < r.partySize) throw new DemoError(409, `La mesa ${table.name} es para ${table.capacity} personas.`, "too_small");
  const busy = busySet(lockedFor({ reservations: db.reservations.filter((x) => x.id !== r.id) }, r.date));
  if (!isTableFree(busy, table.id, blocksFor(r.start, r.end - r.start, config.slotMinutes))) {
    throw new DemoError(409, `La mesa ${table.name} está ocupada a esa hora.`, "slot_taken");
  }
  r.tableId = table.id;
}

/* ---------- Rutas ---------- */

function route(db, method, url, body, token) {
  const p = url.pathname;
  const q = (k) => url.searchParams.get(k);

  if (p === "/info") {
    const { name, timeZone, maxPartySize, bookingWindowDays, closedWeekdays, durationMinutes, services } = config;
    return { name, timeZone, maxPartySize, bookingWindowDays, closedWeekdays, durationMinutes, services };
  }
  if (p === "/availability") {
    const partySize = parsePartySize(q("partySize"), config.maxPartySize);
    if (!isISODate(q("date")) || partySize === null) throw new DemoError(400, "Fecha o número de personas no válidos.", "invalid");
    return dayAvailability({ config, date: q("date"), partySize, tables: TABLES, locks: lockedFor(db, q("date")), now: now() });
  }
  if (p === "/reservations" && method === "POST") return publicView(create(db, body, "web"));
  if (p === "/reservations/lookup") return publicView(findForCustomer(db, body));
  if (p === "/reservations/cancel") {
    const r = findForCustomer(db, body);
    if (r.status !== "confirmada") throw new DemoError(409, "Esta reserva ya no se puede cancelar desde la web.", "not_cancellable");
    r.status = "cancelada";
    return publicView(r);
  }

  if (p === "/admin/login") {
    if (body?.password !== DEMO_PASSWORD) throw new DemoError(401, `Contraseña incorrecta. En la demo es "${DEMO_PASSWORD}".`, "bad_password");
    return { token: TOKEN };
  }
  if (p.startsWith("/admin/") && token !== TOKEN) throw new DemoError(401, "Tu sesión ha caducado. Vuelve a entrar.", "unauthorized");
  if (p === "/admin/tables") return TABLES;
  if (p === "/admin/reservations" && method === "GET") {
    if (!isISODate(q("date"))) throw new DemoError(400, "Indica una fecha válida.", "invalid");
    return db.reservations.filter((r) => r.date === q("date")).sort((a, b) => a.start - b.start).map(adminView);
  }
  if (p === "/admin/reservations" && method === "POST") return adminView(create(db, body, "telefono"));
  const match = /^\/admin\/reservations\/([\w-]+)$/.exec(p);
  if (match && method === "PATCH") {
    const r = db.reservations.find((x) => x.id === match[1]);
    if (!r) throw new DemoError(404, "La reserva no existe.", "not_found");
    if (body?.tableId !== undefined) moveTable(db, r, body.tableId);
    if (body?.status !== undefined) setStatus(r, body.status);
    return adminView(r);
  }
  throw new DemoError(404, "Esa ruta de la API no existe.", "not_found");
}

/** Punto de entrada: mismo contrato que fetch a /api, devuelve los datos o lanza un Error con status. */
export async function handle(path, { method = "GET", body, token } = {}) {
  await wait(120 + Math.random() * 180); // que se note que "va al servidor"
  const db = load();
  const result = route(db, method, new URL(path, "https://demo.local"), body ? JSON.parse(JSON.stringify(body)) : undefined, token);
  save(db);
  return JSON.parse(JSON.stringify(result));
}
