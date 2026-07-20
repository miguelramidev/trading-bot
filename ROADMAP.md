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

## Fase 6: Seguridad, Gestión Avanzada y PnL Tracking
- [x] Límite global concurrente en MT5 (Máx. 3 operaciones).
- [x] Escudo de Capital Estricto en MT5 (Riesgo máximo 1.5% ante lote mínimo).
- [x] Gestión de Break-Even dinámico en MT5 (Free Ride al alcanzar +1R).
- [x] Sincronización de estado Cripto con WebSockets y cierres manuales en Binance.
- [x] Cuarentena (Cooldown) de 12 horas en Cripto para evitar operar repetidamente la misma moneda.
- [x] Filtro de tendencias `NEUTRAL` en Cripto para evitar errores de Hard Stop sin posición.
- [x] Rastreador de PnL en MT5: Notificaciones a Telegram con ganancias netas y ROI de operaciones cerradas.
- [x] Rastreador de PnL en Cripto: Uso de la API nativa de "Income" de Binance para cálculos exactos de PnL y ROI (incluyendo fees).

## Fase 7: Despliegue (En Pausa - Ejecución Local)
- [ ] Exploración de alternativas a MetaApi para Linux o mantener ejecución en laptop (Windows/Mac).
- [ ] Uso de gestores de procesos (ej. `pm2` o `systemd`) para mantener ambos bots corriendo 24/7.
- [ ] *Hito Demostrable:* Sistema totalmente autónomo corriendo ininterrumpidamente.
