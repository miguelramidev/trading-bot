# Roadmap del Proyecto

Este documento divide el desarrollo del Trading Bot en fases demostrables para facilitar la validación y pruebas incrementales.

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
- [x] Cálculo de Risk Management dinámico (Lot Size) limitando el riesgo al 1% del balance de MT5.
- [x] Inyección de órdenes pendientes (Buy Stop / Sell Stop) nativas a MT5 con ratio Riesgo:Recompensa estricto de 1:2.
- [x] *Hito Demostrable:* El bot tradicional notifica a Telegram los setups encontrados y los ejecuta simulados en Mac (o nativos en Windows).

## Fase 6: Despliegue en AWS Lightsail
- [ ] Contratación de instancia (2 vCPU, 2GB RAM).
- [ ] Configuración del servidor Ubuntu (seguridad, dependencias, Git).
- [ ] Uso de gestores de procesos (ej. `pm2` o `systemd`) para mantener ambos bots corriendo 24/7.
- [ ] *Hito Demostrable:* Sistema totalmente autónomo corriendo en la nube.
