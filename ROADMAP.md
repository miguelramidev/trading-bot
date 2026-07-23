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
- [x] **Motor Mean Reversion:** Integración de Bandas de Bollinger (1H) para operar rebotes en mercados neutrales.
- [x] **Filtro Institucional (Trend):** Reemplazo de indicadores rápidos por cruces robustos a largo plazo (EMA 50 y EMA 200).
- [x] **SL Dinámico de Volatilidad:** Implementación de ATR(14) x 2.0 para protección contra cacería de stops institucionales.
- [x] **Arquitectura de Órdenes Divididas:** Escalado de Take Profit enviando 2 órdenes simultáneas (TP 1:2 y 1:3) y trailing dinámico entre ellas.
- [x] **Trailing Stop Concurrente (Fast Loop):** Separación asíncrona del escáner (15m) y la gestión de posiciones (30s) para cierres de alta precisión.
- [x] **Rotación de Capital (Risk-Free Slots):** Reestructuración del límite global; las posiciones protegidas en Break-Even liberan cupo automáticamente para cazar nuevos activos.
- [x] **Sistema Alpha Ranking:** Escáner global que califica la fuerza (ADX) de todos los activos y prioriza los más explosivos.
- [x] **Expansión de Portafolio:** Despliegue seguro sobre 21 activos descorrelacionados (FX, Índices, Metales, Energía y Cripto).
- [x] Escáner Híbrido 24/7: Bypass de calendario para cazar tendencias en Cripto los fines de semana en MT5.

## Fase 7: Despliegue (En Pausa Estratégica)
- [ ] **Pausa Estratégica:** El despliegue en un servidor VPS de pago (AWS Lightsail) queda pospuesto. El bot debe demostrar primero consistencia y rentabilidad mensual ejecutándose localmente para "pagarse a sí mismo".
- [ ] Exploración de alternativas a MetaApi para Linux o mantener ejecución en laptop (Windows/Mac).
- [ ] Uso de gestores de procesos (ej. `pm2` o Windows Task Scheduler) para ejecución en segundo plano.
- [ ] *Hito Demostrable:* Sistema totalmente autónomo corriendo ininterrumpidamente en la nube.
