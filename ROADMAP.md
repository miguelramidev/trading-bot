# ROADMAP - Trading Bot (Hono + SST)

## 1. Configuración de Entorno e Infraestructura Base - [Completado]
* [x] Inicializar proyecto Hono con TypeScript.
* [x] Configurar SST (Serverless Stack) v3.
* [x] Configurar cuenta AWS (Credenciales, IAM).
* [x] Deploy inicial del "Hello World" en AWS Lambda.

## 2. Desarrollo del Core del Bot - [Completado]
* [x] Configurar Bot de Telegram (Obtener Token).
* [x] Configurar Webhook de Telegram hacia el endpoint de AWS.
* [x] Parsear comandos básicos de Telegram (`/start`, `/status`).
* [x] Implementar manejador de comandos.

## 3. Integración de Datos del Mercado - [Completado]
* [x] Integrar API de Binance (via SDK o Fetch).
* [x] Tarea Programada (Cron): Obtener el Top 100 de monedas por volumen.
* [x] Filtrar pares válidos (USDT, evitar stablecoins/fiat).
* [x] Extraer precios actuales de la lista Top 100.

## 4. Estrategia de Análisis Técnico - [Completado]
* [x] Descargar datos históricos (OHLCV) necesarios para indicadores.
* [x] Implementar cálculo de EMA (20, 50, 200).
* [x] Implementar lógica: Precio actual > EMA 200 y Precio retrocediendo a EMA 50.
* [x] Guardar resultados del análisis en memoria temporal/logs.

## 5. Base de Datos - [Completado]
* [x] Configurar Drizzle ORM.
* [x] Conectar con Neon Database (PostgreSQL).
* [x] Crear tabla `users` (chatId, permisos, balance_inicial, api_keys).
* [x] Crear tabla `signals` (moneda, tipo, precio_entrada, sl, tp, fecha).
* [x] Guardar el Top 10 analizado de monedas en la BD (o enviarlo directamente).

## 6. Sistema de Alertas Proactivo - [Completado]
* [x] Refactorizar la estructura de directorios (`src/bot`, `src/cron`, `src/db`).
* [x] Crear Cron Job (Ejecución cada 15m).
* [x] Integrar análisis de 100 monedas dentro del Cron Job.
* [x] Filtrar y ordenar las mejores monedas que cumplen el patrón.
* [x] Enviar un mensaje resumen con las "10 Mejores Opciones" a los usuarios suscritos en Telegram cada vez que el Cron se ejecuta.
* [x] Deshabilitar el mensaje al bot en sí (se envían notificaciones push desde el Cron Job).

## 7. Pruebas y Backtesting en Local - [Completado]
* [x] **Preparación de Scripts:** Se creó la infraestructura para procesar años de datos.
    - [x] Herramienta `download_historical.py` completada para descargar masivamente Klines de Binance.
    - [x] Primer archivo CSV (`BTCUSDT_15m.csv`) de 3 años y medio (2021-2024) procesado exitosamente.
* [x] **Ejecución de Backtesting Vectorizado:** 
    - [x] Implementado script `ema_strategy_test.py` con vectorización rápida en pandas.
    - [x] Prueba Unitaria BTC de la Estrategia EMA superó la línea base al reducir la caída (EMA BTC: 43.7% ROI, **19% Max DD**, Winrate 27%).

## 8. Paper Trading Institucional (Estrategia 15m) - [Completado]
* [x] **Motor de Estrategia Dual:** Análisis algorítmico dividido por el régimen del mercado usando ADX.
* [x] **Gestor de Posiciones en Telegram:** Transición del bot para operar 100% en *Paper Trading*, enviando alertas ricas a Telegram con botones interactivos (`✅ Tomar Trade`, `❌ Descartar`) apoyado en Neon DB.
* [x] **Rastreo de Datos Institucionales:** Incorporación de *Funding Rate* y el porcentaje de cambio del *Open Interest*.
* [x] **Correlación Automática con BTC:** Inclusión del cálculo estadístico de Pearson.
* [x] **Limitadores de Exposición:** Lógica incorporada para restringir operaciones simultáneas.

## 9. Transición y Filtros Cuantitativos - [Completado]
* [x] **Auditoría de Saldo Real:** Integración nativa con los *SST Secrets* de AWS para leer vía CCXT el balance libre real.
* [x] **Optimización Cuantitativa de Riesgo (Ratio 1:2):** Ajuste de las fronteras de los Kill Switches.
* [x] **Estrategia 3 (Inversión por Macro Breakout):** Inyección de un lector cruzado del gráfico Diario (1D) de Bitcoin.
* [x] **Estrategia 4 (Liquidity Hunter):** Análisis del Funding Rate.

## 10. Ejecución Real Semiautomatizada (Sniper Bot) - [Completado]
* [x] **Enrutador de Órdenes OCO (One-Cancels-the-Other):** Implementación de la clase `Trader` que se conecta por CCXT.
* [x] **Cálculo Dinámico de Posición y Apalancamiento.**
* [x] **Botón de Fuego Real:** Transición final del botón "Tomar Trade".

## 11. Refactorización Matemática (Quant V2) - [Completado]
* [x] **Auditoría de Pérdidas (Base de Datos):** Tras una racha de 8W-34L, se analizó la BD para descubrir que la Estrategia EMA21 y el rebote a ciegas en Bollinger Bounds generaban pérdidas continuas.
* [x] **Sustitución de Estrategias (Core Swap):** 
    - [x] **Estrategia 1:** Reemplazo de EMA21 por MACD Zero-Cross Pullback (validado matemáticamente como rentable).
    - [x] **Estrategia 2:** Reemplazo del rebote en BB por "Liquidity Sweep" (Falso Quiebre / Fakeout). 
* [x] **Blindaje del Seguro Macro:** Se validó que invertir la señal al cruzarse con BTC (Estrategia 3) es un edge estadístico extremadamente rentable (Arbitraje Estadístico de Dip Buying).
* [x] **Corrección del Escudo Funding Rate:** En lugar de operar agresivamente como Kamikaze contra los shorts, ahora el Funding Rate solo aborta trades si el mercado está en un extremo de euforia/pánico severo (>-0.05%), evitando la "asfixia" por el 0.01% base del criptomercado.
* [x] **Recuperación Lineal (Position Sizing):** Transición del arriesgado porcentaje compuesto (20% del balance) a un monto fijo y seguro de **$25 USDT por trade** para evitar que las rachas perdedoras asfixien el capital por reducción exponencial de posiciones.

## 12. Plataforma SaaS Visual (Monorepo Flutter) - [Completado]
* [x] **Arquitectura Monorepo Iniciada:** Backend (Hono/TypeScript) y Frontend (Flutter) coexistiendo en la misma infraestructura.
* [x] **Conceptualización de Diseño (UI/UX):** Definidos los Prompts visuales de estilo "Premium Glassmorphism" y "Dark Mode Institucional" para:
    - [x] 1. Pantalla de Login Minimalista
    - [x] 2. Dashboard Resumen (Balance, PnL, Órdenes Rápidas)
    - [x] 3. Detalle y Aprobación de Trade (Vista de 3 Gráficos: 15m, 4H, 1D BTC)
    - [x] 4. Detalle Técnico de Trade Activo (Puros números Monoespaciados)
    - [x] 5. Historial Contable Estático
    - [x] 6. Panel de Ajustes Algorítmicos (Switches y API Config)
* [x] **Sistema de Autenticación & Seguridad (Flutter):**
    - [x] Integración de Firebase Auth & Google Sign-In.
    - [x] Desarrollo de `LoginScreen` ultra-responsivo (Mobile Glassmorphism & Web Split-Card).
    - [x] Implementación de Autenticación Biométrica Nativa (`local_auth`).
* [x] **Arquitectura Multi-Tenant (B2B SaaS):**
    - [x] Migración del esquema Neon DB para soportar `user_config` vinculado a `firebase_uid`.
    - [x] Encriptación asimétrica militar (RSA/Ed25519) / AES-256-GCM para proteger las API Keys de Binance.
    - [x] Conversión del Bot y Cron Jobs a un bucle **"Per-User" real**: El cron `analyze.ts` escanea el mercado y luego itera sobre cada usuario, usando sus llaves encriptadas para validar saldos y ejecutar su gestión de riesgo de forma 100% aislada.
    - [x] Fusión de cuentas y refactorización de Webhook: Soporte dual Telegram/FCM donde los usuarios pueden interactuar con los botones de Telegram ejecutando las órdenes en su cuenta personal de Binance (aislada del bot global).
* [x] **Dashboard Interactivo en Vivo:**
    - [x] Sustitución de *Mock Data* por endpoints reales (`/api/dashboard`).
    - [x] Creación de `daily_reports` para mapear los historiales de capital por usuario y trazarlos usando `fl_chart` (Gráfico de rendimiento de capital a 30 días).
    - [x] Formateo condicional avanzado (Textos Rojos/Verdes dependiendo de PnL y escape estricto de variables en Dart).
    - [x] Adaptación Dual (Desktop & Mobile) sincronizada mediante botones manuales de Refresh para ahorrar ancho de banda de Websockets.
* [x] **Módulo de Señales y Trade Execution:** 
    - [x] Reparación de Rutas GoRouter (context.go) para mantener las URLs independientes en la barra de direcciones del navegador.
    - [x] Simplificación visual en Desktop (remover botones falsos) y fijar decimales a 4 dígitos en precios.
    - [x] **Firebase Cloud Messaging (FCM) Multi-Dispositivo:** Implementadas notificaciones Push reales para Web y Android simultáneamente (vía fcm_tokens array). Alertas de "Nueva Señal" y "Trade Cerrado" activas desde el backend Serverless.

## 13. Estabilización de Infraestructura y Resolución de Bugs Críticos - [Completado]
* [x] **Compatibilidad Total de Llaves RSA (Asimétricas):** Parcheado el motor `Trader` (tanto en `analyze.ts` como en `webhook.ts`) para desencriptar y autenticarse en Binance usando la llave RSA privada del usuario, alineando el backend con el nuevo dashboard.
* [x] **Prevención de Caídas Silenciosas de API (CCXT):** Suprimido el error fatal `warnWithoutSymbol` introducido por las nuevas políticas estrictas de la API de Binance al limpiar órdenes huérfanas, permitiendo que el Cron vuelva a iterar sobre el Top 100 sin morir al inicio.
* [x] **Parche de Ámbito Multi-Tenant (ReferenceError):** Corregido un bug crítico de alcance de variables donde `currentBinanceBalance` no existía al insertar la señal global en NeonDB, lo que causaba que oportunidades matemáticas perfectas (como `1000BONK`) se desecharan en la fase de guardado.
* [x] **Notificaciones Resilientes (Try-Catch):** Encapsulado el bloque de envíos a Telegram y a Firebase (Push) en bloques de captura de errores individuales. Ahora, si el token FCM de un usuario expira o falla, el bot no interrumpe el ciclo y continúa enviando la señal al resto del pool.
* [x] **Trampa In-cerrable UI (Dashboard Modal):** Se interceptaron los códigos HTTP 500 y el flag `setup_required` en Flutter para lanzar un `WillPopScope` (Modal in-cerrable) obligando visualmente a los usuarios sin API Keys a navegar a Ajustes, impidiendo que rompan la carga del Dashboard.
---

## 🚨 ACCIONES PENDIENTES URGENTES (RECORDATORIO DE SEGURIDAD) 🚨
* [ ] **Rotar Contraseña de Neon DB:** El password antiguo (`npg_**********...`) fue revocado/expuesto por GitHub. Acceder a [console.neon.tech](https://console.neon.tech), generar una nueva contraseña para el rol `neondb_owner`.
* [ ] **Actualizar Entorno Local:** Cambiar la variable `DATABASE_URL` en el archivo `.env` del repositorio local.
* [ ] **Actualizar Entorno AWS/SST:** Actualizar los secretos/variables de entorno de SST y volver a hacer deploy si es necesario para que el bot y el dashboard vuelvan a conectarse a la base de datos de Neon.

---

## 14. Pendientes Técnicos (detectados al limpiar `tsc`)
* [ ] **`Trader.getFreeBalance()` confunde error de red con saldo 0:** captura cualquier excepción y devuelve `0` (`src/bot/trader.ts:26`), igual que cuando el usuario no tiene API key. En `analyze.ts` eso hace que un fallo de Binance se trate como "saldo 0": el filtro de saldo insuficiente no se aplica y el mensaje muestra "Tu Balance: $0.00". Diseñar un retorno que distinga "sin llaves" de "error al consultar" (por ejemplo `number | null`, o dejar propagar el error) y decidir qué hacer con el usuario en cada caso.
* [ ] **Definir una regla única de notificación por saldo:** hoy `analyze.ts` (filtro de la línea ~553) es inconsistente. Un usuario con saldo 0 (sin llaves, o error al consultar Binance) recibe la señal con un aviso de balance insuficiente, pero uno con `0 < saldo < margen` no recibe nada (el `continue` salta también el push FCM). Decidir un criterio único (notificar siempre con aviso, o no notificar siempre) y documentarlo en `RULES.md`; debe resolverse junto con el ítem de `getFreeBalance` para poder distinguir "sin llaves" de "error de red". La validación autoritativa de la Regla 2 sigue en `executeTrade`.
* [ ] **Guardar el apalancamiento usado en `signalHistory` (opción A):**
    - [ ] Agregar la columna `leverage` (integer, nullable) a `signalHistory` en `schema.ts` y aplicarla con `db:push` (solo a pedido explícito).
    - [ ] **Antes de tocar `executeTrade`**, escribir tests de vitest que cubran el escalado de apalancamiento de `RULES.md` Regla 1 (incluidos los invariantes: nunca por debajo de `leverageMin`, nunca por encima de `leverageMax`, rechazo si no alcanza el `minNotional`, y `leverageMin == leverageMax`).
    - [ ] Hacer que `executeTrade` exponga el apalancamiento aplicado y guardarlo en `signalHistory` al ejecutar (desde `SignalController` y `webhook.ts`).
    - [ ] `HistoryController` deja de devolver `leverage: null` y lee la columna; Flutter ya muestra "—" cuando el valor es `null`.
* [ ] **Tabla `trade_executions` (una fila por usuario y por señal ejecutada):**
  hoy `signal_history` es una fila global por señal, pensada para un solo
  usuario/paper-trading, y ya no alcanza para lo multi-tenant: `decision`
  bloquea la señal para todos (A3), no guarda apalancamiento (opción A de
  arriba), y `account_balance`/`realized_roi` quedaron rotos por el
  refactor multi-tenant del 2026-09-25 (commit `eff06ec`, ver la skill
  `auditoria-trades`) porque no hay dónde poner un balance *por usuario*
  en una fila *global*. Propuesta: `trade_executions(id, signal_id →
  signal_history.id, user_id → user_config.id, leverage, margin_usdt,
  quantity, entry_price, exit_price, opened_at, closed_at, close_reason,
  realized_pnl, fee, executed_at)`. Con esto:
  - Resuelve **A1** (la reserva atómica pasa a ser un `INSERT` único por
    `(signal_id, user_id)` con constraint única, en vez de un `UPDATE`
    sobre una fila compartida).
  - Resuelve **A3** (cada usuario tiene su propia fila de ejecución;
    `signal_history.decision` puede volver a ser solo el estado de la
    señal en sí, no "quién la tomó").
  - Resuelve la **opción A** (apalancamiento) sin necesidad de la columna
    suelta en `signal_history`: queda junto al resto de los datos de la
    ejecución real.
  - Resuelve el **ROI**: `margin_usdt` queda fijado en el momento de la
    ejecución, por usuario, en vez de depender de un `account_balance`
    global en `signal_history` que dejó de tener sentido apenas hubo más
    de un usuario.
  No implementar sin antes migrar el histórico de `signal_history` que
  ya tiene `realized_pnl`/`executed_entry_price`, y sin tests que cubran
  la reserva atómica (A1) — ver la skill `reglas-trading` antes de tocar
  esto.

---

## 15. Auditoría de Seguridad de Puntos de Entrada
**Tanda 1 (desplegada):**
* [x] **C2:** borrada la ruta `GET /api/users` (devolvía todas las filas de `userConfig`, con los cifrados de las llaves de Binance). Nadie la usaba.
* [x] **C4:** el webhook de Telegram verifica `X-Telegram-Bot-Api-Secret-Token` en tiempo constante antes de parsear, deduplica por `update_id` (`telegram_updates`, falla cerrado) y siempre responde 200 tras autenticar. Timeout de 30 s.
* [x] **Despliegue de la tanda 1:** tabla `telegram_updates` creada a mano en Neon → `sst secret set TELEGRAM_WEBHOOK_SECRET` → `setWebhook` con `secret_token` → `pnpm run deploy`. Verificado: 401 sin header y con header incorrecto, y `/status` responde.

**Tanda 2 (desplegada y verificada):**
* [x] **C1:** middleware central `verifyIdToken` en `/api/*` (`api/core/middleware`). El uid sale solo del token verificado. Única ruta pública: `GET /` (health). Flutter manda `getIdToken()` y reintenta una vez con token nuevo ante un 401.
* [x] **Lista de permitidos:** secret `ALLOWED_FIREBASE_UIDS` (uids separados por coma). Uid verificado que no está en la lista: 403. Sin el secret configurado: 403 para todos (falla cerrado).
* [x] **A4:** `discard` (y `execute`) quedan detrás del mismo middleware.
* [x] **A5:** secret `ALLOWED_CHAT_IDS`; el bot ignora cualquier update (comando, callback o `/start`) de un chat que no esté en la lista. Sin el secret: ignora todo.
* [x] **M1:** borrada `PATCH /api/users/:chatId/pause` (nadie la usaba).
* [x] **M2:** `POST /api/users/sync` toma uid y email del token; del body solo el nombre.
* [x] **M3:** los 500 devuelven `{error:"Error interno", errorId}` y el detalle queda solo en el log. El texto de un `❌ Error Fatal` de `executeTrade` tampoco llega al cliente.
* [x] Borradas `GET /api/signals` y `GET /api/signals/:id` (nadie las usaba; parte de L1).
* [x] **Despliegue de la tanda 2 (hecho):** `sst secret set ALLOWED_FIREBASE_UIDS` y `ALLOWED_CHAT_IDS` (`--stage prod`) → `pnpm run deploy` (backend; desde acá la app vieja recibe 401) → `git push` a `main` (Amplify despliega la web) → compilar e instalar el APK de Android. Telegram sigue operativo durante el corte.

**Tanda 3 (desplegada y verificada):**
* [x] **C3:** `ENCRYPTION_KEY` sin valor por defecto. Es un Secret de SST (`sst.config.ts`) linkeado explícitamente a los cuatro handlers que cifran o descifran (webhook, API, `Cron15m`, `DailyReport`), no a `ALL_SECRETS`. Se valida al importar `encryption.ts` (64 hex = 32 bytes): si falta o es inválida el proceso falla al iniciar, con un error que no muestra la llave. Estrategia: no se migran los datos cifrados; se borran y se cargan llaves nuevas de Binance desde la app.
* [x] **L5:** `decrypt()` lanza ante cualquier valor que no tenga el formato `iv:authTag:ciphertext` (antes lo devolvía tal cual); `encrypt("")` también lanza. Los mensajes de error no incluyen el valor. Tests en `tests/encryption.test.ts`.
* [x] Arreglos chicos: el callback de Telegram valida al usuario y sus llaves antes de la primera respuesta (antes el aviso de llaves faltantes se perdía); `POST /api/users/keys/generate` responde 404 si no existe la fila del usuario (antes devolvía éxito sin guardar nada).
* [x] Escaneo de secretos: hook de pre-commit con gitleaks (`.githooks/`, activado por `prepare`), `.gitleaks.toml` con reglas propias, `.gitleaksignore` (claves públicas de Firebase y las URLs de Neon del commit `b4ab0c5`, cuya contraseña ya fue rotada). Borrados los scripts de `scratch/` con secretos o URLs de base y, con `git rm`, `check-balance.ts` y `test-balance2.ts` de la raíz (estaban rotos).
* [x] **Despliegue de la tanda 3 (hecho, en este orden):** `sst secret set ENCRYPTION_KEY` con `openssl rand -hex 32` (`--stage prod`; y agregarla al `.env` local) → borrar en Binance las API keys viejas (sin posiciones abiertas que dependan del bot; los SL/TP ya colocados se mantienen) → en Neon, `UPDATE user_config SET binance_api_key = NULL, binance_api_secret = NULL, rsa_private_key = NULL, rsa_public_key = NULL` → `pnpm run deploy` → verificar (`/status` responde, el dashboard pide configurar las API Keys, el próximo tick del cron sin errores) → en la app generar el par de claves (después del deploy, para que se cifre con la llave nueva) → en Binance crear una API key nueva con esa clave pública (Ed25519, Futures habilitado, retiros deshabilitados) → pegar la API key en la app y guardar.
* [x] **Fingerprints del `.gitleaksignore`:** agregados los de `test_pem.js` (commit `7a9e03d`, dos claves privadas de prueba; las API keys viejas de Binance ya están borradas) y el de la llave de cifrado vieja de `b4ab0c5`. El escaneo del historial queda sin hallazgos.

**Pendientes (por gravedad):**
* [ ] **A1 (alta):** doble ejecución posible (check-then-act no atómico). Reservar la señal con un UPDATE atómico antes de operar y revisar posiciones abiertas del símbolo. La dedupe por `update_id` solo cubre reentregas de Telegram, no un doble toque.
* [ ] **A2 (alta):** la API web ejecuta señales viejas sin límite de edad (Telegram: 15 min). Función compartida "señal ejecutable" (edad, deriva de precio, SL/TP del lado correcto).
* [ ] **A3 (alta):** `signalHistory` no tiene dueño y `decision` es global: un usuario que actúa bloquea la señal para todos, y cualquiera puede ejecutar cualquier id. Tabla de decisiones por usuario.
* [x] **A6:** `executeTrade` ahora reintenta el SL/TP (2 reintentos, 800 ms) con `clientOrderId` fijo por orden (evita duplicar si un reintento choca con un intento anterior que sí llegó — Binance responde `-20132`, tratado como éxito). Si el SL agota los reintentos, cierra la posición a mercado (`reduceOnly`, tamaño real vía `fetchPositions`, no el `amount` calculado) y barre las órdenes que hayan quedado del símbolo. El resultado ya no es un string con emojis: `executeTrade` devuelve `{ status: "ejecutado"|"rechazado"|"advertencia"|"critico", mensaje }`. Tests en `tests/trader.test.ts`.
* [x] **A7:** si `setLeverage` falla, aborta antes de colocar cualquier orden (`status: "rechazado"`). Verificado contra ccxt 4.5.76: Binance/ccxt son idempotentes con el leverage ya seteado, así que cualquier error acá es real, no un falso positivo que haya que perdonar.
* [x] **A8:** si `setMarginMode('isolated', ...)` falla, aborta igual. Verificado contra ccxt 4.5.76: el caso "ya estaba en isolated" (Binance `-4046`) ya lo traga ccxt internamente por default (`throwMarginModeAlreadySet: false`), así que no hace falta distinguirlo a mano — cualquier excepción que llegue al bot es un fallo real (ej. `-4048`, no se puede cambiar con posición abierta).
* [x] **M6:** `executeTrade` valida `leverageMin <= leverageMax` al principio, antes de tocar el exchange; rechaza si no se cumple.
* [ ] **A9 (media — reclasificado, ver nota):** `cleanOrphanOrders()` usa `fetchOpenOrders()`/`cancelAllOrders()` sin el flag `trigger`, que en Binance Futures **no ve ni cancela las algo orders** (los SL/TP condicionales que coloca `executeTrade` vía `/fapi/v1/algoOrder`, con `stopPrice`). Verificado contra la documentación oficial (`developers.binance.com`, endpoint New Order): `closePosition` solo se describe como "Close-All, used with STOP_MARKET or TAKE_PROFIT_MARKET" — **no dice en ningún lado que la orden hermana se cancele sola** cuando la otra se dispara o la posición se cierra por otro medio. Binance Futures no tiene OCO nativo (a diferencia de Spot): un reporte de la comunidad (`node-binance-api` issue #776) lo confirma en la práctica — "si una se ejecuta, la otra persiste", actuando como una operación en sentido contrario no deseada. Casos concretos donde podría quedar un huérfano real:
  - El SL se dispara normalmente (no vía el cierre de emergencia de A6, que sí barre con `{trigger:true}`) → el TP queda resting indefinidamente. Ídem al revés.
  - Si el bot vuelve a abrir posición en el mismo símbolo antes de que ese TP/SL viejo se limpie a mano, la orden vieja (con el stopPrice/take-profit de la operación anterior) puede dispararse contra la posición **nueva**, cerrándola o moviéndola en un momento que no tiene nada que ver con la operación actual.
  - Órdenes algo acumuladas sin límite también consumen el cupo de órdenes abiertas de la cuenta en Binance, lo que eventualmente podría bloquear la colocación de un SL/TP legítimo.

  **Reclasificado de alta a media** (2026-09-30): reviné órdenes condicionales abiertas en la cuenta real y solo aparecen el SL y el TP de la posición actual — sin huérfanos de operaciones anteriores acumulados en el uso real hasta ahora. La doc de Binance sigue sin garantizar la cancelación automática (sigue siendo un riesgo latente, no descartado), pero no hay evidencia de que se materialice en este uso. El arreglo (`fetchOpenOrders(symbol, undefined, undefined, {trigger:true})` / `cancelAllOrders(symbol, {trigger:true})` en `cleanOrphanOrders()`) queda como red de seguridad pendiente, no urgente.
* [ ] **M4, M5, M7 (media):** CORS `*` y sin rate limiting (con tokens verificados es menos grave, pero sigue abierto); Regla 3 sin aplicar del lado servidor; `/api/history/:id` sin ownership (con un solo usuario en la lista baja de prioridad).
* [ ] **L2–L6 (baja):** `market/klines` sin validar parámetros; alta de token FCM no atómica; `reason` de señales editable desde Telegram sin ownership; el dashboard no filtra trades activos por usuario.
* [ ] **Flutter: mensaje ante 401/403 definitivo:** hoy el dashboard muestra su modal de configuración de API Keys aunque el problema sea de sesión o de cuenta no autorizada. Mostrar "cuenta no autorizada" o volver al login.
* [ ] **Constraint única de `firebase_uid` en `user_config`:** está en `schema.ts` pero no en la base real (`db:push` la propuso con un truncate y se canceló). Aplicarla con un `ALTER TABLE` puntual, después de comprobar que no hay duplicados.

---

## 16. Multiusuario (futuro)
Hoy el acceso lo controlan dos secrets de SST (`ALLOWED_FIREBASE_UIDS` y `ALLOWED_CHAT_IDS`): agregar un usuario exige `sst secret set` y un deploy, y no hay roles. Este diseño los reemplaza por estado de aprobación y rol guardados en la base, y por una vinculación de Telegram con código de un solo uso. Es solo un plan: nada de esto está implementado.

**Prerrequisitos (no empezar antes de cerrarlos):**
* [x] **C3 cerrado** (tanda 3 desplegada): `ENCRYPTION_KEY` como Secret de SST sin valor por defecto, rotada, con las llaves re-encriptadas y las API keys de Binance rotadas. No se deben guardar llaves de terceros con una llave de cifrado comprometida.
* [ ] **A3:** ownership por usuario de las señales (tabla de decisiones por `(uid, signalId)` con registro de a quién se notificó). Sin esto, la decisión de un usuario bloquea la señal para los demás y cualquiera puede ejecutar cualquier id.
* [ ] **M7:** `/api/history/:id` valida que el trade pertenezca al usuario autenticado.
* [ ] **L6:** el dashboard filtra los trades activos por usuario, para no filtrar SL, TP y estrategia de trades ajenos.
* [ ] **Constraint única de `firebase_uid`** aplicada en la base (ver el pendiente de la sección 15): el alta por `sync` no debe poder duplicar filas con estado.
* [ ] **Recomendado antes de abrir el registro:** M4 (rate limiting y CORS con lista de orígenes, porque `sync` crearía filas pendientes para cualquier cuenta de Google) y A1 (reserva atómica de señales, porque crece la concurrencia).

**1. Estado de aprobación y rol en `user_config`, verificado desde la base**
* [ ] Agregar `status` (`pendiente` | `aprobado`, por defecto `pendiente`) y `role` (`admin` | `usuario`, por defecto `usuario`) a `user_config`. El primer admin se crea a mano con SQL.
* [ ] El middleware sigue verificando el ID token con `verifyIdToken` y después busca al usuario por uid en `user_config`. Sin fila o con estado `pendiente`: 403. Con `aprobado`: deja pasar y expone `uid` y `role` en el contexto de Hono. Si la base falla: rechaza (falla cerrado).
* [ ] Dos niveles de acceso: rutas solo con token verificado (`POST /api/users/sync` y un `GET /api/users/me` para que la app consulte su estado) y el resto de `/api/*`, que exige `aprobado`.
* [ ] `sync` crea la fila en `pendiente` para un uid nuevo y nunca cambia `status` ni `role` en un uid existente.
* [ ] Un guard `requireAdmin` para las rutas de administración (listar pendientes, aprobar y quitar acceso).
* [ ] Flutter: pantalla "tu cuenta espera aprobación" según `/api/users/me`. Se integra con el pendiente de mostrar un mensaje ante 403.
* [ ] Al terminar: eliminar el secret `ALLOWED_FIREBASE_UIDS`, su link en `sst.config.ts` y `parseAllowlist` si ya no lo usa nada.

**2. Vinculación de Telegram con código de un solo uso (`/start CODIGO`)**
* [ ] Endpoint `POST /api/users/telegram-link` (solo usuarios aprobados) que genera un código aleatorio de alta entropía, válido para un `/start` de Telegram (letras, números, `_` y `-`), con vencimiento corto (por ejemplo 10 minutos). Se guarda solo su hash, con el uid, la fecha de vencimiento y `used_at`. La app muestra el enlace `t.me/<bot>?start=CODIGO`.
* [ ] En el webhook, `/start CODIGO` desde un chat desconocido consume el código con un `UPDATE … WHERE used_at IS NULL AND expires_at > now() RETURNING` atómico y guarda ese `chat_id` en la fila del uid. Un código usado, vencido o inexistente no se consume ni responde nada útil.
* [ ] Un chat no puede quedar vinculado a dos uids (`chat_id` es único). Limitar los intentos fallidos por chat.
* [ ] El middleware de Telegram deja de usar `ALLOWED_CHAT_IDS`: resuelve el chat contra `user_config` (`chat_id` de un usuario `aprobado`). Un chat desconocido solo puede enviar `/start CODIGO`, y todo lo demás se ignora sin responder. El secret token del webhook y la dedupe por `update_id` se mantienen.
* [ ] La identidad para ejecutar sale de ese vínculo: los callbacks de Telegram operan con las llaves del usuario dueño del chat y con el ownership de A3.
* [ ] Al terminar: eliminar el secret `ALLOWED_CHAT_IDS`, su link y `telegram/allowlist.ts`.

**3. Comandos de administración restringidos por rol**
* [ ] `/positions` y `/report_*` usan hoy las llaves globales del dueño y reportes globales: pasan a exigir que el chat vinculado tenga `role = admin`. Para un usuario común se ignoran sin responder.
* [ ] Comandos de admin nuevos para aprobar sin usar SQL (por ejemplo `/pendientes` y `/aprobar <id>`), también restringidos por rol, con equivalente en la API (`requireAdmin`).
* [ ] Solo un admin puede cambiar `role` o quitar `aprobado`, y los cambios quedan en el log.

**4. Migración desde el estado actual**
* [ ] Agregar las columnas y la tabla de códigos (`db:push` a mano, cuidando el desvío de la constraint de `firebase_uid`) → cargar por SQL al usuario actual como `aprobado` y `admin`, con su `chat_id` ya vinculado → desplegar el middleware que lee la base **conservando** las listas como respaldo → verificar la app y Telegram → retirar los secrets `ALLOWED_*`. Así no hay corte ni lockout.
* [ ] Tests de vitest (sin red): usuario sin fila, `pendiente`, `aprobado` y `admin`; guard `requireAdmin`; código de un solo uso (repetido, vencido, de otro uid); chat desconocido ignorado salvo `/start CODIGO`; comando de admin denegado a un usuario común.

**Decisiones abiertas:**
* Latencia y revocación: buscar en la base en cada request suma una consulta a Neon. Se puede cachear en memoria unos 30 a 60 segundos a costa de que una revocación tarde en aplicarse. Evaluar también `checkRevoked` para acciones de dinero.
* Si hace falta un tercer estado (por ejemplo `bloqueado`) para distinguir a alguien rechazado de alguien pendiente.
* Quién aprueba (app, Telegram o ambos) y cómo se avisa al admin de un pendiente nuevo.

