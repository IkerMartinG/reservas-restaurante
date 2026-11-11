import mongoose from "mongoose";

export const STATUSES = ["confirmada", "sentada", "completada", "cancelada", "no_show"];
/** Estados que ocupan la mesa. */
export const ACTIVE_STATUSES = ["confirmada", "sentada"];
/** Estados que liberan la mesa. */
export const RELEASING_STATUSES = ["cancelada", "no_show"];

const reservationSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    date: { type: String, required: true }, // YYYY-MM-DD en hora de Canarias
    start: { type: Number, required: true }, // minutos desde medianoche
    end: { type: Number, required: true },
    partySize: { type: Number, required: true, min: 1 },
    table: { type: mongoose.Schema.Types.ObjectId, ref: "Table", required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    email: { type: String, default: "" },
    notes: { type: String, default: "" },
    status: { type: String, enum: STATUSES, default: "confirmada" },
    source: { type: String, enum: ["web", "telefono"], default: "web" },
  },
  { timestamps: true },
);

reservationSchema.index({ date: 1, start: 1 });

export const Reservation = mongoose.model("Reservation", reservationSchema);
