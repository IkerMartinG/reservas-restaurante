import mongoose from "mongoose";

// Un documento por cada bloque de 30 minutos que una reserva ocupa en una mesa.
// El índice único (mesa, día, bloque) es lo que impide las dobles reservas:
// si dos personas intentan coger la misma mesa a la vez, MongoDB solo deja
// insertar a una y la otra recibe un error E11000. No hace falta transacción.
const slotLockSchema = new mongoose.Schema({
  table: { type: mongoose.Schema.Types.ObjectId, ref: "Table", required: true },
  date: { type: String, required: true },
  block: { type: Number, required: true },
  reservation: { type: mongoose.Schema.Types.ObjectId, ref: "Reservation", required: true, index: true },
});

slotLockSchema.index({ table: 1, date: 1, block: 1 }, { unique: true });
slotLockSchema.index({ date: 1 });

export const SlotLock = mongoose.model("SlotLock", slotLockSchema);
