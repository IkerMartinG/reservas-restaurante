import { Router } from "express";
import { restaurant as config } from "../config.js";
import { isISODate } from "../lib/time.js";
import { parsePartySize } from "../lib/validate.js";
import {
  AppError,
  cancelByCustomer,
  createReservation,
  findForCustomer,
  getAvailability,
  publicView,
} from "../services/reservations.js";

export const publicRouter = Router();

publicRouter.get("/info", (req, res) => {
  res.json({
    name: config.name,
    timeZone: config.timeZone,
    maxPartySize: config.maxPartySize,
    bookingWindowDays: config.bookingWindowDays,
    closedWeekdays: config.closedWeekdays,
    durationMinutes: config.durationMinutes,
    services: config.services.map(({ id, name, open, lastSeating }) => ({ id, name, open, lastSeating })),
  });
});

publicRouter.get("/availability", async (req, res) => {
  const { date } = req.query;
  const partySize = parsePartySize(req.query.partySize, config.maxPartySize);
  if (!isISODate(date)) throw new AppError(400, "Indica una fecha válida (YYYY-MM-DD).", "invalid");
  if (partySize === null) throw new AppError(400, `Indica entre 1 y ${config.maxPartySize} personas.`, "invalid");
  res.json(await getAvailability(date, partySize));
});

publicRouter.post("/reservations", async (req, res) => {
  const { reservation } = await createReservation(req.body, { source: "web" });
  res.status(201).json(publicView(reservation));
});

publicRouter.post("/reservations/lookup", async (req, res) => {
  const reservation = await findForCustomer(req.body?.code, req.body?.phone);
  res.json(publicView(reservation));
});

publicRouter.post("/reservations/cancel", async (req, res) => {
  const reservation = await cancelByCustomer(req.body?.code, req.body?.phone);
  res.json(publicView(reservation));
});
