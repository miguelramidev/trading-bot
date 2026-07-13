# Contexto del Proyecto: Trading Bot Monorepo

## Objetivo General
Desarrollar un sistema de trading automatizado (bot) compuesto por dos módulos principales, diseñados para operar en diferentes mercados y utilizando distintas estrategias, centralizados en un único repositorio (Monorepo). 

## Módulos del Sistema

### 1. Bot Cripto (Grid Trading en Binance)
*   **Mercado:** Criptomonedas (Binance Futures Live).
*   **Capital de Trabajo:** Dinámico. Utiliza el 90% del balance de USDT disponible en la cuenta de futuros en cada operación (con apalancamiento máximo de x10).
*   **Estrategia:** Grid Trading adaptativo.
    *   No busca predecir el mercado (momentum/breakout), sino aprovechar la volatilidad en rangos laterales.
    *   **Entrada y Rango:** Se calculará utilizando el indicador **ATR (Average True Range)** para definir el ancho del grid y detectar periodos de rango apoyándose en Soportes y Resistencias.
    *   **Temporalidad:** Ejecución en 15 minutos (15m), validando la tendencia en temporalidades mayores (1h o 4h).
*   **Tecnología Core:** Conexión en tiempo real mediante **WebSockets** (vía CCXT) para colocar y ajustar las órdenes del grid al milisegundo sin agotar los límites de la API REST.

### 2. Bot Tradicional (Triple Pantalla en Forex/Índices/Acciones)
*   **Mercado:** Tradicional (Índices como US500, Forex, Acciones).
*   **Broker Elegido:** **Exness**.
    *   *Justificación:* Confirmado por su gran facilidad de depósitos/retiros en Cripto y Skrill en Paraguay, spreads bajos y excelente API REST.
*   **Estrategia:** Triple Pantalla de Alexander Elder.
    *   *Pantalla 1 (Mayor - ej. 4h):* Identificar la tendencia dominante (MACD Histogram).
    *   *Pantalla 2 (Intermedia - ej. 1h):* Identificar retrocesos contra la tendencia (Force Index o Estocástico).
    *   *Pantalla 3 (Menor - ej. 15m):* Gatillo de entrada (Trailing Stop).

## Infraestructura y Stack Tecnológico
*   **Lenguaje:** Python 3.11+
*   **Librerías Principales:** `ccxt` (conexión exchanges/brokers), `pandas` (análisis de datos y cálculo de indicadores técnicos de forma nativa), `python-dotenv` (variables de entorno), `websockets`.
*   **Notificaciones:** Integración nativa con la API de **Telegram** para recibir alertas de ejecución de órdenes, estado de la cuenta y errores directamente en el móvil.
*   **Despliegue (Producción):** AWS Lightsail. 
    *   *Requisito Mínimo:* Instancia de $12/mes (Ubuntu Linux, 2 vCPU, 2GB RAM) para asegurar que el procesamiento de datos concurrentes y la conexión permanente a WebSockets no sufra cuellos de botella por falta de CPU.
