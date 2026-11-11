import mongoose from "mongoose";
import { restaurant as config } from "../config.js";
import { bookingProblem, dayAvailability, fittingTables } from "../lib/availability.js";
import { reservationCode } from "../lib/code.js";
import { blocksFor, nowIn, toHHMM, toMinutes } from "../lib/time.js";
import { normalizePhone, validateReservation } from "../lib/validate.js";
import { ACTIVE_STATUSES, RELEASING_STATUSES, Reservation, STATUSES } from "../models/Reservation.js";
import { SlotLock } from "../models/SlotLock.js";
import { Table } from "../models/Table.js";
import { notifier } from "./notifier.js";

export class AppError extends Error {
  constructor(status, message, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const now = () => nowIn(config.timeZone);

const plainTable = (t) => ({ id: String(t._id), name: t.name, capacity: t.capacity, zone: t.zone, active: t.active });

function isDuplicateKey(err) {
  return err?.code === 11000 || err?.writeErrors?.some?.((e) => (e.code ?? e.err?.code) === 11000) || /E11000/.test(err?.message ?? "");
}

/**
 * Intenta bloquear todos los bloques de una mesa para una reserva.
 * Devuelve false si alguno ya estaba cogido (y deshace los que sí se insertaron).
 */
async function lockTable(tableId, date, blocks, reservationId) {
  const docs = blocks.map((block) => ({ table: tableId, date, block, reservation: reservationId }));
  try {
    await SlotLock.insertMany(docs, { ordered: true });
    return true;
  } catch (err) {
    await SlotLock.deleteMany({ reservation: reservationId, table: tableId });
    if (isDuplicateKey(err)) return false;
    throw err;
  }
}

async function freshCode() {
  for (let i = 0; i < 5; i++) {
    const code = reservationCode();
    if (!(await Reservation.exists({ code }))) return code;
  }
  throw new AppError(500, "No se pudo generar un código de reserva.");
}

export async function getAvailability(date, partySize) {
  const [tables, locks] = await Promise.all([Table.find({ active: true }).lean(), SlotLock.find({ date }).lean()]);
  return dayAvailability({
    config,
    date,
    partySize,
    tables: tables.map(plainTable),
    locks: locks.map((l) => ({ table: String(l.table), block: l.block })),
    now: now(),
  });
}

/**
 * Crea una reserva y le asigna la mesa libre más ajustada.
 * `source: "telefono"` es para reservas que mete el personal desde el panel
 * (sin la antelación mínima de la web).
 */
export async function createReservation(input, { source = "web", notify = true, at = now() } = {}) {
  const { errors, value } = validateReservation(input, config);
  if (errors.length) throw new AppError(400, errors.join(" "), "invalid");

  const start = toMinutes(value.time);
  const problem = bookingProblem(config, value.date, start, at, { ignoreNotice: source !== "web" });
  if (problem) throw new AppError(400, problem, "not_bookable");

  const tables = fittingTables((await Table.find({ active: true }).lean()).map(plainTable), value.partySize, config.maxExtraSeats);
  if (!tables.length) {
    throw new AppError(409, "No tenemos mesas para ese número de personas. Llámanos y lo vemos.", "no_tables");
  }

  const blocks = blocksFor(start, config.durationMinutes, config.slotMinutes);
  const reservationId = new mongoose.Types.ObjectId();

  let table = null;
  for (const candidate of tables) {
    if (await lockTable(candidate.id, value.date, blocks, reservationId)) {
      table = candidate;
      break;
    }
  }
  if (!table) throw new AppError(409, "Esa hora se acaba de completar. Elige otra, por favor.", "slot_taken");

  try {
    const reservation = await Reservation.create({
      _id: reservationId,
      code: await freshCode(),
      date: value.date,
      start,
      end: start + config.durationMinutes,
      partySize: value.partySize,
      table: table.id,
      name: value.name,
      phone: value.phone,
      email: value.email,
      notes: value.notes,
      source,
    });
    if (notify) notifier.reservationCreated(reservation, table);
    return { reservation, table };
  } catch (err) {
    await SlotLock.deleteMany({ reservation: reservationId });
    throw err;
  }
}

/** Lo que se le enseña al cliente de su reserva. */
export function publicView(r) {
  return {
    code: r.code,
    date: r.date,
    time: toHHMM(r.start),
    partySize: r.partySize,
    name: r.name,
    status: r.status,
  };
}

/** Busca una reserva por código y teléfono (los dos tienen que coincidir). */
export async function findForCustomer(code, phone) {
  const reservation = await Reservation.findOne({ code: String(code ?? "").trim().toUpperCase() });
  if (!reservation || normalizePhone(reservation.phone) !== normalizePhone(phone)) {
    throw new AppError(404, "No encontramos ninguna reserva con ese código y teléfono.", "not_found");
  }
  return reservation;
}

export async function cancelByCustomer(code, phone) {
  const reservation = await findForCustomer(code, phone);
  if (reservation.status !== "confirmada") {
    throw new AppError(409, "Esta reserva ya no se puede cancelar desde la web.", "not_cancellable");
  }
  return setStatus(reservation._id, "cancelada");
}

export async function setStatus(id, status) {
  if (!STATUSES.includes(status)) throw new AppError(400, "Estado no válido.", "invalid");
  const reservation = await Reservation.findById(id);
  if (!reservation) throw new AppError(404, "La reserva no existe.", "not_found");

  const wasReleased = RELEASING_STATUSES.includes(reservation.status);
  if (wasReleased && status !== reservation.status) {
    throw new AppError(409, "Una reserva cancelada o no presentada no se puede reactivar. Crea una nueva.", "released");
  }

  reservation.status = status;
  await reservation.save();
  if (RELEASING_STATUSES.includes(status) && !wasReleased) {
    await SlotLock.deleteMany({ reservation: reservation._id });
    if (status === "cancelada") notifier.reservationCancelled(reservation);
  }
  return reservation;
}

/** Cambia la reserva de mesa, solo si la nueva está libre durante toda la reserva. */
export async function moveToTable(id, tableId) {
  const reservation = await Reservation.findById(id);
  if (!reservation) throw new AppError(404, "La reserva no existe.", "not_found");
  if (!ACTIVE_STATUSES.includes(reservation.status)) {
    throw new AppError(409, "Solo se pueden mover reservas confirmadas o sentadas.", "not_active");
  }
  const table = await Table.findById(tableId).lean();
  if (!table || !table.active) throw new AppError(404, "La mesa no existe.", "not_found");
  if (table.capacity < reservation.partySize) {
    throw new AppError(409, `La mesa ${table.name} es para ${table.capacity} personas.`, "too_small");
  }
  if (String(reservation.table) === String(table._id)) return reservation;

  const blocks = blocksFor(reservation.start, reservation.end - reservation.start, config.slotMinutes);
  const ok = await lockTable(table._id, reservation.date, blocks, reservation._id);
  if (!ok) throw new AppError(409, `La mesa ${table.name} está ocupada a esa hora.`, "slot_taken");

  await SlotLock.deleteMany({ reservation: reservation._id, table: reservation.table });
  reservation.table = table._id;
  await reservation.save();
  return reservation;
}

export async function listForDay(date) {
  return Reservation.find({ date }).sort({ start: 1, createdAt: 1 }).populate("table", "name capacity zone").lean();
}

export async function listTables() {
  const tables = await Table.find({ active: true }).lean();
  return tables.map(plainTable).sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
}
