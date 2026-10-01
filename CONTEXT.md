# Crypto Quant Sniper Bot (Serverless Edition)

## Descripción del Proyecto
Este es un sistema algorítmico y cuantitativo (Quant) diseñado para el mercado de Futuros Perpetuos de Binance.
Actúa como un radar institucional automatizado que clasifica el mercado en regímenes (Tendencia vs. Rango), detecta la trampa de liquidez de las masas usando el Funding Rate, y notifica al usuario vía Telegram. Una vez el usuario aprueba, el bot asume el control absoluto y ejecuta una operación de **Sniper OCO (Ejecución Directa de 1 Market Order + Stop Loss + Take Profit)** sobre el Exchange.

## Arquitectura
Infraestructura **100% Serverless** en la nube:
*   **Framework:** SST (Serverless Stack) v4.
*   **Lenguaje:** TypeScript / Node.js.
*   **Base de Datos:** Neon DB (PostgreSQL Serverless) administrado mediante Drizzle ORM.
*   **Proveedor Cloud:** AWS (Desplegado en `ca-central-1` para evitar bloqueos de IP geográficos).
*   **Notificaciones e Interacción:** Telegram Webhooks (API Gateway + Callbacks Interactivos).
*   **Data Market & Ejecución:** CCXT para conexión y envío de órdenes OCO nativas a Binance Futures API.

## Lógica Algorítmica y Operativa
El sistema se ejecuta cada 15 minutos exactos y sigue un pipeline estricto de filtrado:
1.  **Protección de Capital:** Se conecta a Binance mediante API Keys. Si el Balance Libre en USDT es menor a $15, aborta todo el procesamiento para no consumir cómputo. En el cálculo de ejecución, garantiza invertir un estricto **20% del margen libre**, auto-ajustando el Apalancamiento hasta un máximo de x10 para cumplir con el Notional Mínimo requerido por Binance (ej. $10 USDT).
2.  **Universo de Activos:** Descarga el Top 100 de pares de futuros con mayor volumen. Realiza un filtrado de volatilidad e ignora monedas con señales solapadas.
3.  **Detección Técnica Base (`src/cron/analyze.ts`, sobre velas de 15m cerradas):**
    *   **Estrategia 1 — Tendencial ("MACD Zero-Cross Pullback"):** activa cuando `ADX(14) >= 25` (régimen de tendencia; por debajo, el bot no opera nada en este ciclo — la Estrategia 2 de abajo está desactivada). Calcula `EMA200` sobre los cierres de 15m para el lado: precio > EMA200 → busca LONG, precio < EMA200 → busca SHORT. El gatillo real es el **cruce por cero del histograma de MACD(12, 26, 9)** a favor de ese lado (para LONG: histograma pasa a positivo con las dos velas previas negativas; para SHORT, inverso). `EMA21`, `RSI(14)` y las Bandas de Bollinger(20, 2) se calculan en el mismo ciclo pero **no condicionan la entrada** — solo quedan guardadas como contexto de la señal (`signal_history.triggerEma21/triggerRsi/triggerUpperBb/triggerLowerBb`).
    *   **Estrategia 2 — Rango:** diseño original (Bollinger 20,2 + "Liquidity Sweep" de la banda, con `ADX < 20`) sigue en el código pero **desactivada** ("no renta a corto plazo (15m)") — no se ejecuta en producción.
4.  **Cazador de Ruptura Macro (Estrategia 3 — Macro Breakout):** no agrega indicadores de precio propios sobre el símbolo operado — reusa la señal base de la Estrategia 1 y, si el régimen macro de BTC en 1D (`EMA20`/`EMA50`/`EMA200` sobre velas 1D: alcista si precio > EMA200 y EMA20 > EMA50, bajista en el caso simétrico) está alineado con el sesgo de BTC en 4h y en 15m (`EMA50`) y la correlación de Pearson entre el símbolo y BTC es positiva, **invierte** la dirección de la señal base. El Stop Loss y el Take Profit se recalculan con los mismos multiplicadores de ATR (1.0 / 2.0) sobre el nuevo lado.
5.  **Veto por Funding Rate (no es una estrategia que invierte, es un descarte):** si el funding rate está en un extremo contrario a la dirección de la señal (`< -0.05%` para LONG, `> +0.05%` para SHORT), la señal se **descarta** directamente — no se invierte a SHORT para "cazar stops", como describía una versión anterior de este documento. No existe ninguna "Estrategia 4" en el código: nunca se implementó la inversión por funding rate, solo este filtro de descarte.
6.  **Gestión de Riesgo (RR 1:2 Asimétrico):** El Stop Loss y el Take Profit se calculan siempre basados en la volatilidad real y absoluta del activo, siendo el Stop Loss = 1 ATR y el Take Profit = 2 ATR.
7.  **Ejecución Semi-Automatizada (Fase 2):** Las señales llegan a Telegram con proyecciones financieras precisas (Capital, Apalancamiento, Posición). El usuario aprieta `[✅ Ejecutar Sniper]`. El bot asume el mando, inyecta las órdenes OCO reales en Binance y entra en modo vigilancia. Un sistema secundario limpia silenciosamente las "órdenes huérfanas" cada 15 minutos para evitar acumulación de basura en el Exchange.
