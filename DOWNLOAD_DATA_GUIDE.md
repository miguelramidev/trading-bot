# Guía de Sesión: Validación del Portafolio Top 100

Este documento sirve como puente de contexto para la próxima sesión de trabajo en otra máquina/chat. Contiene el estado exacto del proyecto y los pasos precisos que el Agente o Usuario debe ejecutar para concluir la validación cuantitativa de la nueva estrategia.

## 1. Contexto Actual (Gran Reseteo Metodológico)
Basándonos en las reglas estrictas de `PROMPT_GUIDE.md`, se eliminó todo el código antiguo de estrategias y se diseñó un nuevo sistema cuantitativo desde cero enfocado en **Seguimiento de Tendencia**:
* **Timeframe:** 1 Hora (1H).
* **Filtros:** Horario restringido (08:30 a 23:00 PYT) y Precio > EMA 200.
* **Gatillo:** Cruce de EMA 20 sobre EMA 50.
* **Riesgo:** 1.5% de riesgo por trade, límite duro de 5 posiciones simultáneas.
* **Salida:** Trailing Stop dinámico basado en ATR (3x).
* **Límite de Quiebre (Hard Stop del Sistema):** Drawdown Máximo del 25%.

## 2. Logros de la Sesión Anterior
* **Línea Base BTC:** Se validó que el *Buy & Hold* de Bitcoin en los últimos 3 años generó un ROI de 277% pero con un **Drawdown inaceptable del 53.7%**.
* **Prueba Unitaria EMA (BTC):** El sistema fue probado de forma aislada sobre Bitcoin. Redujo exitosamente el Drawdown al **19%** (cumpliendo la regla del 25%) con un Winrate esperado del 27%.
* **Descarga Masiva:** Se creó un pipeline para descargar el historial completo de 3 años de las 100 criptomonedas más operadas directamente desde Binance Vision.

## 3. Entorno de Trabajo
Los scripts de validación están en la carpeta `scripts_py/`.
El entorno virtual ya debería estar configurado con dependencias. Si estás en una máquina nueva o clonaste el repo de cero, ejecuta en la raíz:
```bash
python -m venv venv
venv\Scripts\python.exe -m pip install pandas numpy requests backtrader matplotlib ccxt
```

## 4. Próximos Pasos (Lo que debes hacer hoy)

**Paso A: Verificar o Descargar Datos**
Si la nueva máquina no tiene la carpeta `data/history/` con 100 archivos CSV:
```bash
venv\Scripts\python.exe scripts_py\download_top100.py
```
*(Nota: Esto descargará 3 años de velas 1H para el Top 100. Puede tardar entre 15 y 30 minutos).*

**Paso B: Ejecutar la Simulación Final del Portafolio**
Una vez que los datos existan, se debe someter la estrategia al mercado real usando el script de backtrader que carga las 100 monedas y aplica las reglas de límite de posiciones:
```bash
venv\Scripts\python.exe scripts_py\ema_top100_test.py
```

**Paso C: Análisis de Resultados**
El Agente AI debe leer los resultados impresos por la consola (ROI, Max Drawdown, Winrate) y evaluar estrictamente si el Max Drawdown se mantuvo debajo del **25%**. 
Si el resultado es positivo y robusto, el diseño estratégico está validado y el siguiente paso del proyecto será traducir esta lógica de Python de vuelta a **TypeScript (AWS Serverless)** para conectarlo al bot de Telegram real.
