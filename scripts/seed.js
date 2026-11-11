// Rellena la base de datos con mesas y reservas de ejemplo: npm run seed
import mongoose from "mongoose";
import { env, restaurant as config } from "../src/config.js";
import { seatingTimes } from "../src/lib/availability.js";
import { addDays, nowIn, toHHMM, weekday } from "../src/lib/time.js";
import { Reservation } from "../src/models/Reservation.js";
import { SlotLock } from "../src/models/SlotLock.js";
import { Table } from "../src/models/Table.js";
import { createReservation, setStatus } from "../src/services/reservations.js";

const TABLES = [
  ["Mesa 1", 2, "Salón"], ["Mesa 2", 2, "Salón"], ["Mesa 3", 2, "Terraza"], ["Mesa 4", 2, "Terraza"],
  ["Mesa 5", 4, "Salón"], ["Mesa 6", 4, "Salón"], ["Mesa 7", 4, "Salón"], ["Mesa 8", 4, "Terraza"],
  ["Mesa 9", 6, "Salón"], ["Mesa 10", 6, "Terraza"], ["Mesa 11", 8, "Salón"],
];

const NAMES = [
  "Carmen Díaz", "Acerina Rodríguez", "Jonay Hernández", "Yaiza Pérez", "Airam González", "Nira Expósito",
  "Beneharo Martín", "Dácil Afonso", "Guillermo Suárez", "Tamara Cabrera", "Echedey Delgado", "Laura Mesa",
  "Iballa Torres", "Adrián Castro", "Raquel Báez", "Tinerfe Ramos", "Marta Padrón", "Aday Morales",
];
const NOTES = ["", "", "", "Cumpleaños", "Una persona celíaca", "Preferimos terraza", "Vamos con carrito de bebé", ""];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const randomSize = () => pick([2, 2, 2, 2, 3, 4, 4, 4, 5, 6, 8]);
const phone = () => `6${Math.floor(10000000 + Math.random() * 89999999)}`;

await mongoose.connect(env.mongoUri);
await Promise.all([Table.deleteMany({}), Reservation.deleteMany({}), SlotLock.deleteMany({})]);
await Promise.all([Table.syncIndexes(), Reservation.syncIndexes(), SlotLock.syncIndexes()]);
await Table.insertMany(TABLES.map(([name, capacity, zone]) => ({ name, capacity, zone })));

const today = nowIn(config.timeZone);
let created = 0;

for (let d = 0; d < 8; d++) {
  const date = addDays(today.date, d);
  if (config.closedWeekdays.includes(weekday(date))) continue;

  const target = d === 0 ? 22 : 8 + Math.floor(Math.random() * 10);
  for (let i = 0; i < target; i++) {
    const service = pick(config.services);
    const time = toHHMM(pick(seatingTimes(service, config.slotMinutes)));
    try {
      const { reservation } = await createReservation(
        { date, time, partySize: randomSize(), name: pick(NAMES), phone: phone(), email: "", notes: pick(NOTES) },
        { source: Math.random() < 0.3 ? "telefono" : "web", notify: false, at: { date: today.date, minutes: 0 } },
      );
      created++;
      if (d === 0 && reservation.end <= today.minutes) await setStatus(reservation._id, Math.random() < 0.1 ? "no_show" : "completada");
      else if (d === 0 && reservation.start <= today.minutes) await setStatus(reservation._id, "sentada");
    } catch (err) {
      if (err.status !== 409) throw err; // hora llena: se salta
    }
  }
}

console.log(`Listo: ${TABLES.length} mesas y ${created} reservas. Contraseña del panel: la de ADMIN_PASSWORD (o "admin" en desarrollo).`);
await mongoose.disconnect();
