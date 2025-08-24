# MyAgenda

SaaS de **agendas y reservas** multi-cliente. Cada cliente tiene su propio **URL** (p. ej. `clinicacaracas.myagenda.com`) y todo (tipos de evento, disponibilidad y reservas) se relaciona a su **owner user**.  
El **front** consume un **API Express** con **MySQL** guardando fechas en **UTC**.

---

## ✨ Características

- Multi-tenant por **host** (resolución por dominio/subdominio).
- Tipos de evento (duración + buffer).
- Disponibilidad semanal por cliente.
- Cálculo de **slots** respetando reservas existentes (sin solapamientos).
- Reservas en **UTC** (ideal para múltiples zonas horarias).
- CORS listo para front externo.
- PM2 + (opcional) reverse proxy con Apache.

---

## 🧱 Stack

- **Backend**: Node.js + Express, mysql2, Luxon, Zod, PM2  
- **DB**: MySQL 8 (fechas en **UTC** con `DATETIME(3)`)  
- **Frontend**: React + Vite (TS) *(consumiendo este API)*

---

## 📦 Estructura sugerida del repo

> Si tu repo contiene solo el API, ignora la carpeta `web/`.

```
MyAgenda/
  api/
    index.js
    db.js
    time.js
    routes/public.js
    .env.example
    package.json
  web/                       # (opcional) front en Vite
    src/...
    .env.example
  sql/
    schema.sql               # esquema completo de tablas
    seed_clinica_caracas.sql # seed de ejemplo
```

---

## 🗄️ Modelo de datos (resumen)

- `users` → **owner** (cliente): `id, slug, name, email, timezone, is_active`
- `domains` → dominios del owner: `user_id, domain, is_primary, env`
- `event_types` → tipos de evento: `user_id, slug, name, duration_min, buffer_min`
- `availability` → disponibilidad semanal: `user_id, weekday(0=Dom..6), start_min, end_min`
- `bookings` → reservas **UTC**: `user_id, event_type_id, guest_name, guest_email, starts_at, ends_at, status`
- `branding` (opcional): `favicon, logo, primary_hex, bg_hex, fg_hex`

> Índices clave:
> ```sql
> CREATE UNIQUE INDEX uq_domains_domain ON domains(domain);
> CREATE UNIQUE INDEX uq_event_types_user_slug ON event_types(user_id, slug);
> CREATE INDEX idx_av_user_day ON availability(user_id, weekday);
> CREATE INDEX idx_bookings_user_time ON bookings(user_id, starts_at, ends_at, status);
> ```

---

## ⚙️ Configuración rápida (API)

### 1) Requisitos
- Node.js ≥ 18
- MySQL ≥ 8

### 2) Variables de entorno (`api/.env`)
Copia desde `.env.example`:
```bash
API_HOST=0.0.0.0
API_PORT=5354

DB_HOST=127.0.0.1
DB_USER=root
DB_PASS=
DB_NAME=myagenda

ALLOWED_ORIGINS=*   # en prod: lista tus dominios separados por coma
```

> El pool fuerza `SET time_zone = '+00:00'` por conexión. Guarda SIEMPRE UTC.

### 3) Instalar dependencias
```bash
cd api
npm i
```

### 4) Base de datos
- Crea el esquema (ver `sql/schema.sql`) y, si quieres, usa el **seed** de ejemplo más abajo.

### 5) Levantar API

**Con PM2 (rápido):**
```bash
API_HOST=0.0.0.0 API_PORT=5354 pm2 start index.js --name myagenda-api
pm2 logs myagenda-api
```

**Con Node:**
```bash
npm run dev
# API listening on http://0.0.0.0:5354
```

---

## 🔌 Endpoints públicos

> Todos aceptan `host` por **query** o header `X-Owner-Host`.  
> El backend resuelve el **owner** por dominio y filtra por `user_id`.

### Perfil del owner
```
GET /public/profile?host=clinicacaracas.myagenda.com
```

**200**
```json
{
  "id": "1",
  "slug": "clinicacaracas",
  "name": "Clínica Caracas",
  "favicon": "/favicon.ico",
  "logo": null,
  "theme": { "primary": "#2563EB", "bg": "#FFFFFF", "fg": "#111111" }
}
```

### Tipos de evento
```
GET /public/event-types?host=clinicacaracas.myagenda.com
```
**200**
```json
{
  "items": [
    { "id":"10","slug":"consulta-30","name":"Consulta (30 min)","description":"...","durationMin":30 }
  ]
}
```

### Slots disponibles (por día)
```
GET /public/slots?host=clinicacaracas.myagenda.com&eventType=consulta-30&date=2025-08-25
```
**200**
```json
{
  "slots": [
    { "iso":"2025-08-25T13:00:00.000Z", "label":"09:00" },
    { "iso":"2025-08-25T13:30:00.000Z", "label":"09:30" }
  ]
}
```
> `label` en hora local del cliente; `iso` en **UTC**.

### Crear reserva
```
POST /public/book?host=clinicacaracas.myagenda.com
Content-Type: application/json
{
  "eventType": "consulta-30",
  "guestName": "Ana",
  "guestEmail": "ana@x.com",
  "startISO": "2025-08-25T13:00:00.000Z"  // UTC
}
```
**200**
```json
{ "ok": true, "id": "123" }
```
- Evita doble reserva con transacción + `SELECT ... FOR UPDATE`.
- Rechaza con `409 { "error":"slot_taken" }` si ya está ocupado.

---

## 🧪 Pruebas rápidas (cURL de ejemplo)

> Ejemplo actual: `api.tudominio.com`

```bash
# Profile
curl "api.tudominio.com/public/profile?host=clinicacaracas.myagenda.com"

# Event types
curl "api.tudominio.com/public/event-types?host=clinicacaracas.myagenda.com"

# Slots
curl "api.tudominio.com/public/slots?host=clinicacaracas.myagenda.com&eventType=consulta-30&date=2025-08-25"

# Book
curl -X POST "api.tudominio.com/public/book?host=clinicacaracas.myagenda.com" \
  -H "Content-Type: application/json" \
  -d '{"eventType":"consulta-30","guestName":"Ana","guestEmail":"ana@x.com","startISO":"2025-08-25T13:00:00.000Z"}'
```

---

## ⏱️ Migración a UTC (solo si antes guardabas en otra zona)

**1) Asegura UTC en MySQL y en Node**

```sql
-- sesión
SET time_zone = '+00:00';
-- global (hasta reinicio)
SET GLOBAL time_zone = '+00:00';
```


---

## 🌱 Seed SQL (Clínica Caracas)

> Ejecuta después de tener el `schema.sql` importado.

```sql
USE myagenda;

-- Owner (cliente)
INSERT INTO users (slug, name, email, timezone)
VALUES ('clinicacaracas', 'Clínica Caracas', 'admin@clinicacaracas.com', 'America/Caracas');

-- URL pública (prod)
INSERT INTO domains (user_id, domain, is_primary, env, verified_at)
SELECT id, 'clinicacaracas.myagenda.com', 1, 'prod', NOW()
FROM users WHERE slug='clinicacaracas';

-- Branding simple
INSERT INTO branding (user_id, favicon, logo, primary_hex, bg_hex, fg_hex)
SELECT id, '/favicons/clinicacaracas.svg', '/logos/clinicacaracas.png', '#2563EB', '#FFFFFF', '#111111'
FROM users WHERE slug='clinicacaracas';

-- Tipos de evento
INSERT INTO event_types (user_id, slug, name, description, duration_min, buffer_min)
SELECT id, 'consulta-30', 'Consulta (30 min)', 'Consulta general', 30, 0
FROM users WHERE slug='clinicacaracas';

INSERT INTO event_types (user_id, slug, name, description, duration_min, buffer_min)
SELECT id, 'evaluacion-60', 'Evaluación (60 min)', 'Primera evaluación', 60, 0
FROM users WHERE slug='clinicacaracas';

-- Disponibilidad semanal (Lu-Vi 09:00-12:00 y 14:00-17:00)
-- Nota: weekday usa 0=Dom ... 6=Sab
-- Mañana
INSERT INTO availability (user_id, weekday, start_min, end_min)
SELECT id, 1, 9*60, 12*60 FROM users WHERE slug='clinicacaracas';
INSERT INTO availability (user_id, weekday, start_min, end_min)
SELECT id, 2, 9*60, 12*60 FROM users WHERE slug='clinicacaracas';
INSERT INTO availability (user_id, weekday, start_min, end_min)
SELECT id, 3, 9*60, 12*60 FROM users WHERE slug='clinicacaracas';
INSERT INTO availability (user_id, weekday, start_min, end_min)
SELECT id, 4, 9*60, 12*60 FROM users WHERE slug='clinicacaracas';
INSERT INTO availability (user_id, weekday, start_min, end_min)
SELECT id, 5, 9*60, 12*60 FROM users WHERE slug='clinicacaracas';
-- Tarde
INSERT INTO availability (user_id, weekday, start_min, end_min)
SELECT id, 1, 14*60, 17*60 FROM users WHERE slug='clinicacaracas';
INSERT INTO availability (user_id, weekday, start_min, end_min)
SELECT id, 2, 14*60, 17*60 FROM users WHERE slug='clinicacaracas';
INSERT INTO availability (user_id, weekday, start_min, end_min)
SELECT id, 3, 14*60, 17*60 FROM users WHERE slug='clinicacaracas';
INSERT INTO availability (user_id, weekday, start_min, end_min)
SELECT id, 4, 14*60, 17*60 FROM users WHERE slug='clinicacaracas';
INSERT INTO availability (user_id, weekday, start_min, end_min)
SELECT id, 5, 14*60, 17*60 FROM users WHERE slug='clinicacaracas';
```

---

## 🌐 Apache (opcional: reverse proxy)

Reverse proxy típico para `tudominio.com` → `127.0.0.1:5354`:

```apache
<VirtualHost *:80>
  ServerName tudominio.com
  RewriteEngine On
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</VirtualHost>

<VirtualHost *:443>
  ServerName tudominio.com
  SSLEngine on
  SSLCertificateFile /etc/letsencrypt/live/tudominio.com/fullchain.pem
  SSLCertificateKeyFile /etc/letsencrypt/live/tudominio.com/privkey.pem

  ProxyPreserveHost On
  ProxyPass        / http://127.0.0.1:5354/
  ProxyPassReverse / http://127.0.0.1:5354/

  ErrorLog  ${APACHE_LOG_DIR}/api_auraux_error.log
  CustomLog ${APACHE_LOG_DIR}/api_auraux_access.log combined
</VirtualHost>
```

---

## 🛡️ Notas

- **UTC en DB**: simplifica todo. Mostrar en local con `owner.timezone`.
- Valida siempre `host` y que el **owner** esté activo.
- Mantén `ALLOWED_ORIGINS` acotado en producción.
- Para concurrencia, el endpoint de `book` usa transacción + `SELECT ... FOR UPDATE`.

---

## 📜 Licencia

MIT