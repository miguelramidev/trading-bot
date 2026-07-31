# Roadmap del Proyecto

Este documento divide el desarrollo del Trading Bot en fases demostrables para facilitar la validación y pruebas incrementales.

## ⚠️ Estado Actual de los Módulos
- **Módulo Tradicional (MT5):** 🟢 **ACTIVO** (Motor Principal). Operando con Triple Pantalla, gestión de riesgo del 1% y PnL Tracker.
- **Módulo Cripto (Binance):** 🔴 **INACTIVO / DEPRECADO**. Por decisión estratégica, el trading activo de alta frecuencia en criptomonedas (Grid) ha sido desactivado. Las criptomonedas se manejarán manualmente a muy largo plazo (Modo Caja de Ahorro / HODL).

## Fase 1: Fundamentos y Notificaciones
- [x] Inicialización del Monorepo y Entorno Virtual (`venv`).
- [x] Instalación de dependencias core (`ccxt`, `pandas`, `python-dotenv`).
- [x] Estructura base para el Bot Cripto y Bot Tradicional.
- [x] Implementación del módulo de **Notificaciones vía Telegram** (`shared/notifier.py`).
- [x] Configuración del bot de Telegram (BotFather) y variables de entorno.

## Fase 2: Módulo Cripto - Conexión y Análisis
- [x] Conexión exitosa a Binance Live.
- [x] Lógica para descargar el Top 100 de monedas por volumen.
- [x] Lógica de cálculo del **ATR** y Soportes/Resistencias en `pandas`.
- [x] *Hito Demostrable:* El bot envía un mensaje a Telegram indicando la mejor moneda seleccionada para el Grid según la volatilidad actual.

## Fase 3: Módulo Cripto - Ejecución del Grid (WebSockets)
- [x] Conexión estable al WebSocket de Binance para la moneda seleccionada.
- [x] Lógica matemática estricta (Mínimo de 10 grillas + precisiones requeridas).
- [x] Ejecución de órdenes reales direccionales y persistencia de estado para auto-recuperación (State Management).
- [x] Entrada a Mercado (Grid 0) para captura instantánea de tendencia.
- [x] Corrección de truncamiento de CCXT y escudo Anti-Liquidación Dinámico (Long/Short).
- [x] Autorenovación 24/7: Cierre por TP/SL y búsqueda de nueva moneda automática.
- [x] *Hito Demostrable:* Ver las órdenes del grid colocadas y ejecutándose en vivo autónomamente.

## Fase 4: Módulo Tradicional - Conexión Broker (MT5)
- [x] Obtención de credenciales de cuenta Demo en Exness (Login, Password, Servidor).
- [x] Conexión local al terminal MetaTrader 5 (`MetaTrader5` package).
- [x] Función para descargar datos históricos de MetaTrader 5 (velas 4h, 1h, 15m).

## Fase 5: Módulo Tradicional - Lógica Triple Pantalla
- [x] Programación estricta de las 3 pantallas de Alexander Elder (EMA 13/26, Force Index, Trailing Stop a 15m).
- [x] Gestión de estado para prevenir órdenes duplicadas (`has_active_trade`).
- [x] Filtros horarios (bloqueo en cierres diarios y fines de semana para evitar Gaps/Spreads).
- [x] Cálculo de Risk Management dinámico limitando el riesgo al 1% con techo máximo de 3.0 lotes.
- [x] Seguridad anti-ruido con distancia mínima de Stop Loss basada en volatilidad (ATR).
- [x] Inyección de órdenes pendientes en MT5 con expiración a 1 hora y ratio Riesgo:Recompensa estricto de 1:2.
- [x] *Hito Demostrable:* El bot tradicional escanea 10 activos, notifica a Telegram y gestiona las órdenes en MetaTrader 5 en vivo.

## Fase 6: Arquitectura Institucional, Gestión Avanzada y PnL Tracking
- [x] Límite global concurrente en MT5 (Máx. 3 operaciones).
- [x] Escudo de Capital Estricto en MT5 (Riesgo máximo 1.5% ante lote mínimo).
- [x] Gestión de Break-Even dinámico en MT5 (Free Ride al alcanzar +1R).
- [x] Base de Datos Histórica (SQLite): Memoria persistente para evitar amnesia entre reinicios.
- [x] Rastreador de PnL en MT5: Notificaciones a Telegram con ganancias netas y ROI.
- [x] Cuarentena (Cooldown) Selectiva: 6 horas para Tendencia, bypass para Mean Reversion. Estandarización a huso horario estricto (UTC).
- [x] **Motor Dual Híbrido:** Uso de ADX para separar Regímenes de Tendencia (>25) de Mercados Laterales (<25).
- [x] **Motor Mean Reversion (BB_TOUCH):** Optimización institucional con Bandas de Bollinger (1H, std=2.0) para operar el toque o ruptura de extremo (+17.61% ROI y 66.7% Win Rate lateral verificados en 6 meses) solucionando además incompatibilidad de columnas de `pandas_ta`.
- [x] **Filtro Institucional (Trend EMA 20):** Estandarización a la EMA 20 diaria (regla oficial Triple Pantalla y backtest del +38.09% ROI en MT5) para capturar tendencias con mayor agilidad y habilitar símbolos recientes de Exness Cent.
- [x] **Filtro Institucional Anti-Exhaustión, DYING_TREND y Alineación de Medias:** Exigencia estricta de alineación `close > EMA 20 > EMA 50`, rechazo de tendencias muriéndose con ADX a la baja (`ADX_hoy < ADX_ayer`), filtro de clímax de tendencia (`ADX >= 45.0`) y desactivación de operativas laterales para enfocar el 100% del capital en tendencias en plena aceleración.
- [x] **SL Dinámico de Volatilidad:** Implementación de ATR(14) x 2.0 para protección contra cacería de stops institucionales.
- [x] **Arquitectura de Órdenes Divididas:** Escalado de Take Profit enviando 2 órdenes simultáneas (TP 1:2 y 1:3) y trailing dinámico entre ellas.
- [x] **Trailing Stop Concurrente (Fast Loop):** Separación asíncrona del escáner (15m) y la gestión de posiciones (30s) para cierres de alta precisión.
- [x] **Trailing Stop de 3 Fases:** Escalado inteligente de protección (+1R ➔ BE, +2R ➔ +1R, y +2.5R ➔ +2R) para maximizar la retención de ganancias en el tramo final al TP 1:3.
- [x] **Rotación de Capital (Risk-Free Slots):** Reestructuración del límite global; las posiciones protegidas en Break-Even liberan cupo automáticamente para cazar nuevos activos.
- [x] **Sistema Alpha Ranking:** Escáner global que califica la fuerza (ADX) de todos los activos y prioriza los más explosivos.
- [x] **Expansión de Portafolio:** Despliegue seguro sobre 21 activos descorrelacionados (FX, Índices, Metales, Energía y Cripto).
- [x] **Portafolio Depurado (12 Activos Alpha No Correlacionados):** Optimización cuantitativa verificada en backtest de 6 meses (+38.09% ROI en MT5) reemplazando metales y quitando redundancias por grupo con límite estricto de 3 tradicionales + 1 cripto.
- [x] **Formateo Monetario Dual (USC/USD):** Conversión y visualización automática en USD para balances y PnL en cuentas Exness Cent en logs y Telegram.
- [x] **[COMPLETADO] Estudio Cuantitativo del Universo Exness Cent (32 vs 12 Activos Alpha):** Verificados en vivo en MT5 los 32 símbolos operables reales (`USDc` / `USCc`) y comparados en backtest de 6 meses con datos reales y filtros de Fase 6.
  - **Hallazgo Cuantitativo:** El universo completo de 32 símbolos reduce el ROI (-2.31%) y eleva el Drawdown (17.14%) debido a pares laterales crónicos (`EURGBPc`, `USDHKDc`) y ruido en cruces exóticos que secuestran los 3 cupos concurrentes del bot.
  - **Configuración Oficial (Opción 1 - 12 Activos Alpha):** Integrados en `bot.py` los **12 Activos Alpha Depurados** (`BTCUSDc`, `ETHUSDc`, `EURUSDc`, `USDCHFc`, `AUDUSDc`, `AUDJPYc`, `GBPJPYc`, `GBPCHFc`, `GBPCADc`, `AUDCADc`, `AUDNZDc`, `EURCHFc`), garantizando **+5.13% de ROI**, **52.6% de Win Rate** y un Drawdown institucional ultraseguro de solo **3.18%**. Los activos de rango/laterales quedan reservados para la estrategia de Arbitraje de la Fase 8.

## Fase 7: Despliegue (En Pausa Estratégica)
- [ ] **Pausa Estratégica:** El despliegue en un servidor VPS de pago (AWS Lightsail) queda pospuesto. El bot debe demostrar primero consistencia y rentabilidad mensual ejecutándose localmente para "pagarse a sí mismo".
- [ ] Exploración de alternativas a MetaApi para Linux o mantener ejecución en laptop (Windows/Mac).
- [ ] Uso de gestores de procesos (ej. `pm2` o Windows Task Scheduler) para ejecución en segundo plano.
- [ ] *Hito Demostrable:* Sistema totalmente autónomo corriendo ininterrumpidamente en la nube.

## Fase 8: Arquitectura Multi-Pilar Institucional (Experimento Demo en Paralelo)
- [x] **[COMPLETADO] Configuración de Entorno Multi-Estrategia (1 Sola Terminal MT5 / main.py):** Implementada en paralelo la arquitectura institucional multi-pilar sin interferencia de órdenes mediante el orquestador unificado `main.py` (`python main.py`):
  - **Pilar 1 (Trend Following - `bot.py`):** Ejecuta con los **12 Activos Alpha Depurados** (`BTCUSDc`, `ETHUSDc`, `EURUSDc`, `USDCHFc`, `AUDUSDc`, `AUDJPYc`, `GBPJPYc`, `GBPCHFc`, `GBPCADc`, `AUDCADc`, `AUDNZDc`, `EURCHFc`) usando `magic=777777` y filtros institucionales anti-agotamiento, alineación EMA 20/50 y rechazo de mercados laterales (`RANGING`).
  - **Pilar 2 (Arbitraje Estadístico de Pares / *Pairs Trading* - `bot_arbitrage.py`):** Ejecuta un motor cuantitativo en Python para operar la Cointegración Engle-Granger y reversión a la media (*Z-Score*) en **9 Cestas de Pares ("Hermanos")** verificadas en backtest de 6 meses sobre Exness Cent (`magic=888888`).
- [x] **[COMPLETADO] Estudio Cuantitativo de Arbitraje (9 Cestas Cointegradas en Exness Cent):** Verificadas empíricamente 4,500 velas H1 en MT5 (`AUDUSDc/NZDUSDc`, `EURUSDc/GBPUSDc`, `XAUUSDc/XAGUSDc`, `EURJPYc/GBPJPYc`, `AUDJPYc/NZDJPYc`, `EURAUDc/GBPAUDc`, `EURCADc/GBPCADc`, `EURCHFc/GBPCHFc`, y `BTCUSDc/ETHUSDc`).
  - **Hallazgo Cuantitativo:** Las 9 cestas fueron **100% rentables**, generando un **ROI Combinado Acumulado de +86.52%** con una tasa de acierto del **44.48%** (relación riesgo-beneficio 1:1.6R) y un Drawdown Máximo que jamás superó el **14.81%** en la peor cesta.
- [x] **[COMPLETADO] Ejecución Concurrente Aislada (Orquestación All-Weather):**
  - Implementado el orquestador maestro **`main.py`**, el cual lanza de forma paralela en una sola terminal MT5 y con un único comando (`python main.py`) ambos motores cuantitativos (`TradTripleScreenBot` y `PairsTradingBot`), garantizando aislamiento total en órdenes gracias al filtrado estricto por `Magic Number` (`777777` vs `888888`).
- [ ] **[PENDIENTE PRUEBA EN VIVO] Medición Cuantitativa Combinada en Cuenta Exness Cent:**
  - Ejecutar `python main.py` en vivo y rastrear el PnL combinado en Telegram durante las próximas semanas para verificar cómo se compensan las curvas de capital entre tendencias (Pilar 1) y mercados laterales (Pilar 2).

