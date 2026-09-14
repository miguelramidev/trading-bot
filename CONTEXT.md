# Crypto Quant Grid Bot (Serverless Edition)

## Descripción del Proyecto
Este es un sistema algorítmico y cuantitativo (Quant) diseñado para el mercado de Futuros Perpetuos de Binance.
Actúa como un radar institucional automatizado que clasifica el mercado en regímenes (Tendencia vs. Rango), calcula matemáticamente las fronteras de volatilidad (Kill Switches), y notifica al usuario vía Telegram con parámetros milimétricos para que este ejecute manualmente **Bots de Malla (Futures Grids)**. 

## Arquitectura
Infraestructura **100% Serverless** en la nube:
*   **Framework:** SST (Serverless Stack) v4.
*   **Lenguaje:** TypeScript / Node.js.
*   **Base de Datos:** Neon DB (PostgreSQL Serverless) administrado mediante Drizzle ORM.
*   **Proveedor Cloud:** AWS (Desplegado en `ca-central-1` para evitar bloqueos de IP geográficos).
*   **Notificaciones e Interacción:** Telegram Webhooks (API Gateway + Callbacks Interactivos).
*   **Data Market:** CCXT para conexión a Binance Futures API.

## Lógica Algorítmica y Operativa
El sistema se ejecuta cada 15 minutos exactos y sigue un pipeline estricto de filtrado:
1.  **Protección de Capital (Cortafuegos):** Se conecta a la cuenta de Binance mediante API Keys encriptadas (AWS Secrets). Si el Balance Libre (Free Margin) en USDT es menor a $15, aborta todo el procesamiento para no consumir cómputo en señales inoperables.
2.  **Universo de Activos:** Descarga el Top 100 de pares de futuros con mayor volumen. Ignora monedas que ya tienen un Grid activo y rechaza señales nuevas si su correlación estadística (Pearson) con Bitcoin es superior al 65% y van en la misma dirección (Risk Shield).
3.  **Detección de Régimen (ADX):** 
    *   Si `ADX > 25`: Mercado en Tendencia (Estrategia 1). Busca pullbacks a la EMA 21 a favor de la tendencia mayor (EMA 200 de 4H) respaldados por un pico de volumen.
    *   Si `ADX < 20`: Mercado en Rango (Estrategia 2). Busca reversiones extremas en las Bandas de Bollinger con divergencia de RSI.
4.  **Cálculo Dinámico de Malla (Grid Spacing):** 
    *   Utiliza el ATR (Average True Range) para establecer las fronteras superior e inferior del Grid.
    *   El espaciado entre grillas (Step) se calcula dinámicamente como `ATR / 3`.
    *   **Umbrales Clamp:** El Step está matemáticamente restringido a un mínimo de `0.35%` (para asegurar que la ganancia supere con creces el `0.04%` de comisión de Binance) y un máximo de `1.20%` (para evitar grillas "fantasma").
5.  **Kill Switches:** El Stop Loss y Take Profit finales del bot de malla se posicionan exactamente 1 "Step" (ej. 0.5%) por fuera de las fronteras interiores de la malla, permitiendo a las últimas órdenes ejecutarse sin auto-destruir la grilla prematuramente.
6.  **Forward Testing y Base de Datos:** Las alertas se envían a Telegram. Si el usuario hace click en "Tomar Trade (Grid)", la moneda pasa a la tabla de activos. El bot monitorea el precio cada 15m. Si cruza el Kill Switch, marca la operación como ganada o perdida, calcula el PnL y envía un reporte diario a las 23:00 (PYT = UTC-3) con una instantánea del balance real en Binance (`daily_reports`).
