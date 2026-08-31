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

## 6. Fase de Hedge Fund Cuantitativo (Nivel Dios) - [En Progreso]
* [ ] **Gestión Automática de Riesgo (Breakeven Dinámico):** Un monitor en tiempo real (AWS Cron de 5m) que revisa las posiciones abiertas en Binance; si cruzan el umbral de seguridad, el bot modifica la orden de Stop Loss moviéndola automáticamente al precio de entrada para garantizar riesgo $0.
* [ ] **Multiplicador de Apalancamiento desde Telegram:** Opciones dinámicas en el chat para operar a 5x, 10x o 20x en vez de 1x.
* [ ] **Reporte Diario de PnL:** Un mensaje cada noche resumiendo ganancias, pérdidas, winrate y balance del día de forma automatizada.
* [ ] **Filtro Institucional de Tasas de Financiación (Funding Rates):** Evitar Longs cuando las ballenas están sobre-apalancadas y a punto de ser liquidadas.
* [ ] **Análisis de Libro de Órdenes (Order Book):** Analizar murallas de compras/ventas reales en milisegundos antes de confirmar un setup.
