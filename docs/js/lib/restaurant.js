// Configuración del restaurante (sin dependencias de Node: la usa también la demo del navegador). Todo lo que cambiaría de un cliente a otro está aquí.
export const restaurant = {
  name: "Casa Anaga",
  timeZone: "Atlantic/Canary",

  // Las reservas empiezan cada `slotMinutes` y ocupan la mesa `durationMinutes`.
  slotMinutes: 30,
  durationMinutes: 90,

  maxPartySize: 8,
  // Una mesa vale para un grupo si le sobran como mucho estas sillas
  // (para no sentar a 2 personas en la mesa de 8).
  maxExtraSeats: 2,

  bookingWindowDays: 30, // cuántos días hacia delante se puede reservar
  minNoticeMinutes: 60, // antelación mínima para reservar online

  closedWeekdays: [1], // 0 = domingo, 1 = lunes...

  services: [
    { id: "comida", name: "Comida", open: "13:00", lastSeating: "15:30" },
    { id: "cena", name: "Cena", open: "20:00", lastSeating: "22:30" },
  ],
};
