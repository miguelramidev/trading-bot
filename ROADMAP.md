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
* [ ] **`volumeFilter` se guarda siempre como `"Normal"`, sin ningún filtro real detrás (2026-10-01):** en `analyze.ts:277` y `:286` (Estrategia 1), el campo `volumeFilter` de la señal es un string fijo `"Normal"`, no el resultado de comparar `currentVol` contra `avgVol`/`smaVol20` (ambos sí se calculan, líneas 241/262-263, pero nunca se usan en la condición de entrada ni en ningún filtro). El nombre del campo sugiere que el volumen condiciona la señal, y no es así hoy. Dos salidas: (a) implementar el filtro real (por ejemplo, exigir `currentVol > avgVol` antes de confirmar la entrada, documentando el umbral en `CONTEXT.md`), o (b) si no se va a implementar, dejar de guardar un valor fijo engañoso — sacar la columna del insert o guardar `null`/el volumen real sin pretender que es un "filtro".
* [~] **Implementado en la conciliación, pendiente de activar (2026-10-05):** `src/cron/reconciliation.ts` ya confirma los cierres contra `fetchPositions`, cierra en el momento las filas de un cierre de emergencia (`positionOpen: false` → `closedImmediately` en `tradeExecution.ts`) y alerta si a una posición le falta el SL (`missing_stop_loss`, con throttle en `trade_executions.last_missing_sl_alert_at`). Corre con `RECONCILIATION_DRY_RUN: "true"` en `sst.config.ts`, así que hoy solo loguea, y los tres ítems de abajo siguen vigentes en producción hasta pasarlo a `"false"`.
* [ ] **[ALTA PRIORIDAD] El monitor de cierre de `analyze.ts` detecta un cierre solo por precio de vela, sin confirmar contra Binance (2026-10-01):** el loop de operaciones activas (`analyze.ts`, sección "MONITOR DE OPERACIONES ACTIVAS") compara el high/low de las últimas 2 velas de 15m contra el SL/TP guardado y, si lo cruza, asume que la posición cerró — nunca llama `fetchPositions` (ni ningún otro endpoint de Binance) para confirmar que la posición real ya no existe. En el caso normal (SL/TP nativo colocado por `executeTrade`) suele coincidir, pero es una inferencia, no una verificación: si el SL/TP real no se ejecutó exactamente como se esperaba (slippage, orden cancelada manualmente, etc.), el bot puede marcar `isActiveTrade: false` y mandar la notificación de cierre con una posición que en Binance sigue abierta, o al revés. Antes de confiar en este cierre para algo más sensible que una notificación (ej. liberar el cupo de `maxTrades`), agregar una llamada a `fetchPositions` que confirme que el símbolo ya no tiene contratos abiertos.
* [ ] **[ALTA PRIORIDAD] Un cierre de emergencia en la entrada deja la fila como `isActiveTrade: true`, y después el monitor la clasifica como SL/TP Tocado (2026-10-01):** cuando `executeTrade` no logra colocar el Stop Loss tras los 3 reintentos, llama a `emergencyClose()` (`trader.ts`) y cierra la posición a mercado en el momento, mandando `status: "advertencia"` como respuesta inmediata del webhook — pero el `UPDATE` que sigue (`webhook.ts`/`SignalController.ts`) igual escribe `isActiveTrade: true` sin importar el status. Esa fila queda viva para el monitor de 15m de `analyze.ts`, que no tiene ninguna noción de "cierre de emergencia": si el precio más adelante termina cruzando el SL/TP original (de una posición que en Binance ya no existe), la va a reportar igual como "Cerrada (SL Tocado)"/"Cerrada (TP Tocado)" — una etiqueta incorrecta sobre un evento que en realidad fue el cierre de emergencia de la entrada, no un verdadero toque de nivel. Si el precio nunca cruza esos niveles, la fila queda como zombie, marcada activa para siempre. La función pura `buildCloseTelegramMessage`/`buildClosePushMessage` (`src/cron/closeNotificationHelpers.ts`) ya acepta un tercer motivo `'emergency'` para el día que esto se resuelva, pero `analyze.ts` hoy nunca lo produce.
* [ ] **[ALTA PRIORIDAD] La Estrategia 1 genera señales con el stop a menos del 0.5% de la entrada, que `executeTrade` siempre rechaza (2026-10-01):** el stop se calcula como `entry ± 1.0 × ATR(15m)` (`analyze.ts`, "ESTRATEGIA 1") sin ningún piso mínimo en unidades de %, mientras que `Trader.executeTrade` exige que la distancia del SL sea de al menos `MIN_SL_DISTANCE_PCT` (0.5%, `trader.ts`) antes de colocar cualquier orden. En un activo de precio alto o con poca volatilidad reciente (ATR chico en términos absolutos), el bot puede generar, notificar y dejar "Ejecutar" una señal que el usuario nunca va a poder tomar — Binance (vía `executeTrade`) la va a rechazar siempre, sin excepción. La app ahora avisa esto ANTES de que el usuario lo intente (`kMinStopDistancePct` en `app/lib/core/constants/trading_constants.dart`, usado en `SignalCard` y en el Detalle de señal) y deshabilita el botón, pero la causa de fondo sigue sin tocarse: evaluar si `analyze.ts` debería descartar la señal al generarla (comparando la distancia del ATR contra `MIN_SL_DISTANCE_PCT` antes del insert, igual que ya hace con el funding rate extremo) en vez de dejar que llegue a la app y al usuario una señal que el backend va a rechazar de entrada.
* [ ] **[ALTA PRIORIDAD] El cron debe verificar en cada ciclo que toda posición abierta tenga su SL en Binance, y alertar por Telegram si falta:** hoy (2026-09-30) esa verificación solo existe del lado de la app, bajo demanda, cuando el usuario abre el Detalle de posición (`GET /api/dashboard/positions/protection`, `DashboardController.ts`, clasifica las órdenes reales con `classifyProtectionOrders` en `protectionOrders.ts` — no confía en `order.type` porque ccxt colapsa STOP_MARKET y TAKE_PROFIT_MARKET al mismo tipo normalizado para futuros, clasifica por estructura: lado opuesto a la posición, reduce/cierra, y de qué lado de la entrada dispara). Si el usuario no abre esa pantalla, una posición puede quedar sin stop loss (por ejemplo si `emergencyClose()` canceló todo con `cancelAllOrders(symbol, {trigger:true})` sin lograr recolocar el SL) sin que nadie se entere hasta que sea tarde. `analyze.ts` ya itera las posiciones activas cada 15 min (`isActiveTrade: true`) — ahí mismo debería llamar la misma clasificación por símbolo y, si `hasStopLoss` da `false`, mandar una alerta crítica (mismo canal que `sendCriticalAlert` en `criticalAlert.ts`) en vez de esperar a que el usuario mire la app.
* [ ] **`reason` de `signal_history` se trunca a 100 caracteres al guardarse (backend), no en la app:** al decidir una señal, `reasonText = executionResult.mensaje.substring(0, 100)` (`SignalController.ts` y `webhook.ts`) pisa el `reason` original (rico, con el detalle de por qué se generó la señal) con un resumen corto de 100 caracteres. La limpieza de la app Flutter (2026-09-30, sacar etiquetas HTML crudas y decodificar entidades de filas viejas) no toca este truncado porque es un problema de dato guardado, no de cómo se muestra — no hay forma de mostrar más texto del que el backend guardó. Evaluar si conviene no pisar el `reason` original al decidir (guardarlo en otro campo, o no truncar).
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
  **Estado (2026-10-05):** la tabla existe en `schema.ts` y se llena al
  ejecutar (`recordExecutionResult`), con la constraint única
  `(signal_id, user_id)`, y la usa la conciliación. Falta: escribir la
  columna `leverage` (existe pero `recordExecutionResult` no la llena),
  migrar el histórico, y que `signal_history.decision` deje de ser global (A3).
  No implementar sin antes migrar el histórico de `signal_history` que
  ya tiene `realized_pnl`/`executed_entry_price`, y sin tests que cubran
  la reserva atómica (A1) — ver la skill `reglas-trading` antes de tocar
  esto.
* [ ] **Sumar funding al PnL real de los trades:** `Trader.getTradeRealizedPnl()`
  (`src/bot/trader.ts:273`) solo suma `realizedPnl` y resta el fee de
  `fetchMyTrades` (fills de órdenes) — **no incluye los pagos/cobros de
  funding** mientras la posición estuvo abierta, que en Binance Futures
  son transferencias separadas, no fills. Para un PnL neto real hay que
  cruzar el historial de funding de la cuenta (`fetchFundingHistory` en
  ccxt, o el endpoint `/fapi/v1/income` con `incomeType=FUNDING_FEE`)
  filtrado por símbolo y por la ventana `[evaluated_at, cierre]` de cada
  trade, y sumarlo a `realized_pnl` al cerrar (o guardarlo aparte, sin
  netear, para poder reportarlo desglosado — ver la skill
  `auditoria-trades`, que ya exige aclarar si un PnL reportado incluye
  o no funding).
* [ ] **Guardar la hora de la vela gatillo en `signal_history` (2026-10-01):**
  hoy el Detalle de señal tiene que *adivinar* qué vela de 15m disparó la
  señal a partir de `evaluated_at` (fórmula `boundary = floor(evaluatedAt /
  intervalMs) * intervalMs; candidate = boundary - intervalMs`, porque
  `analyze.ts` usa la última vela **cerrada** al momento de evaluar), y
  después tiene que *verificar* ese candidato comparando su ADX contra
  `trigger_adx` (con tolerancia por redondeo) porque la fórmula sola no es
  confiable cerca del borde del intervalo — ver `findSignalCandleIndex` en
  `app/lib/screens/signals/signal_chart_math.dart` y su caso de prueba real
  (señal de WIF, `evaluated_at` 2026-10-01T11:46, vela correcta abre
  11:30 UTC con ADX 25.03, no la que "contiene" el timestamp, que abre
  11:45 con ADX 23.68). Si `signal_history` guardara directamente el
  timestamp de apertura de esa vela (columna nueva, p. ej.
  `trigger_candle_open_at timestamptz`), todo ese heurístico (fórmula +
  verificación + fallback a la vela anterior + "no marcar nada si ninguna
  coincide") dejaría de ser necesario: el frontend solo buscaría la vela
  por timestamp exacto. No implementar sin `db:push` explícito del usuario
  ni sin backfill/compatibilidad para las filas viejas (que seguirían sin
  este dato y necesitando el heurístico como fallback).

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
* [x] **A1 (alta):** doble ejecución posible (check-then-act no atómico). Resuelto: `reserveSignalForExecution` (`src/cron/tradeExecution.ts`) reserva con `UPDATE … WHERE decision IS NULL` antes de llamar a `executeTrade`, en los dos caminos (Telegram y la API). Una reserva trabada en "Ejecutando" la resuelve la conciliación contra la posición real. Pendiente menor: el **descarte** por la API (`SignalController.ts`, `POST /:id/discard`) sigue sin esa condición y puede pisar un "Ejecutando" (ver sección 18).
* [x] **A2 (alta):** la API web ejecutaba señales viejas sin límite de edad. Resuelto con las Reglas 6, 7 y 8 de `RULES.md` dentro de `executeTrade`, comunes a los dos canales.
* [ ] **A3 (alta):** `signalHistory` no tiene dueño y `decision` es global: un usuario que actúa bloquea la señal para todos, y cualquiera puede ejecutar cualquier id. Tabla de decisiones por usuario.
* [~] **A10 (alta), mitigado:** `executeTrade` ya rechaza un SL a menos del 0,5 % (Regla 5), pero la señal se sigue generando y notificando. El arreglo de fondo (descartarla en `analyze.ts`) queda absorbido por la migración a 4h/1d (sección 17), donde los stops son de 2–3 ATR. Hallazgo original: el Stop Loss no tiene un piso de distancia mínima, y lo que se manda a Binance es exactamente ese valor sin validar. `stopLoss`/`takeProfit` se calculan siempre como `currentPrice ∓ 1.0×ATR(15m)` / `±2.0×ATR(15m)` (mismo patrón en las 4 ramas de estrategia de `analyze.ts`, líneas 276, 285, 307, 313, 333-334, 341-342). `gridSL`/`gridTP` son alias literales de esos mismos valores desde el commit `2105729` (`analyze.ts:430-432`, comentario "Kill Switches directos") — no son un stop más ajustado de un motor de grid real, como se creyó al principio. El ATR de 15m no tiene piso mínimo en % del precio (a diferencia del *step* del grid, que sí lo tiene, 0.35%–1.2%, pero ese piso no se aplica al SL/TP). Encontradas **17 de 602 señales con distancia SL < 0.3% del precio** (mínimo real: 0.089%, en TRX — **por debajo del 0.10% de comisión taker ida y vuelta**), concentradas en activos de precio alto (BTC) o volatilidad momentáneamente muy baja (TRX). Confirmado con `SignalController.ts:43`: `parseFloat(signal.gridSL || signal.stopLoss || "0")` se pasa tal cual a `trader.executeTrade()`, que lo coloca como precio de la orden `STOP_MARKET` real sin ninguna validación de distancia mínima (`trader.ts` no tiene ningún chequeo de este tipo). **Ninguno de los 66 trades reales ejecutados cayó en este caso** (mínimo real 0.32%, mediana 1.16%) — pero es suerte de la muestra, no una protección del código: nada impide que la próxima señal en BTC durante un momento de ATR bajo sí lo haga, y colocaría un SL que salta con cualquier ruido normal de mercado, pagando la comisión de entrada+salida sin margen real. Arreglo propuesto: un piso de distancia mínima para `stopLoss`/`takeProfit` (ej. no menos de 2-3× la comisión round-trip en %, o un mínimo fijo tipo 0.5%-1% del precio), aplicado en el mismo lugar donde se calculan (no como parche en `executeTrade`, para que también se refleje en el mensaje de Telegram antes de que el usuario decida).
* [x] **A6:** `executeTrade` ahora reintenta el SL/TP (2 reintentos, 800 ms) con `clientOrderId` fijo por orden (evita duplicar si un reintento choca con un intento anterior que sí llegó — Binance responde `-20132`, tratado como éxito). Si el SL agota los reintentos, cierra la posición a mercado (`reduceOnly`, tamaño real vía `fetchPositions`, no el `amount` calculado) y barre las órdenes que hayan quedado del símbolo. El resultado ya no es un string con emojis: `executeTrade` devuelve `{ status: "ejecutado"|"rechazado"|"advertencia"|"critico", mensaje }`. Tests en `tests/trader.test.ts`.
* [x] **A7:** si `setLeverage` falla, aborta antes de colocar cualquier orden (`status: "rechazado"`). Re-verificado el 2026-09-30 leyendo el código fuente de ccxt 4.5.76 (no solo el comportamiento documentado): `setLeverage()` no tiene ninguna opción de "ya seteado, no relanzar" (a diferencia de A8) — Binance simplemente no rechaza `POST /fapi/v1/leverage` cuando el valor pedido ya es el actual, así que cualquier excepción acá sigue siendo un fallo real. Esta verificación sí era correcta, **pero es una lectura del código de ccxt, no una observación empírica contra Binance real** — el mismo tipo de confianza que resultó mal en A8. Pendiente de confirmar corriendo el test de humo contra Binance Demo Trading (ver plan más abajo) antes de dar esto por cerrado del todo: pedir el mismo leverage ya seteado y comprobar que `setLeverage` no lanza.
* [x] **A8 (corregido 2026-09-30):** la verificación anterior de este ítem estaba **mal** — decía que ccxt tragaba el caso "ya estaba en isolated" (Binance `-4046`) con `throwMarginModeAlreadySet: false` por default. Un caso real (ZEC, cuenta ya en isolated) mostró lo contrario: el default real en `ccxt@4.5.76` (`binance.js`, opciones base del exchange) es **`throwMarginModeAlreadySet: true`**, así que `setMarginMode('isolated', ...)` relanzaba `MarginModeAlreadySet` y el bot rechazaba operaciones válidas. Fix de dos capas en `src/bot/trader.ts`: (1) se fuerza `throwMarginModeAlreadySet: false` explícitamente en las opciones del constructor de `Trader`, restaurando el comportamiento que el código siempre asumió; (2) por si igual falla por otro motivo, el catch ahora confirma el modo real con `fetchMarginMode(symbol)` antes de rechazar, y solo aborta si el modo confirmado no es `isolated` o si esa confirmación también falla. Tests en `tests/trader.test.ts` (describe "A8 (confirmación del modo real de margen...)"). De paso se re-verificaron con el mismo rigor -20132 (algo orders) y `cancelAllOrders(symbol, {trigger:true})` + `fetchPositions` en `emergencyClose()`: ambos leídos directo en el código fuente de ccxt, sin opciones por default que los contradigan — no tenían el mismo problema.
* [x] **M6:** `executeTrade` valida `leverageMin <= leverageMax` al principio, antes de tocar el exchange; rechaza si no se cumple.
* [x] **Test de humo contra Binance Demo Trading — descartado (2026-10-01):** se había implementado (modo demo en `Trader` vía `enableDemoTrading(true)`, script en `scripts/smoke/`) para la tanda que agregó las Reglas 6/7/8 de `RULES.md`, pero esa tanda **no toca la colocación de órdenes** — las tres reglas nuevas rechazan antes de llegar a `createMarketOrder`/`createOrder`, cubiertas por `tests/trader.test.ts` con mocks. Se sacó el código (constructor sin flag `demo`, sin `isDemoModeActive`) y el script para no dejar algo sin usar. Queda como alternativa, para cuando una tanda sí toque la colocación de órdenes real: un script de operación mínima real (~$6 de margen, SL/TP lejos del precio para que no se disparen solos, cierre inmediato y limpieza segura), corrido con el usuario mirando en vivo — no en modo demo (ver nota de A7: la verificación por lectura de código de ccxt ya falló una vez con A8, así que cuando haga falta confirmar comportamiento real de Binance, mejor observarlo en vivo que simularlo).
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


---

## 17. Migración de la estrategia a 4h / 1d (en curso, 2026-10-05)
Se retoma desde cero: el trabajo anterior (~19 commits sin pushear) se perdió con la computadora donde estaba. Investigación completa, decisiones y protocolo en [`docs/investigacion/2026-10-05-estrategias-1h-1d.md`](docs/investigacion/2026-10-05-estrategias-1h-1d.md).

**Decisiones tomadas (2026-10-05):**
* Temporalidades **4h y 1d**. 1h queda descartado como TF de señal: la evidencia es débil (hasta hay reversión a 1h) y no encaja con la confirmación manual en horario laboral.
* **Capital inicial supuesto: 30 USDT. Drawdown máximo tolerado: 25 %** (percentil 95 de Monte Carlo).
* **Solo largos.** Los cortos se backtestean aparte, solo como información.
* Salida con el **`TRAILING_STOP_MARKET` nativo de Binance** (callback 0,1–10 %, sin `closePosition`, convive con un STOP_MARKET fijo).
* **Margen fijo como hoy** (Regla 1 sin cambios), con **apalancamiento x1–x10**. En el backtest: 6 USDT por operación. La Regla 1 sube el apalancamiento solo lo necesario: x2 para la mayoría (notional 12), x4 para ETH/BCH/LTC/ETC/LINK (mínimo 20) y x9 para BTC (mínimo 50). El simulador modela la liquidación en aislado: si el precio la alcanza antes que el stop, se pierde todo el margen.
* Motor de backtest propio en **TypeScript** (`src/backtest/`), sin Python.

**Backtest:**
* [x] Investigación de las cuatro familias (tendencia, reversión, cross-sectional, derivados) y de la metodología.
* [x] Descarga de datos públicos de data.binance.vision (`src/backtest/data/download.ts`): velas de 1h y funding de **todos** los perpetuos USDT, incluidos los deslistados, verificados por checksum. Las de 4h/1d se derivan de las de 1h.
* [x] Universo point-in-time (`src/backtest/universe.ts`): top 100 por mediana de volumen de 30 días, solo con velas ya cerradas. Reemplaza al `scripts_py/download_top100.py`, que tiene sesgo de supervivencia.
* [x] Motor: indicadores puros con calentamiento en `NaN` (los de `data.ts` rellenan con 0), salidas intravela pesimistas (stop/TP/trailing nativo), cartera con cupo y Regla 1, comisiones, slippage por liquidez, funding real, deslistados. Tests en `tests/backtest-*.test.ts`.
* [x] Holdout protegido: el runner no simula desde 2025-10-01 sin `--holdout`. Registro de todas las corridas (`data_dl/backtests/registry.jsonl`) para el Deflated Sharpe.
* [x] Correr las líneas base y los grupos pre-registrados T1, T2, M1 y SHORTS (2026-10-05, in-sample; resultados en `docs/investigacion/2026-10-05-estrategias-1h-1d.md` §10). Hallazgos: con 30 USDT el tamaño mínimo de Binance (10 USDT de notional) hace inviable un MDD del 25 %; el trailing nativo (tope del 10 %) no sirve para largos en 1d; T2 y M1 descartados; solo T1 n20 con trailing del bot sobrevive in-sample (con 300 USDT: Sharpe 0,85, MDD 16 %), muy dependiente de pocas monedas.
* [x] Decidir capital y salida (2026-10-05): 300 USDT, stop gestionado por el bot y trailing nativo con activación como alternativa, cortos evaluados en serio.
* [x] Walk-forward, costos ×2, Monte Carlo y Deflated Sharpe (`src/backtest/validate.ts`, §11 del documento): **ninguna variante pasa.** Largos: Sharpe OOS 0,53 explicado por un solo semestre (MYX), MC p95 del 73 %. Cortos: Sharpe OOS ~0, negativo con costos ×2. T1/T2/M1/cortos descartados en su forma actual.
* [x] Opción A (2026-10-05, §12): universo top 30 y filtro de fuerza relativa X1 sobre T1 largo. **Tampoco pasa** (walk-forward: Sharpe OOS 0,39, MC p95 52 %, DSR 0,13). Se cierra la línea de breakout/tendencia de serie temporal sin retocarla. N acumulado: 40 variantes.
* [x] Opción B (2026-10-05, §13): rotación semanal por fuerza relativa, 4 variantes aprobadas antes de correr. **Tampoco pasa** (walk-forward: Sharpe OOS 0,58 explicado por un solo tramo, DSR 0,18; ninguna variante supera el Sharpe de BTC comprado y mantenido).
* [x] Conclusión de la tanda (§14): ninguna de las 44 variantes de las cuatro familias tiene edge robusto fuera de muestra. No relajar criterios, no seguir iterando sobre los mismos datos, no usar el holdout sin candidato.
* [ ] Decidir cómo seguir (ver la conversación del 2026-10-05): auditar la estrategia actual de 15m con los trades reales y/o correr en modo sombra (solo registro de señales) los candidatos menos malos para acumular datos nuevos.
* [x] Estrategia nueva de 1h (2026-10-06, pedida por el usuario: retroceso en tendencia, largos y cortos, filtros macro BTC/funding/exposición; pre-registro y resultados en [`docs/investigacion/2026-10-06-estrategia-1h.md`](docs/investigacion/2026-10-06-estrategia-1h.md)). **Descartada:** walk-forward OOS Sharpe −2,12, 0/6 semestres positivos; sin filtros quiebra la cuenta. El R bruto por trade es ~0 y los costos (~0,05 R por trade) la hunden. Los filtros reducen pérdidas por operar menos (funding y exposición los que más), no crean ventaja. N acumulado: 55. De paso: se reescribieron los módulos de `src/backtest/data/` que el `.gitignore` nunca dejó subir, y el simulador ahora opera largos y cortos en una misma cuenta.
* [ ] Walk-forward (24 meses in-sample / 6 out-of-sample), Deflated Sharpe, PBO, mesetas de parámetros, Monte Carlo del drawdown.
* [ ] Calibrar el slippage con los fills reales de `signal_history`.
* [ ] Replicar la estrategia actual (B3: MACD 15m + inversión macro) para auditar si la Estrategia 3 tiene el edge que se le atribuye (necesita velas de 15m).
* [ ] Una sola corrida en el holdout con las sobrevivientes. Shadow de 1–3 meses antes de operar.

**Implementación en el bot (recién después del backtest; skill `reglas-trading`, tests primero):**
* [ ] Cron alineado al cierre de vela del TF (00:00 UTC para 1d = 21:00 PYT; cada 4h). El de 15 min queda para monitoreo y conciliación.
* [ ] `executeTrade` con `TRAILING_STOP_MARKET` (cantidad + `reduceOnly`) además del STOP_MARKET inicial. Conciliación y limpieza de órdenes al tanto del trailing.
* [ ] Regla 8 (edad de la señal) por TF: una señal de 1d confirmada a la mañana siguiente tiene ~12 h.
* [ ] **Regla nueva: el SL tiene que quedar antes que la liquidación.** Con stops de 2–3 ATR en 4h/1d y hasta x9 (BTC con margen de 6 USDT), el stop puede quedar más lejos que el precio de liquidación en aislado (~10 % a x9): la posición se liquidaría antes de que el stop actúe. `executeTrade` tiene que calcular la liquidación con el bracket real del par y rechazar si el SL no queda antes. Documentarlo en `RULES.md` y cubrirlo con tests.
* [ ] La estrategia de producción importa los mismos indicadores y señales de `src/backtest/` (lo validado es lo que se ejecuta).

---

## 18. Hallazgos del análisis del 2026-10-05 (pendientes)
* [ ] **[ALTA] Timeout en la orden a mercado = posición sin SL marcada "Rechazada":** si `createMarketOrder` (`trader.ts`, paso 8) lanza por timeout de red, el catch general devuelve `"rechazado"`, aunque la orden pudo haberse ejecutado en Binance. Queda una posición sin SL/TP y la fila como `Rechazada`. La alerta de posición huérfana lo detectaría, pero está en modo solo registro. Arreglo: try/catch propio para la orden a mercado y, si falla, confirmar con `fetchPositions` antes de dar por rechazada la operación.
* [ ] **[MEDIA] Notional justo en el mínimo, rechazado por Binance:** el escalado de la Regla 1 se detiene en `notional >= 10`, pero `amountToPrecision` trunca la cantidad y el notional real queda apenas por debajo (error -4164). Sale como "Error Fatal" genérico en vez del rechazo claro de la Regla 1. Cubrir con un test antes de tocarlo.
* [ ] **[MEDIA] Correlación con BTC calculada sobre precios, no sobre retornos** (`data.ts`, `calculateCorrelation`): con series en tendencia da valores espurios, y decide la inversión de la Estrategia 3 y el bloqueo por exposición correlacionada.
* [ ] **[MEDIA] Descarte por la API no atómico:** `POST /api/signals/:id/discard` hace `UPDATE` sin `decision IS NULL` y puede pisar un "Ejecutando".
* [ ] **[BAJA] `setLeverage`/`setMarginMode` antes de validar las Reglas 5–7:** una señal rechazada igual deja cambiado el apalancamiento del símbolo en la cuenta. Pedir el ticker y validar primero.
* [ ] **[BAJA] Código muerto en el monitor:** el aviso "Esquivaste una bala / Oportunidad perdida" de `analyze.ts` nunca se dispara, porque los dos caminos de descarte guardan `isActiveTrade: false`.
* [ ] **[BAJA] Indicadores de `data.ts` con calentamiento en 0** (EMA/ATR/SMA): `precio > EMA200` da verdadero en las primeras velas. En producción no muerde porque se piden 250 velas; los de `src/backtest/indicators.ts` usan `NaN`.
* [ ] **[BAJA] Textos:** el mensaje de señal dice "~3 min para analizar", pero los cortes reales son 15 min (Telegram) y 60 min (Regla 8).
