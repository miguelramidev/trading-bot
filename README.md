# Trading Bot (MT5 & Crypto)

Este es un monorepo diseñado para operar de manera autónoma en mercados tradicionales e investigar oportunidades en el mercado de criptomonedas.

## ⚠️ Estado de Módulos (Julio 2026)

*   **Módulo Tradicional (MetaTrader 5):** 🟢 **ACTIVO**. Es el motor principal del proyecto. Ejecuta la estrategia de Triple Pantalla (Alexander Elder) en temporalidades de 4H/1H con gestión estricta del 1% de riesgo. (Ejecutar: `PYTHONPATH=. python -m trad_triple_screen.bot`)
*   **Módulo Cripto (Binance Futures):** 🔴 **DEPRECADO**. El bot de Grid Trading para Cripto ha sido desactivado por decisión estratégica. La inversión en criptomonedas se manejará manualmente mediante DCA / HODL a largo plazo. No se recomienda iniciar el módulo `crypto_grid`.

## Instalación

1.  Crear entorno virtual: `python3 -m venv venv`
2.  Activar entorno: `source venv/bin/activate` (Mac/Linux) o `venv\Scripts\activate` (Windows)
3.  Instalar dependencias: `pip install -r requirements.txt`
4.  Copiar `.env.example` a `.env` y completar credenciales.

## Ejecución del Bot Principal

```bash
# Iniciar el bot de MetaTrader 5 (Requiere Windows o Wine/Crossover)
PYTHONPATH=. python -m trad_triple_screen.bot
```
