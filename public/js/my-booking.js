import { api, formatDate } from "./api.js";

const $ = (sel) => document.querySelector(sel);
const STATUS = { confirmada: "Confirmada", sentada: "En el restaurante", completada: "Completada", cancelada: "Cancelada", no_show: "No presentada" };

let current = null;
let confirming = false;

function show(r) {
  current = r;
  $("#r-code").textContent = r.code;
  $("#r-name").textContent = r.name;
  $("#r-date").textContent = formatDate(r.date);
  $("#r-time").textContent = r.time;
  $("#r-size").textContent = r.partySize;
  $("#r-status").textContent = STATUS[r.status] ?? r.status;
  $("#cancel").hidden = r.status !== "confirmada";
  $("#cancel").textContent = "Cancelar reserva";
  confirming = false;
  $("#result-card").hidden = false;
}

$("#lookup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#lookup-error");
  error.hidden = true;
  const form = new FormData(e.currentTarget);
  current = { code: String(form.get("code")).trim().toUpperCase(), phone: String(form.get("phone")) };
  try {
    const r = await api("/reservations/lookup", { method: "POST", body: current });
    show({ ...r, phone: current.phone });
  } catch (err) {
    $("#result-card").hidden = true;
    error.textContent = err.message;
    error.hidden = false;
  }
});

$("#cancel").addEventListener("click", async () => {
  const btn = $("#cancel");
  const error = $("#cancel-error");
  error.hidden = true;
  if (!confirming) {
    confirming = true;
    btn.textContent = "Sí, cancelar la reserva";
    return;
  }
  btn.disabled = true;
  try {
    const r = await api("/reservations/cancel", { method: "POST", body: { code: current.code, phone: current.phone } });
    show({ ...r, phone: current.phone });
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    btn.disabled = false;
  }
});
