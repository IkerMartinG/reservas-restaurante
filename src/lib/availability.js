// Lógica de disponibilidad, sin base de datos: recibe datos y devuelve datos.
// Así se puede probar entera con tests unitarios.
import { addDays, blocksFor, toHHMM, toMinutes, weekday } from "./time.js";

/** Horas a las que se puede empezar a comer en un servicio. */
export function seatingTimes(service, step) {
  const times = [];
  for (let t = toMinutes(service.open); t <= toMinutes(service.lastSeating); t += step) {
    times.push(t);
  }
  return times;
}

/** Mesas válidas para un grupo, de la más ajustada a la más grande. */
export function fittingTables(tables, partySize, maxExtraSeats) {
  return tables
    .filter((t) => t.active !== false && t.capacity >= partySize && t.capacity <= partySize + maxExtraSeats)
    .sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name, "es", { numeric: true }));
}

/** Convierte los bloqueos guardados en un Set "mesa:bloque" para consultas rápidas. */
export function busySet(locks) {
  return new Set(locks.map((l) => `${l.table}:${l.block}`));
}

export function isTableFree(busy, tableId, blocks) {
  return blocks.every((b) => !busy.has(`${tableId}:${b}`));
}

/**
 * Devuelve el motivo por el que no se puede reservar ese día y hora, o null si se puede.
 * `now` es { date, minutes } en la hora del restaurante.
 */
export function bookingProblem(config, date, start, now, { ignoreNotice = false } = {}) {
  if (config.closedWeekdays.includes(weekday(date))) return "Ese día el restaurante está cerrado.";
  if (date < now.date) return "Esa fecha ya ha pasado.";
  if (date > addDays(now.date, config.bookingWindowDays)) {
    return `Solo se puede reservar con ${config.bookingWindowDays} días de antelación como máximo.`;
  }
  const valid = config.services.some((s) => seatingTimes(s, config.slotMinutes).includes(start));
  if (!valid) return "Esa hora no está dentro del horario de reservas.";
  if (date === now.date) {
    const limit = now.minutes + (ignoreNotice ? 0 : config.minNoticeMinutes);
    if (start < limit) {
      return ignoreNotice ? "Esa hora ya ha pasado." : "Para reservar hoy hace falta al menos una hora de antelación.";
    }
  }
  return null;
}

/** Disponibilidad de un día para un grupo, agrupada por servicio. */
export function dayAvailability({ config, date, partySize, tables, locks, now }) {
  if (config.closedWeekdays.includes(weekday(date))) {
    return { date, partySize, closed: true, services: [] };
  }
  const busy = busySet(locks);
  const candidates = fittingTables(tables, partySize, config.maxExtraSeats);

  const services = config.services.map((service) => ({
    id: service.id,
    name: service.name,
    slots: seatingTimes(service, config.slotMinutes).map((start) => {
      const blocked = bookingProblem(config, date, start, now) !== null;
      const blocks = blocksFor(start, config.durationMinutes, config.slotMinutes);
      const free = !blocked && candidates.some((t) => isTableFree(busy, t.id, blocks));
      return { time: toHHMM(start), available: free };
    }),
  }));

  return { date, partySize, closed: false, services };
}
