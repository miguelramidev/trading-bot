# Crypto Signal Bot (Serverless Edition)

## Descripción del Proyecto
Este es un bot de señales para trading de criptomonedas en el mercado Spot de Binance. 
A diferencia de los bots de trading automatizado, este sistema no ejecuta compras ni ventas; actúa como un radar institucional que escanea el mercado y notifica al usuario vía Telegram cuando se presenta un *setup* de alta probabilidad.

## Arquitectura
El proyecto fue migrado de un script local en Python a una infraestructura **100% Serverless** utilizando las tecnologías más modernas:
*   **Framework:** SST (Serverless Stack) v4 (Ion).
*   **Lenguaje:** TypeScript / Node.js.
*   **Base de Datos:** Neon DB (PostgreSQL Serverless) administrado mediante Drizzle ORM.
*   **Proveedor Cloud:** AWS (Desplegado en `ca-central-1` para evitar bloqueos de IP de Binance a servidores de EE.UU.).
*   **Notificaciones:** Telegram Webhooks (API Gateway).

## Lógica del Trading (Estrategia Profesional)
La estrategia del bot está programada para replicar el análisis multi-temporal e institucional:
1.  **Filtro de Liquidez:** Solo analiza criptomonedas del Top 100 de Binance que tengan un volumen de operaciones de al menos 15 millones de dólares (USDT) en las últimas 24h.
2.  **Filtro de Stablecoins:** Ignora dinámicamente cualquier moneda que termine en `USD` o `EUR`, o cuyo precio actual ronde exactamente $1.00, además de una lista negra estricta (ej. `EURI`).
3.  **Tendencia (EMA 200):** Calcula la Media Móvil Exponencial de 200 periodos. Si el precio está por debajo, descarta la moneda por estar en "caída libre".
4.  **Soporte Institucional (Confluencia):** Busca en la temporalidad superior (ej. 4H si se pide 1H) *Swing Lows* históricos. Agrupa los que tengan una distancia menor a 1.5% entre sí y solo considera como soporte válido si la zona ha resistido al menos 2 toques.
5.  **Plan de Trading:** Si el precio actual está a un máximo de 5% de distancia del soporte, genera una alerta con Entrada Limit, Stop Loss (1.5% bajo soporte) y Take Profit (Ratio 1:3).
6.  **Cooldown FIFO:** Guarda el historial en Neon DB para no enviar alertas repetidas de la misma moneda en las últimas 24 horas, limitando la base de datos a un máximo de 5 registros por temporalidad.
