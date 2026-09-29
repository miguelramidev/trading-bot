# CLAUDE.md

Guía para Claude Code (claude.ai/code) al trabajar en este repositorio.

## ⚠️ Zona de peligro

- **Nunca** ejecutar `deploy`, `remove` ni `db:push` sin que yo lo pida explícitamente.
- Los scripts `test-*.ts` y `check-*.ts` de la raíz pueden operar contra Binance real: **preguntar antes de correrlos**.
- **Nunca** leer ni mostrar secretos, archivos `.env` ni claves de API.
- No modificar la lógica de apalancamiento de `RULES.md` sin tests que la cubran.

## Resumen del proyecto

Bot cuantitativo serverless para **Binance USDT Perpetual Futures**. Un cron corre cada 15 minutos: clasifica cada uno de los 100 pares de mayor volumen en un régimen de mercado (tendencia vs. rango), aplica cuatro estrategias en capas (incluyendo inversiones por funding rate / caza de liquidez e inversiones por breakout macro de BTC) y envía las señales por Telegram y push FCM. Cuando el usuario aprueba, el bot coloca órdenes reales de mercado + Stop Loss + Take Profit en Binance ("Sniper OCO" semi-automatizado).

- `CONTEXT.md`: pipeline algorítmico completo. Leerlo cuando haga falta.
- `RULES.md`: reglas de negocio. **La lógica de escalado de apalancamiento y validación de balance es la autoridad y no debe regresionarse.** Leerlo cuando haga falta.

Dos front-ends consumen el mismo backend: un **bot de Telegram** interactivo y una **app Flutter** web/móvil (ver `app/CLAUDE.md`).

## Comandos

Backend (TypeScript, desde la raíz; el gestor de paquetes es **pnpm**):

```bash
pnpm dev              # sst dev — desarrollo local con Lambda en vivo
pnpm run deploy       # tsc --noEmit (typecheck) Y LUEGO sst deploy --stage prod  ⚠️ solo si lo pido
pnpm run remove       # destruye el stack de SST  ⚠️ solo si lo pido
pnpm test             # vitest run (tests en tests/**/*.test.ts)
pnpm backtest         # tsx src/scripts/backtest.ts
pnpm db:push          # drizzle-kit push — aplica schema.ts a Neon  ⚠️ solo si lo pido
npx vitest run tests/sanity.test.ts   # correr un solo archivo de test
npx tsx <archivo>.ts   # ⚠️ scripts de prueba ad-hoc: pueden operar contra Binance real, preguntar antes de ejecutarlos (ver Zona de peligro)
```

`deploy` y `remove` son comandos nativos de pnpm: se debe usar `pnpm run deploy` / `pnpm run remove` para invocar los scripts de `package.json`.

## Arquitectura

**La infra se define de forma declarativa en `sst.config.ts`**: leerlo primero para entender qué corre dónde. Conecta:
- API Gateway `TelegramWebhook` → `src/telegram/webhook.handler` (comandos de Telegram + callbacks de botones inline)
- API Gateway `AppApi` (ruta `$default`) → `src/api/server.handler` (app Hono que sirve al front-end Flutter)
- `Cron15m` (cada 15 min) → `src/cron/analyze.handler15m` (loop principal de análisis + monitoreo de trades)
- `DailyReport` (02:00 UTC = 23:00 PYT) → `src/cron/report.handler` (snapshot diario de PnL)

En producción los secretos son **SST Secrets**, no variables de entorno. Todo handler debe estar `link`eado a `ALL_SECRETS` en `sst.config.ts` o no podrá leerlos. El código los lee con el patrón dual `process.env.X || (Resource as any).X.value`: la variable de entorno gana en local, el Resource de SST en Lambda.

Excepción: `TELEGRAM_WEBHOOK_SECRET` **no** está en `ALL_SECRETS`; solo se linkea al handler del webhook. Ese handler rechaza con 401 todo update sin el header `X-Telegram-Bot-Api-Secret-Token` correcto (verificación en `telegram/verifyWebhook.ts`, antes de parsear el body), deduplica por `update_id` (tabla `telegram_updates`) y siempre responde 200 al resto. El secret se setea a mano con `sst secret set` y se registra en Telegram con `setWebhook`.

Tampoco están en `ALL_SECRETS` las listas de permitidos, que se leen con el mismo patrón dual y **fallan cerrado** (si el secret falta o está vacío, se rechaza todo): `ALLOWED_FIREBASE_UIDS` (solo la API: uids separados por coma, 403 si el uid verificado no está) y `ALLOWED_CHAT_IDS` (solo el webhook: chats separados por coma; los updates de otros chats se ignoran).

**Dónde viven `DATABASE_URL` y `ENCRYPTION_KEY`:** en producción viven en SST Secrets; en local, en `.env`, que está ignorado por git. Nunca se escriben en el código (el hook de gitleaks bloquea el commit). `ENCRYPTION_KEY` (hex de 64 caracteres = 32 bytes) no tiene valor por defecto y se linkea explícitamente, sin pasar por `ALL_SECRETS`, a los cuatro handlers que cifran o descifran (webhook, API, `Cron15m` y `DailyReport`): si falta o es inválida, el proceso falla al iniciar con un error que no muestra la llave.

**Estructura del backend (`src/`):**
- `cron/analyze.ts` — el corazón del sistema (~660 líneas): monitorea trades abiertos por SL/TP y luego corre todo el pipeline de estrategias. Empezar acá para la lógica de señales.
- `bot/data.ts` — `DataFetcher`: datos de mercado de solo lectura vía CCXT (OHLCV, funding rate, open interest, universo por volumen, balance).
- `bot/trader.ts` — `Trader`: ejecución autenticada vía CCXT. `executeTrade()` implementa el algoritmo de escalado de apalancamiento de `RULES.md` Regla 1 (parte de `leverageMin`, sube hasta `leverageMax` para cumplir el `minNotional` de Binance; si no, rechaza — nunca un fallback con `Math.min`). `cleanOrphanOrders()` cancela órdenes SL/TP huérfanas cuya posición ya cerró.
- `telegram/webhook.ts` — bot Telegraf: `/start`, `/pause`, `/resume`, `/leverage` y el callback `[✅ Ejecutar Sniper]` que dispara la ejecución real.
- `api/` — API Hono. `server.ts` monta los routers de módulos bajo `/api/*`, todos detrás del middleware `api/core/middleware/firebaseAuth.ts`: verifica el ID token de Firebase (`verifyIdToken`) y el uid contra `ALLOWED_FIREBASE_UIDS`. **El uid sale solo de `c.get("uid")`, nunca del header ni del body.** La única ruta pública es `GET /`. Los errores 500 salen con `internalError()` (`api/core/utils/errors.ts`): mensaje genérico con id y el detalle solo en el log. Los módulos en `api/modules/{signals,users,dashboard,market,history}` siguen de forma laxa las capas domain/application/infrastructure (solo `users` está completamente desarrollado; el resto son controllers sueltos). Los imports requieren extensión `.js` (ESM NodeNext).
- `db/` — Drizzle ORM sobre **Postgres serverless de Neon**. `schema.ts` es la única fuente de verdad (`userConfig`, `signalHistory`, `dailyReports`, `telegramUpdates`). Precios/PnL se guardan como **text**, no numeric, para preservar la precisión decimal: parsear con `parseFloat` y nunca hacer cálculos del lado de la DB.
- `firebase.ts` — Firebase Admin para push FCM (la service account va en base64 en `FIREBASE_SERVICE_ACCOUNT_B64`). Si no está seteada, degrada a no-op.
- `api/core/utils/encryption.ts` — AES-256-GCM para las API keys de Binance de cada usuario (`iv:authTag:ciphertext`). `decrypt()` lanza ante cualquier valor que no tenga ese formato (nunca lo devuelve tal cual) y `encrypt()` lanza con un valor vacío. Los tests (`tests/encryption.test.ts`) arman la llave falsa en runtime con `"ab".repeat(32)`: no escribir un hex de 64 caracteres en el código.

## Convenciones y trampas

- **La región está fijada a `ca-central-1`** en `sst.config.ts` justamente para evitar bloqueos geo-IP de Binance. No cambiarla.
- La config de usuario tiene un campo legacy `apalancamiento`/`leverage` y el par canónico `leverageMin`/`leverageMax`; la lógica nueva usa el par min/max (ver `RULES.md`).
- Comentarios, documentos de negocio y textos de cara al usuario están en **español**; mantenerlo al editar.
- `scratch/` y `data_dl/` están en `.gitignore`; los `test-*.ts`/`check-*.ts` de la raíz son scripts de prueba ad-hoc, no la suite de vitest.
- `AUDITORIA.md` documenta cómo auditar la operación en vivo del bot; `ROADMAP.md` lleva el trabajo planificado.
- El proyecto usa TypeScript 7 (nativo). El LSP de Claude Code corre sobre TypeScript 6 global como respaldo, así que puede diferir levemente: la fuente de verdad para errores de tipos es `pnpm exec tsc --noEmit`.
- **Escaneo de secretos:** hay un hook de pre-commit (`.githooks/pre-commit`, se activa solo con `pnpm install` gracias al script `prepare`) que corre `gitleaks` sobre los cambios preparados y bloquea el commit si encuentra un secreto; requiere `brew install gitleaks`. Las reglas están en `.gitleaks.toml` (las por defecto más llaves de cifrado hexadecimales, URLs de Postgres con contraseña y contraseñas `npg_` de Neon) y los falsos positivos aprobados, por fingerprint, en `.gitleaksignore` (hoy solo las claves de cliente de Firebase, que son públicas). No ignorar archivos ni reglas enteras. Escaneo completo: `gitleaks dir . --redact` (árbol) o `gitleaks git . --log-opts="--all" --redact` (historial).
