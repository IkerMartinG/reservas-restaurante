# Casa Anaga: reservas de mesa online

Sistema de reservas para un restaurante (ficticio) de Tenerife: los clientes reservan desde la web
y el personal gestiona la sala desde un panel con una línea de tiempo por mesa.

**Stack:** Node.js 22 · Express 5 · MongoDB (Mongoose) · HTML, CSS y JavaScript sin frameworks.

## Qué hace

**Para el cliente**
- Elige personas, día y hora. Solo ve las horas en las que de verdad queda una mesa adecuada.
- Recibe un código de reserva (sin 0/O ni 1/I, para dictarlo por teléfono sin errores).
- Consulta o cancela su reserva con el código y su teléfono.

**Para el restaurante** (`/admin`)
- Línea de tiempo por mesa y servicio: se ve de un vistazo qué mesas están libres y cuándo.
- Estados de cada reserva: confirmada, sentada, completada, no vino o cancelada.
- Cambiar una reserva de mesa (solo si la nueva está libre durante toda la reserva).
- Meter reservas que llegan por teléfono.

## Decisiones técnicas

### Cómo se evitan las dobles reservas
Cada reserva ocupa la mesa 90 minutos, es decir, 3 bloques de 30. Por cada bloque se guarda un
documento en `SlotLock` y la colección tiene un **índice único `(mesa, día, bloque)`**.

Si dos personas intentan coger la misma mesa a la misma hora a la vez, MongoDB solo deja insertar a
una. La otra recibe un error `E11000`: se deshacen sus bloqueos parciales y se prueba la siguiente
mesa válida. Es atómico sin necesidad de transacciones ni replica set, así que funciona igual en
un MongoDB local que en Atlas.

### Asignación de mesa
Se elige la mesa válida más pequeña, y una mesa solo es válida si le sobran como mucho 2 sillas
(`maxExtraSeats`). Así no se sienta a una pareja en la mesa de 8 un sábado a las 21:00.

### Fechas sin líos de zona horaria
Las fechas se guardan como `"YYYY-MM-DD"` y las horas como minutos desde medianoche, siempre en
hora de Canarias. "Hoy" y "ahora" se calculan con `Intl` en `Atlantic/Canary`, así que da igual
dónde esté el servidor.

### Lógica separada de la base de datos
`src/lib/` contiene la disponibilidad, la validación, los tokens y las fechas como funciones puras.
Están cubiertas por tests (`npm test`) que no necesitan base de datos.

### Sesión del panel
Es un token firmado con HMAC-SHA256 (el mismo principio que un JWT, sin dependencias), con
caducidad de 12 horas y comparación de firma en tiempo constante.

## Estructura

```
src/
  config.js            Horarios, duración, tamaño máximo de grupo… (lo que cambia por cliente)
  app.js, server.js
  lib/                 Lógica pura: disponibilidad, fechas, validación, tokens
  models/              Table, Reservation, SlotLock
  services/            Reservas (crear, cancelar, mover) y avisos
  routes/              API pública y API del panel
  middleware/          Autenticación y errores
public/                Web del restaurante, "Mi reserva" y panel /admin
scripts/seed.js        Datos de ejemplo
test/                  Tests con node:test
```

## API

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/info` | Datos del restaurante y horarios |
| GET | `/api/availability?date=&partySize=` | Horas libres de un día para un grupo |
| POST | `/api/reservations` | Crear reserva |
| POST | `/api/reservations/lookup` | Ver reserva (código + teléfono) |
| POST | `/api/reservations/cancel` | Cancelar reserva (código + teléfono) |
| POST | `/api/admin/login` | Entrar en el panel |
| GET | `/api/admin/tables` | Mesas |
| GET | `/api/admin/reservations?date=` | Reservas del día |
| POST | `/api/admin/reservations` | Reserva por teléfono |
| PATCH | `/api/admin/reservations/:id` | Cambiar estado (`status`) o mesa (`tableId`) |

## Arrancarlo en local

Hace falta Node 22.9 o superior y un MongoDB (local o un cluster gratis de Atlas).

```bash
cp .env.example .env      # y rellena MONGODB_URI, ADMIN_PASSWORD y TOKEN_SECRET
npm install
npm run seed              # mesas y reservas de ejemplo
npm run dev               # http://localhost:3000 y http://localhost:3000/admin
npm test
```

## Desplegarlo gratis

1. Crea un cluster gratuito en MongoDB Atlas y copia la cadena de conexión.
2. En Render, crea un *Web Service* desde el repo con el build command `npm install` y el start
   command `npm start`.
3. Añade las variables `MONGODB_URI`, `ADMIN_PASSWORD`, `TOKEN_SECRET` y `NODE_ENV=production`.
4. Ejecuta `npm run seed` una vez desde la shell de Render para tener datos de ejemplo.

## Siguientes pasos

- Envío real de emails o WhatsApp en `src/services/notifier.js`.
- Limitar peticiones (rate limiting) en las rutas públicas.
- Recordatorio automático el día antes y lista de espera para horas completas.
