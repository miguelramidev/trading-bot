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

## 12. Plataforma SaaS Visual (Monorepo Flutter) - [En Progreso]
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
    - [x] Encriptación asimétrica militar (RSA/Ed25519): Generación de llaves públicas/privadas desde el frontend en Dart y descifrado seguro en AWS para la inyección de API Keys de Binance en CCXT sin filtración.
    - [x] Conversión del Bot y Cron Jobs de un modelo "Global Singleton" a un bucle "Per-User" que evalúa saldo y opera de forma independiente por cuenta.
* [x] **Dashboard Interactivo en Vivo:**
    - [x] Sustitución de *Mock Data* por endpoints reales (`/api/dashboard`).
    - [x] Creación de `daily_reports` para mapear los historiales de capital por usuario y trazarlos usando `fl_chart` (Gráfico de rendimiento de capital a 30 días).
    - [x] Formateo condicional avanzado (Textos Rojos/Verdes dependiendo de PnL y escape estricto de variables en Dart).
    - [x] Adaptación Dual (Desktop & Mobile) sincronizada mediante botones manuales de Refresh para ahorrar ancho de banda de Websockets.
* [ ] **Módulo de Señales y Trade Execution:** Completar la pantalla visual de aprobación (`/api/trades` y push notifications visuales en Flutter).
---

## 🚨 ACCIONES PENDIENTES URGENTES (RECORDATORIO DE SEGURIDAD) 🚨
* [ ] **Rotar Contraseña de Neon DB:** El password antiguo (`npg_ZBwFUEKR82AN...`) fue revocado/expuesto por GitHub. Acceder a [console.neon.tech](https://console.neon.tech), generar una nueva contraseña para el rol `neondb_owner`.
* [ ] **Actualizar Entorno Local:** Cambiar la variable `DATABASE_URL` en el archivo `.env` del repositorio local.
* [ ] **Actualizar Entorno AWS/SST:** Actualizar los secretos/variables de entorno de SST y volver a hacer deploy si es necesario para que el bot y el dashboard vuelvan a conectarse a la base de datos de Neon.

