# Roadmap

## 1. Fase Inicial (Python Script) - [Completado]
* [x] Definir estrategia inicial de *Swing Lows*.
* [x] Construir conexión con Binance vía `ccxt` usando Python.
* [x] Configurar bot de Telegram con `python-telegram-bot` mediante Polling.
* [x] Implementar programación de tareas en `APScheduler` para el cierre exacto de velas.

## 2. Fase de Migración Serverless - [Completado]
* [x] Re-arquitecturar el proyecto de Python a **TypeScript**.
* [x] Implementar infraestructura Serverless con **SST v4**.
* [x] Integrar **Neon DB** (PostgreSQL Serverless) y **Drizzle ORM** para mantener persistencia a costo $0.
* [x] Transición del bot de Telegram de *Polling* a **Webhooks** con AWS API Gateway.
* [x] Configurar AWS EventBridge (Cronjobs) para gatillar las alertas de 15m, 1h y 4h.
* [x] Mudar el despliegue a la región de AWS de Canadá (`ca-central-1`) para evitar bloqueos regionales de Binance.com a EE.UU.

## 3. Refinamiento de Estrategia Institucional - [Completado]
* [x] **Filtro Anti-Fiat/Stablecoin:** Regla dinámica para ignorar tokens de baja volatilidad artificial (`USD`, `EUR`, heurística de precio en $1.00, y listas negras específicas como `EURI`).
* [x] **Filtro de Liquidez:** Eliminar monedas de muy bajo volumen (ej. `SPCXB`) forzando un mínimo de $15 Millones de volumen 24h.
* [x] **Análisis Multi-Temporal (MTFA):** Utilizar la temporalidad mayor inmediata (15m -> 1H, 1H -> 4H, etc.) para definir el soporte.
* [x] **Confluencia de Soportes:** Implementar *clustering* (agrupamiento) matemático para ignorar mínimos aislados y exigir zonas de soporte con al menos 2 toques históricos probados.
* [x] **Filtro de Tendencia (EMA 200):** Prohibir buscar soportes en activos en caída libre por debajo de la media institucional de 200 periodos.
* [x] **Sistema Anti-Spam (FIFO Queue):** Conectar la lógica del bot a Neon DB para recordar las últimas alertas y obligarlo a buscar la siguiente mejor opción si la ganadora de hoy ya fue anunciada recientemente.

## 4. Próximos Pasos Futuros (Ideas para iterar) - [Pendiente]
* [x] **Backtesting Integrado:** Implementar una ruta en TypeScript que permita simular resultados pasados de la estrategia.
* [x] **Notificaciones con Gráficas:** Añadir enlaces profundos (deep links) interactivos de TradingView al mensaje de Telegram.
* [x] **One-Click Trading Dinámico (Serverless State):** Implementar la ejecución de órdenes reales mediante botones en Telegram (15, 20, 25 USD o personalizado), conectando las API Keys de los usuarios a la DB para colocar Limit, Stop Loss y Take Profit interactuando desde el chat.
* [x] **Cálculo Dinámico del Stop Loss (ATR):** En lugar de un SL fijo del 1.5%, utilizar el indicador de volatilidad ATR para darle "respiración" a la moneda según su volatilidad natural.
* [x] **Gestión Activa del Trade:** Una vez enviada la señal de compra, sugerir al usuario el punto exacto de "Breakeven" para asegurar ganancias.
* [x] **Migración a Futuros 1x (SMC Long/Short):** Adaptación bidireccional del motor para operar "Swing Lows" en tendencia alcista y "Swing Highs" en tendencia bajista, con integración de márgenes mínimos (`minNotional`) e inclusión de Blue Chips (BTC/ETH).
* [x] **Motor Dual (Momentum Breakout):** Integración de un segundo cerebro estratégico paralelo que detecta rompimientos de soportes/resistencias con inyecciones masivas de volumen institucional, operando mediante órdenes Limit (Breakout & Retest).
* [x] **Defensas Anti-Manipulación:** Ensanchamiento matemático del ATR (2.0x) para evitar Stop Loss prematuros y creación de un Filtro Maestro de Macro Tendencia que escanea la EMA 50 de Bitcoin para prohibir operaciones contra-tendencia.

## 5. Optimización Cuantitativa (Quants) - [Completado]
* [x] **Filtro Estructural de Volatilidad (RSI):** Implementación del oscilador RSI (14 periodos) para abortar largos en zonas eufóricas (>70) y cortos en sobreventa (<30), curando la ceguera algorítmica del bot.
* [x] **Optimización de Geometría de Pullbacks:** Corrección del modelo matemático para buscar techos (`high`) y pisos (`low`) indistintamente a la hora de confirmar zonas institucionales de resistencia.
* [x] **Barrido de Parámetros de Riesgo (Brute-Force Optimizer):** Desarrollo del script `optimizer.ts` para cruzar combinaciones de Risk/Reward y ATR, descubriendo que la codicia inicial de 1:3 RR generaba un Winrate negativo y recalibrando la expectativa a **1.0x RR** (1:1.5 originalmente, ajustado a 1:1 final) para un Winrate del ~50-60%.
* [x] **Simulador Financiero Global Institucional:** Construcción del script `simulator.ts` capaz de descargar de Binance la data de todo el Top 100 de criptomonedas simultáneamente para someter al bot a una prueba de estrés de portafolio global en el último mes, aplicando comisiones reales, apalancamiento 1x, límites de ruina (Ruin Rules) e interés compuesto real. Resultado: **+23.88% ROI mensual (Winrate 52.78%)**.

## 6. Fase de Hedge Fund Cuantitativo (Nivel Dios) - [Completado]
* [x] ~~**Gestión Automática de Riesgo (Breakeven Dinámico):**~~ [Descartado] Se eliminó el monitor de breakeven ya que, al operar con un ratio de Riesgo/Beneficio estático de 1:1, matemáticamente el precio tocaría el Take Profit antes o al mismo tiempo que la meta de breakeven, ahorrando así memoria inútil en AWS.
* [x] **Limpieza de Órdenes Huérfanas:** Sistema automatizado que cancela condicionales residuales (Stop Loss o Take Profit flotantes) cuando el trade finaliza, manteniendo la interfaz de Binance limpia.
* [x] **Seguridad de Apalancamiento Fijo (1x):** El bot fuerza un apalancamiento de 1x por defecto en cada operación, asegurando exposición equivalente a Spot y protegiendo la cuenta contra liquidaciones accidentales.
* [x] **Resolución Criptográfica Asimétrica (Ed25519):** Inyección de un parche matemático de compatibilidad de llaves PEM (Cabecera ASN.1 de 16 bytes vs 12 bytes) para conectar Binance y AWS Serverless de la forma más segura posible y saltarse las restricciones de IP.
* [x] **Precisión Matemática Institucional (Lot Size):** Adaptación del bot a las restricciones de "Step Size" de Binance mediante el redondeo perfecto de compras de tokens de alto valor (ej. SKHYNIXUSDT a >$1200).
* [x] **Reporte Diario de PnL:** Script `report.ts` integrado en AWS Cron para consultar el PnL Realizado vía `fetchIncome` de Binance y enviar un resumen ejecutivo a Telegram todas las noches a las 23:00 (PYT).
* [ ] **Multiplicador de Apalancamiento desde Telegram:** Opciones dinámicas en el chat para operar a 5x, 10x o 20x en vez de 1x.
# Roadmap

## 1. Fase Inicial (Python Script) - [Completado]
* [x] Definir estrategia inicial de *Swing Lows*.
* [x] Construir conexión con Binance vía `ccxt` usando Python.
* [x] Configurar bot de Telegram con `python-telegram-bot` mediante Polling.
* [x] Implementar programación de tareas en `APScheduler` para el cierre exacto de velas.

## 2. Fase de Migración Serverless - [Completado]
* [x] Re-arquitecturar el proyecto de Python a **TypeScript**.
* [x] Implementar infraestructura Serverless con **SST v4**.
* [x] Integrar **Neon DB** (PostgreSQL Serverless) y **Drizzle ORM** para mantener persistencia a costo $0.
* [x] Transición del bot de Telegram de *Polling* a **Webhooks** con AWS API Gateway.
* [x] Configurar AWS EventBridge (Cronjobs) para gatillar las alertas de 15m, 1h y 4h.
* [x] Mudar el despliegue a la región de AWS de Canadá (`ca-central-1`) para evitar bloqueos regionales de Binance.com a EE.UU.

## 3. Refinamiento de Estrategia Institucional - [Completado]
* [x] **Filtro Anti-Fiat/Stablecoin:** Regla dinámica para ignorar tokens de baja volatilidad artificial (`USD`, `EUR`, heurística de precio en $1.00, y listas negras específicas como `EURI`).
* [x] **Filtro de Liquidez:** Eliminar monedas de muy bajo volumen (ej. `SPCXB`) forzando un mínimo de $15 Millones de volumen 24h.
* [x] **Análisis Multi-Temporal (MTFA):** Utilizar la temporalidad mayor inmediata (15m -> 1H, 1H -> 4H, etc.) para definir el soporte.
* [x] **Confluencia de Soportes:** Implementar *clustering* (agrupamiento) matemático para ignorar mínimos aislados y exigir zonas de soporte con al menos 2 toques históricos probados.
* [x] **Filtro de Tendencia (EMA 200):** Prohibir buscar soportes en activos en caída libre por debajo de la media institucional de 200 periodos.
* [x] **Sistema Anti-Spam (FIFO Queue):** Conectar la lógica del bot a Neon DB para recordar las últimas alertas y obligarlo a buscar la siguiente mejor opción si la ganadora de hoy ya fue anunciada recientemente.

## 4. Próximos Pasos Futuros (Ideas para iterar) - [Pendiente]
* [x] **Backtesting Integrado:** Implementar una ruta en TypeScript que permita simular resultados pasados de la estrategia.
* [x] **Notificaciones con Gráficas:** Añadir enlaces profundos (deep links) interactivos de TradingView al mensaje de Telegram.
* [x] **One-Click Trading Dinámico (Serverless State):** Implementar la ejecución de órdenes reales mediante botones en Telegram (15, 20, 25 USD o personalizado), conectando las API Keys de los usuarios a la DB para colocar Limit, Stop Loss y Take Profit interactuando desde el chat.
* [x] **Cálculo Dinámico del Stop Loss (ATR):** En lugar de un SL fijo del 1.5%, utilizar el indicador de volatilidad ATR para darle "respiración" a la moneda según su volatilidad natural.
* [x] **Gestión Activa del Trade:** Una vez enviada la señal de compra, sugerir al usuario el punto exacto de "Breakeven" para asegurar ganancias.
* [x] **Migración a Futuros 1x (SMC Long/Short):** Adaptación bidireccional del motor para operar "Swing Lows" en tendencia alcista y "Swing Highs" en tendencia bajista, con integración de márgenes mínimos (`minNotional`) e inclusión de Blue Chips (BTC/ETH).
* [x] **Motor Dual (Momentum Breakout):** Integración de un segundo cerebro estratégico paralelo que detecta rompimientos de soportes/resistencias con inyecciones masivas de volumen institucional, operando mediante órdenes Limit (Breakout & Retest).
* [x] **Defensas Anti-Manipulación:** Ensanchamiento matemático del ATR (2.0x) para evitar Stop Loss prematuros y creación de un Filtro Maestro de Macro Tendencia que escanea la EMA 50 de Bitcoin para prohibir operaciones contra-tendencia.

## 5. Optimización Cuantitativa (Quants) - [Completado]
* [x] **Filtro Estructural de Volatilidad (RSI):** Implementación del oscilador RSI (14 periodos) para abortar largos en zonas eufóricas (>70) y cortos en sobreventa (<30), curando la ceguera algorítmica del bot.
* [x] **Optimización de Geometría de Pullbacks:** Corrección del modelo matemático para buscar techos (`high`) y pisos (`low`) indistintamente a la hora de confirmar zonas institucionales de resistencia.
* [x] **Barrido de Parámetros de Riesgo (Brute-Force Optimizer):** Desarrollo del script `optimizer.ts` para cruzar combinaciones de Risk/Reward y ATR, descubriendo que la codicia inicial de 1:3 RR generaba un Winrate negativo y recalibrando la expectativa a **1.0x RR** (1:1.5 originalmente, ajustado a 1:1 final) para un Winrate del ~50-60%.
* [x] **Simulador Financiero Global Institucional:** Construcción del script `simulator.ts` capaz de descargar de Binance la data de todo el Top 100 de criptomonedas simultáneamente para someter al bot a una prueba de estrés de portafolio global en el último mes, aplicando comisiones reales, apalancamiento 1x, límites de ruina (Ruin Rules) e interés compuesto real. Resultado: **+23.88% ROI mensual (Winrate 52.78%)**.

## 6. Fase de Hedge Fund Cuantitativo (Nivel Dios) - [Completado]
* [x] ~~**Gestión Automática de Riesgo (Breakeven Dinámico):**~~ [Descartado] Se eliminó el monitor de breakeven ya que, al operar con un ratio de Riesgo/Beneficio estático de 1:1, matemáticamente el precio tocaría el Take Profit antes o al mismo tiempo que la meta de breakeven, ahorrando así memoria inútil en AWS.
* [x] **Limpieza de Órdenes Huérfanas:** Sistema automatizado que cancela condicionales residuales (Stop Loss o Take Profit flotantes) cuando el trade finaliza, manteniendo la interfaz de Binance limpia.
* [x] **Seguridad de Apalancamiento Fijo (1x):** El bot fuerza un apalancamiento de 1x por defecto en cada operación, asegurando exposición equivalente a Spot y protegiendo la cuenta contra liquidaciones accidentales.
* [x] **Resolución Criptográfica Asimétrica (Ed25519):** Inyección de un parche matemático de compatibilidad de llaves PEM (Cabecera ASN.1 de 16 bytes vs 12 bytes) para conectar Binance y AWS Serverless de la forma más segura posible y saltarse las restricciones de IP.
* [x] **Precisión Matemática Institucional (Lot Size):** Adaptación del bot a las restricciones de "Step Size" de Binance mediante el redondeo perfecto de compras de tokens de alto valor (ej. SKHYNIXUSDT a >$1200).
* [x] **Reporte Diario de PnL:** Script `report.ts` integrado en AWS Cron para consultar el PnL Realizado vía `fetchIncome` de Binance y enviar un resumen ejecutivo a Telegram todas las noches a las 23:00 (PYT).
* [x] **Multiplicador de Apalancamiento desde Telegram:** Opciones dinámicas en el chat para operar a 5x, 10x o 20x en vez de 1x.
* [x] **Filtro Institucional de Tasas de Financiación (Funding Rates):** Evitar Longs cuando las ballenas están sobre-apalancadas y a punto de ser liquidadas.
* [x] **Análisis de Libro de Órdenes (Order Book):** Analizar murallas de compras/ventas reales en milisegundos antes de confirmar un setup.

## 7. Gran Reseteo Metodológico (Nueva Estrategia Institucional) - [En Progreso]
* [x] **Purga de Código:** Eliminación completa de todas las estrategias anteriores (Pullback, Momentum, Volume Profile, Triple Screen), limpieza de la lógica del order book, tendencia y soportes. Preparación en limpio para iniciar desde cero.
* [x] **Análisis de Nueva Estrategia:** Lectura y asimilación de `PROMPT_GUIDE.md`. Adopción de rol de ingeniero Cuantitativo estricto y sin sesgos emocionales.
* [x] **Paso 1 — Restricciones y Objetivo:** Máximo Drawdown 25%, frecuencia de revisión de 08:30 a 23:00 PYT, uso de Python + `backtrader` y descarga de datos oficiales de Binance Vision.
* [x] **Paso 2 — Familia y Tesis:** Selección de *Seguimiento de Tendencia* justificada por la fricción de liquidez institucional, falta de valuación fundamental y FOMO minorista en el criptomercado.
* [x] **Paso 3 — Universo de Activos:** Construcción del Universo evaluando el Top 100 de monedas por Volumen USDT, con cadencia de rebalanceo el día 1 de cada mes.
* [x] **Paso 4 — Riesgo y Salidas:** Riesgo por trade del 1.5%. Límite de exposición de 5 posiciones simultáneas. *Stop Loss* inicial y *Trailing Stop* anclados a un múltiplo del ATR.
* [x] **Paso 5 — Entrada:** Timeframe 1H. Filtro de tendencia mayor: Precio sobre EMA 200. Gatillo: EMA 20 cruza sobre EMA 50 (ignorado si ocurre fuera del horario 08:30-23:00).
* [ ] **Paso 6 — Validación (Out-of-Sample):** 
    - [x] Línea Base BTC validada (Buy & Hold BTC: 277% ROI, **53.7% Max DD**). 
    - [x] Prueba Unitaria BTC de la Estrategia EMA superó la línea base al reducir la caída (EMA BTC: 43.7% ROI, **19% Max DD**, Winrate 27%).
    - [x] Primera iteración de Prueba Masiva detectó recortes temporales por fechas de listado recientes (ej. tokens nuevos bloquearon el inicio del test).
    - [ ] **Próximo a hacer:** Modificar `ema_top100_test.py` para soportar *Longitudes de Datos Asimétricas* (`runonce=False`), permitiendo que el simulador arranque en 2023 con las monedas antiguas y sume las nuevas dinámicamente.
    - [ ] Prueba Masiva Definitiva del Portafolio Top 100 y optimización del multiplicador ATR.

## 8. Paper Trading Institucional (Estrategia 15m) - [Completado]
* [x] **Motor de Estrategia Dual:** Análisis algorítmico dividido por el régimen del mercado usando ADX. Gatillo de "Pullback" si está en tendencia (ADX > 25) y gatillo de "Reversión" si está en Rango (ADX < 20).
* [x] **Gestor de Posiciones en Telegram:** Transición del bot para operar 100% en *Paper Trading*, enviando alertas ricas a Telegram con botones interactivos (`✅ Tomar Trade`, `❌ Descartar`) apoyado en Neon DB.
* [x] **Auditoría Estricta de Acción del Precio:** Prevención de "cuchillos cayendo". Ahora los pullbacks exigen matemáticamente una vela de rechazo y conformación (vela verde cerrando encima de EMA 21 con inyección de volumen).
* [x] **Rastreo de Datos Institucionales:** Incorporación de *Funding Rate* y el porcentaje de cambio del *Open Interest* (OI 4h) para predecir posibles *Short Squeezes* y asimetrías del mercado.
* [x] **Correlación Automática con BTC:** Inclusión del cálculo estadístico de Pearson en tiempo real respecto al comportamiento de Bitcoin para registrar el grado de independencia de la altcoin (0% a 100%).
* [x] **Limitadores de Exposición:** Lógica incorporada para restringir un máximo de 2 operaciones abiertas simultáneamente en la misma dirección (Long/Short) para evitar riesgos direccionales catastróficos.
* [x] **Feedback Loop Cualitativo:** Prompt automatizado de Telegram (Force Reply) para capturar en texto plano el *motivo humano* por el cual se descartó una señal.
* [x] **Monitor de Trades Abiertos:** Cronjob en 15m que vigila constantemente las operaciones en curso y notifica resultados en Telegram basados en Stop Loss y Take Profit teóricos.
* [x] **Depuración de Huso Horario Geográfico:** Sincronización absoluta de los cierres diarios, reportes PnL y reinicio de la base de datos a la hora de Asunción, Paraguay (UTC-3 estándar permanente), resolviendo los conflictos matemáticos del desfase de medianoche.

## 9. Transición y Filtros Cuantitativos (Simulación Malla/Sniper) - [Completado]
* [x] **Auditoría de Saldo Real:** Integración nativa con los *SST Secrets* de AWS para leer vía CCXT el balance libre real de la cuenta de Futuros y reflejarlo en los reportes diarios de Telegram.
* [x] **Cortafuegos de Cómputo (Filtro de Munición):** Sistema abortivo que cancela el análisis intensivo de 100 monedas y evita saturar Telegram si el usuario dispone de menos de `$15 USDT` libres.
* [x] **Menú de Opciones (Max 3):** Modificación del límite de señales por sesión (de 1 a 3 máximas) para permitirle al operador humano elegir la moneda con el mejor perfil institucional (Funding Rate a favor) y descartar las perdedoras.
* [x] **Memoria de Enfriamiento por Tiempo Absoluto:** Corrección del filtro de Cooldown para bloquear las monedas procesadas por un lapso exacto de 35 minutos, permitiendo cazar rebotes inmediatos si la liquidez se torna a nuestro favor.
* [x] **Optimización Cuantitativa de Riesgo (Ratio 1:2):** Ajuste de las fronteras de los Kill Switches (Stop Loss de 1.0 ATR contra un Take Profit de 2.0 ATR).
* [x] **Estrategia 3 (Inversión por Macro Breakout):** Inyección de un lector cruzado del gráfico Diario (1D) de Bitcoin. Si BTC está empujando la tendencia fuerte, cualquier señal en contra es vetada e invertida.
* [x] **Estrategia 4 (Liquidity Hunter):** Análisis del Funding Rate. Si la masa está posicionada masivamente en un lado, el bot automáticamente asume la posición contraria (acompañando al Market Maker). Validado con un Win Rate de +80% en Backtest histórico.
* [x] **Refutación Cuantitativa de Estrategia 5 (EMA 9):** Se backtesteó la compra de pullbacks a la EMA 9 en mercados "desbocados". Los datos revelaron un Win Rate del 34%, demostrando que es una zona de alto *whipsaw* y distribución, confirmando que la paciencia es la opción matemática correcta.

## 10. Ejecución Real Semiautomatizada (Sniper Bot) - [Completado]
* [x] **Abandono de Mallas Manuales:** Sustitución de la interfaz visual orientada a "Grid Trading" por parámetros limpios de Francotirador OCO debido a la imposibilidad de automatizar grillas nativas de Binance vía CCXT en un entorno Serverless.
* [x] **Enrutador de Órdenes OCO (One-Cancels-the-Other):** Implementación de la clase `Trader` que se conecta por CCXT e inyecta directamente 1 Orden de Mercado + 2 Órdenes de Cierre (Stop Loss y Take Profit) con el flag `closePosition: true`.
* [x] **Cálculo Dinámico de Posición y Apalancamiento:** Algoritmo de gestión de riesgo que toma estrictamente el 20% del margen disponible y eleva el leverage (hasta x10) para garantizar el cumplimiento del `minNotional` del exchange (ej. $10 USDT).
* [x] **Proyecciones en Vivo en Telegram:** Inyección del cálculo matemático de capital y apalancamiento directamente en la alerta inicial de Telegram, permitiendo al usuario tomar la decisión financiera exacta antes de apretar el botón de disparo.
* [x] **Recolector de Basura (Orphan Order Cleanup):** Inyección de un script en el loop de `analyze.ts` que barre las órdenes abiertas del exchange y cancela los Stop Loss o Take Profits de posiciones que el usuario cerró manualmente por Pánico/Ganancia prematura.
* [x] **Botón de Fuego Real:** Transición final del botón "Tomar Trade" de un simple registro en la base de datos a un trigger de ejecución real en la API de Binance.

## 11. Monitorización Activa y Escalado - [En Progreso]
* [x] **Silenciador Anti-Spam:** Desactivación de las notificaciones de "Ciclo Vacío" cada 15 minutos para evitar fatiga de alertas. El bot ahora opera como un fantasma hasta encontrar una oportunidad real.
* [ ] Esperar que el mercado presente las condiciones matemáticas limpias (pullbacks confirmados o trampas de liquidez) para recibir y validar la primera señal de francotirador en vivo.
* [ ] Monitorear ejecución y latencia de CCXT en AWS.

## 12. Visión a Futuro: Plataforma SaaS Multi-Usuario (Flutter App) - [Backlog Visionario]
* [ ] **Arquitectura Multi-Tenant:** Refactorizar la base de datos Neon DB (Drizzle) para aislar datos por usuario (`user_id`). Permitir múltiples cuentas de Binance con API Keys encriptadas independientemente en AWS KMS.
* [ ] **Frontend Web & Mobile (Flutter):** Crear un Dashboard interactivo multiplataforma (iOS, Android, Web) para reemplazar el control desde el IDE y Telegram.
* [ ] **Gestión de Configuración UI:** Panel de control visual para ajustar límites de riesgo, apalancamiento, y umbrales de capital (margin %, leverage máximo) por usuario sin tocar código.
* [ ] **Notificaciones Push Nativas:** Reemplazar Telegram por notificaciones push (Firebase Cloud Messaging / APNs) integradas directamente en el teléfono.
* [ ] **Suite de Análisis Visual (TradingView Integrado):** Cuando llegue una alerta, abrir una pantalla dedicada en la App mostrando **4 gráficos simultáneos**: El par en 15m, el par en 4h, el par en 1D y el gráfico de Bitcoin, todo integrado para un análisis visual instantáneo antes de pulsar "Ejecutar Sniper".
