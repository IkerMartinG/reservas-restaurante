// Avisos al cliente y al restaurante. En desarrollo se escriben en la consola.
// Para enviarlos de verdad, sustituye `send` por nodemailer, Resend o la API de WhatsApp.
import { toHHMM } from "../lib/time.js";

function send(to, subject, body) {
  console.log(`\n[aviso] Para: ${to}\n        Asunto: ${subject}\n        ${body}\n`);
}

export const notifier = {
  reservationCreated(reservation, table) {
    const when = `${reservation.date} a las ${toHHMM(reservation.start)}`;
    if (reservation.email) {
      send(
        reservation.email,
        `Reserva confirmada ${reservation.code}`,
        `Hola ${reservation.name}, te esperamos el ${when} (${reservation.partySize} personas). Tu código es ${reservation.code}.`,
      );
    }
    send("sala@casa-anaga.test", `Nueva reserva ${reservation.code}`, `${reservation.name}, ${reservation.partySize} pax, ${when}, mesa ${table.name}.`);
  },

  reservationCancelled(reservation) {
    send("sala@casa-anaga.test", `Reserva cancelada ${reservation.code}`, `${reservation.name} ha cancelado la reserva del ${reservation.date} a las ${toHHMM(reservation.start)}.`);
  },
};
