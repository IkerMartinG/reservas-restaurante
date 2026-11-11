import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookingProblem, dayAvailability, fittingTables, seatingTimes } from "../src/lib/availability.js";
import { blocksFor } from "../src/lib/time.js";

const config = {
  slotMinutes: 30,
  durationMinutes: 90,
  maxPartySize: 8,
  maxExtraSeats: 2,
  bookingWindowDays: 30,
  minNoticeMinutes: 60,
  closedWeekdays: [1],
  services: [
    { id: "comida", name: "Comida", open: "13:00", lastSeating: "15:30" },
    { id: "cena", name: "Cena", open: "20:00", lastSeating: "22:30" },
  ],
};

const tables = [
  { id: "t2a", name: "Mesa 1", capacity: 2 },
  { id: "t4", name: "Mesa 5", capacity: 4 },
  { id: "t8", name: "Mesa 11", capacity: 8 },
];

// 2026-11-12 es jueves; 2026-11-16 es lunes (cerrado)
const THURSDAY = "2026-11-12";
const MONDAY = "2026-11-16";
const earlyMorning = { date: THURSDAY, minutes: 8 * 60 };

const lockAll = (tableId, start) => blocksFor(start, 90, 30).map((block) => ({ table: tableId, block }));
const slot = (result, service, time) => result.services.find((s) => s.id === service).slots.find((s) => s.time === time);

describe("seatingTimes", () => {
  it("genera las horas de cada servicio incluyendo la última", () => {
    assert.deepEqual(seatingTimes(config.services[0], 30), [780, 810, 840, 870, 900, 930]);
  });
});

describe("fittingTables", () => {
  it("no sienta a dos personas en la mesa de ocho", () => {
    assert.deepEqual(fittingTables(tables, 2, 2).map((t) => t.id), ["t2a", "t4"]);
  });

  it("ordena de la mesa más pequeña a la más grande", () => {
    assert.deepEqual(fittingTables(tables, 3, 5).map((t) => t.id), ["t4", "t8"]);
  });

  it("ignora mesas desactivadas", () => {
    assert.deepEqual(fittingTables([{ ...tables[0], active: false }], 2, 2), []);
  });
});

describe("dayAvailability", () => {
  it("marca el día como cerrado", () => {
    const result = dayAvailability({ config, date: MONDAY, partySize: 2, tables, locks: [], now: earlyMorning });
    assert.equal(result.closed, true);
  });

  it("sigue habiendo hueco si queda otra mesa válida", () => {
    const result = dayAvailability({ config, date: THURSDAY, partySize: 2, tables, locks: lockAll("t2a", 1200), now: earlyMorning });
    assert.equal(slot(result, "cena", "20:00").available, true);
  });

  it("la hora se completa cuando todas las mesas válidas están cogidas", () => {
    const locks = [...lockAll("t2a", 1200), ...lockAll("t4", 1200)];
    const result = dayAvailability({ config, date: THURSDAY, partySize: 2, tables, locks, now: earlyMorning });
    assert.equal(slot(result, "cena", "20:00").available, false);
    // una reserva de 90 min a las 20:00 bloquea también las 20:30 y las 21:00...
    assert.equal(slot(result, "cena", "21:00").available, false);
    // ...pero a las 21:30 la mesa ya está libre
    assert.equal(slot(result, "cena", "21:30").available, true);
  });

  it("respeta la antelación mínima para hoy", () => {
    const now = { date: THURSDAY, minutes: 13 * 60 + 10 };
    const result = dayAvailability({ config, date: THURSDAY, partySize: 2, tables, locks: [], now });
    assert.equal(slot(result, "comida", "14:00").available, false);
    assert.equal(slot(result, "comida", "14:30").available, true);
  });
});

describe("bookingProblem", () => {
  it("acepta una hora válida", () => {
    assert.equal(bookingProblem(config, THURSDAY, 1230, earlyMorning), null);
  });

  it("rechaza horas fuera del servicio", () => {
    assert.match(bookingProblem(config, THURSDAY, 1020, earlyMorning), /horario/);
  });

  it("rechaza fechas pasadas y demasiado lejanas", () => {
    assert.match(bookingProblem(config, "2026-11-01", 1230, earlyMorning), /pasado/);
    assert.match(bookingProblem(config, "2027-02-02", 1230, earlyMorning), /antelación/);
  });

  it("el personal puede reservar sin antelación mínima pero no en el pasado", () => {
    const now = { date: THURSDAY, minutes: 13 * 60 + 40 };
    assert.equal(bookingProblem(config, THURSDAY, 840, now, { ignoreNotice: true }), null);
    assert.match(bookingProblem(config, THURSDAY, 780, now, { ignoreNotice: true }), /pasado/);
  });
});
