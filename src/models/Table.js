import mongoose from "mongoose";

const tableSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    capacity: { type: Number, required: true, min: 1 },
    zone: { type: String, enum: ["Salón", "Terraza"], default: "Salón" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Table = mongoose.model("Table", tableSchema);
