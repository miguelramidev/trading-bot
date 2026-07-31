# Trading Bot (MT5 & Crypto)

Este es un monorepo diseñado para operar de manera autónoma en mercados tradicionales e investigar oportunidades en el mercado de criptomonedas.

## ⚠️ Estado de Módulos (Julio 2026 - Fase 8)

*   **⚡ Portafolio All-Weather (MetaTrader 5):** 🟢 **ACTIVO**. Es el orquestador principal del proyecto. Ejecuta de forma simultánea en una sola cuenta MT5 y con un solo comando los dos pilares institucionales:
    *   **Pilar 1 (Tendencial - Magic `777777`):** Triple Pantalla de Elder en los 12 Símbolos Alfa.
    *   **Pilar 2 (Arbitraje Estadístico - Magic `888888`):** Cointegración y Z-Score en 9 Cestas de Pares ("Hermanos").
*   **Módulo Cripto (Binance Futures):** 🔴 **DEPRECADO**. El bot de Grid Trading para Cripto ha sido desactivado por decisión estratégica. La inversión en criptomonedas se manejará manualmente mediante DCA / HODL a largo plazo.

## Instalación

1.  Crear entorno virtual: `python3 -m venv venv`
2.  Activar entorno: `source venv/bin/activate` (Mac/Linux) o `venv\Scripts\activate` (Windows)
3.  Instalar dependencias: `pip install -r requirements.txt`
4.  Copiar `.env.example` a `.env` y completar credenciales.

## Ejecución del Bot Principal (All-Weather: Pilar 1 + Pilar 2)

Para iniciar **ambos motores en paralelo** en tu terminal MetaTrader 5 con un solo comando:

```bash
# Iniciar el Orquestador All-Weather (Requiere Windows con MT5)
PYTHONPATH=. python main.py
```

*Nota: También puedes ejecutar un módulo de forma independiente con `python -m trad_triple_screen.bot` o `python -m arbitrage.bot_arbitrage` si lo necesitas.*
