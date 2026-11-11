import { Router } from "express";
import mongoose from "mongoose";
import { env } from "../config.js";
import { isISODate, toHHMM } from "../lib/time.js";
import { safeEqual, signToken } from "../lib/token.js";
import { requireAdmin } from "../middleware/auth.js";
import { Reservation } from "../models/Reservation.js";
import {
  AppError,
  createReservation,
  listForDay,
  listTables,
  moveToTable,
  setStatus,
} from "../services/reservations.js";

export const adminRouter = Router();

adminRouter.post("/login", (req, res) => {
  const password = req.body?.password ?? "";
  if (!env.adminPassword || !safeEqual(password, env.adminPassword)) {
    throw new AppError(401, "Contraseña incorrecta.", "bad_password");
  }
  res.json({ token: signToken({ role: "admin" }, env.tokenSecret, env.tokenTtlSeconds) });
});

adminRouter.use(requireAdmin);

const adminView = (r) => ({
  id: String(r._id),
  code: r.code,
  date: r.date,
  time: toHHMM(r.start),
  start: r.start,
  end: r.end,
  partySize: r.partySize,
  name: r.name,
  phone: r.phone,
  email: r.email,
  notes: r.notes,
  status: r.status,
  source: r.source,
  table: r.table && typeof r.table === "object" && "name" in r.table
    ? { id: String(r.table._id), name: r.table.name, capacity: r.table.capacity, zone: r.table.zone }
    : { id: String(r.table) },
});

adminRouter.get("/tables", async (req, res) => {
  res.json(await listTables());
});

adminRouter.get("/reservations", async (req, res) => {
  if (!isISODate(req.query.date)) throw new AppError(400, "Indica una fecha válida.", "invalid");
  const reservations = await listForDay(req.query.date);
  res.json(reservations.map(adminView));
});

adminRouter.post("/reservations", async (req, res) => {
  const { reservation, table } = await createReservation(req.body, { source: "telefono" });
  res.status(201).json(adminView({ ...reservation.toObject(), table: { _id: table.id, ...table } }));
});

adminRouter.patch("/reservations/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Identificador no válido.", "invalid_id");
  const { status, tableId } = req.body ?? {};

  if (tableId !== undefined) {
    if (!mongoose.isValidObjectId(tableId)) throw new AppError(400, "Mesa no válida.", "invalid_id");
    await moveToTable(id, tableId);
  }
  if (status !== undefined) await setStatus(id, status);

  const updated = await Reservation.findById(id).populate("table", "name capacity zone").lean();
  res.json(adminView(updated));
});
