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

### 2. Motor Institucional Multi-Estrategia (MT5)
*   **Mercado:** Forex, Índices (US30, DE30), Metales (Oro, Plata), Energía (Petróleo) y Criptomonedas (BTC, ETH, SOL, XRP). Total: 21 Activos.
*   **Broker Elegido:** **Exness**.
    *   *Justificación:* Confirmado por su gran facilidad de depósitos/retiros en Cripto y Skrill en Paraguay, spreads bajos y excelente API REST.
*   **Arquitectura Dual Híbrida (Alpha Ranking):**
    *   Pre-escaneo de los 21 activos utilizando el **ADX Diario** para ordenarlos por "Fuerza Relativa" de mayor a menor, operando siempre los mercados con mayor tracción.
    *   **Motor 1: Tendencia (Triple Pantalla de Elder):** Se activa en regímenes direccionales (ADX > 25). Entradas tipo Breakout (Buy Stop/Sell Stop) en velas de 15m a favor de la tendencia diaria. Ratio Riesgo/Recompensa 1:2.
    *   **Motor 2: Reversión a la Media (Bollinger):** Se activa en regímenes laterales (ADX < 25). Identifica "falsos quiebres" usando Bandas de Bollinger (20,2) al cierre de velas de 1H. Entradas a Mercado con Ratio corto de 1:1.5.

## Infraestructura y Stack Tecnológico
*   **Lenguaje:** Python 3.11+
*   **Librerías Principales:** `ccxt` (conexión exchanges/brokers), `pandas` (análisis de datos y cálculo de indicadores técnicos de forma nativa), `python-dotenv` (variables de entorno), `websockets`.
*   **Notificaciones:** Integración nativa con la API de **Telegram** para recibir alertas de ejecución de órdenes, estado de la cuenta y errores directamente en el móvil.
*   **Despliegue (Producción):** AWS Lightsail. 
    *   *Requisito Mínimo:* Instancia de $12/mes (Ubuntu Linux, 2 vCPU, 2GB RAM) para asegurar que el procesamiento de datos concurrentes y la conexión permanente a WebSockets no sufra cuellos de botella por falta de CPU.
