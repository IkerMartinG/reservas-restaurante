import { isHHMM, isISODate } from "./time.js";

const PHONE = /^\+?[\d\s-]{9,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const text = (v) => (typeof v === "string" ? v.trim() : "");

export function normalizePhone(phone) {
  return text(phone).replace(/[\s-]/g, "");
}

export function parsePartySize(value, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}

/** Valida los datos de una reserva. Devuelve { errors, value }. */
export function validateReservation(body, config) {
  const errors = [];
  const value = {
    date: text(body?.date),
    time: text(body?.time),
    partySize: parsePartySize(body?.partySize, config.maxPartySize),
    name: text(body?.name),
    phone: normalizePhone(body?.phone),
    email: text(body?.email).toLowerCase(),
    notes: text(body?.notes),
  };

  if (!isISODate(value.date)) errors.push("La fecha no es válida.");
  if (!isHHMM(value.time)) errors.push("La hora no es válida.");
  if (value.partySize === null) errors.push(`El número de personas debe estar entre 1 y ${config.maxPartySize}.`);
  if (value.name.length < 2 || value.name.length > 80) errors.push("Escribe un nombre de entre 2 y 80 caracteres.");
  if (!PHONE.test(value.phone)) errors.push("Escribe un teléfono válido.");
  if (value.email && !EMAIL.test(value.email)) errors.push("El email no es válido.");
  if (value.notes.length > 300) errors.push("Las notas no pueden pasar de 300 caracteres.");

  return { errors, value };
}
