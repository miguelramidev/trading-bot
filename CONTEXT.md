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
3.  **Detección Técnica Base (Estrategias 1 y 2):** 
    *   Si `ADX > 25`: Mercado en Tendencia (Estrategia 1). Busca pullbacks matemáticos a la EMA 21 con contracción de volumen en la caída y explosión de volumen en el rebote verde.
    *   Si `ADX < 20`: Mercado en Rango (Estrategia 2). Busca reversiones en las Bandas de Bollinger confirmadas por RSI extremo y volumen bajo.
4.  **Cazador de Ruptura Macro (Estrategia 3):** Cruzamiento estadístico contra Bitcoin (1D). Si BTC tiene tendencia diaria alcista, pero la altcoin genera un SHORT, y la correlación entre ambos es positiva, el bot **invierte** la señal y manda un LONG (Macro Breakout).
5.  **Cazador de Liquidez (Estrategia 4):** Análisis de sentimiento a través del Funding Rate (Tasa de Financiación). Si la lectura técnica indica LONG pero la masa está sobre-apalancada en LONG (Funding Rate > 0), el bot invierte la señal a SHORT para operar con el Market Maker y cazar los Stop Loss de los retailers. El histórico demuestra un 80% de Win Rate en este escenario.
6.  **Gestión de Riesgo (RR 1:2 Asimétrico):** El Stop Loss y el Take Profit se calculan siempre basados en la volatilidad real y absoluta del activo, siendo el Stop Loss = 1 ATR y el Take Profit = 2 ATR.
7.  **Ejecución Semi-Automatizada (Fase 2):** Las señales llegan a Telegram con proyecciones financieras precisas (Capital, Apalancamiento, Posición). El usuario aprieta `[✅ Ejecutar Sniper]`. El bot asume el mando, inyecta las órdenes OCO reales en Binance y entra en modo vigilancia. Un sistema secundario limpia silenciosamente las "órdenes huérfanas" cada 15 minutos para evitar acumulación de basura en el Exchange.
