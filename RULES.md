# 📋 RULES.md — Reglas de Negocio del Bot

## Regla 1: Sistema de Apalancamiento Configurado por Usuario

### Concepto
El usuario configura **dos umbrales de apalancamiento** en la pantalla de Ajustes:

| Parámetro | Descripción | Default |
|---|---|---|
| `leverageMin` | El apalancamiento mínimo con el que siempre se opera. El bot **nunca** usará menos que esto. | `x1` |
| `leverageMax` | El límite superior. El bot **nunca** pasará de esto. | `x2` |

### Lógica de Escalado
Al recibir una señal, el bot calcula si el notional proyectado (`margen × apalancamiento`) supera el mínimo exigido por Binance para esa moneda (`minNotional`):

```
leverage = leverageMin

MIENTRAS notional < minNotional Y leverage < leverageMax:
    leverage += 1
    notional = margen × leverage

SI notional < minNotional:
    ❌ RECHAZAR — No se opera. Notificar al usuario.
SINO:
    ✅ EJECUTAR con el leverage calculado
```

### Ejemplo
- Usuario configura: `leverageMin = x2`, `leverageMax = x5`
- Par: DOGE/USDT, minNotional de Binance = $10
- Margen = $3 USDT

| Intento | Leverage | Notional | ¿Pasa? |
|---|---|---|---|
| 1 | x2 | $6 | ❌ |
| 2 | x3 | $9 | ❌ |
| 3 | x4 | $12 | ✅ → Opera con x4 |

### Invariantes
- Si `leverageMin == leverageMax` → siempre opera con ese valor exacto o rechaza.
- El bot **nunca** opera por debajo de `leverageMin`, aunque le sobre notional.
- El bot **nunca** opera por encima de `leverageMax`, aunque el notional siga siendo insuficiente.
- Si el balance disponible < margen configurado → rechazo inmediato sin evaluar leverage.

---

## Regla 2: Validación de Balance Antes de Operar

Antes de cualquier cálculo de apalancamiento, se valida:

```
SI balance_disponible < montoOperacion:
    ❌ RECHAZAR — Balance insuficiente
```

El bot **nunca** usa `Math.min(balance, monto)` como fallback — si no hay suficiente capital, la operación no se ejecuta y se notifica al usuario.

---

## Regla 3: Anti Caída Brusca (ex-Machetazo)

Si BTC está cayendo fuertemente en 15m y la señal es LONG → se muestra **ALERTA DE CAÍDA BRUSCA** y se desactiva la ejecución automática del Sniper.

Si BTC está subiendo fuertemente en 15m y la señal es SHORT → se muestra **ALERTA DE REBOTE**.

---

## Regla 4: Protección de Rutas por Usuario

La ruta `/history/trade/:id` requiere Bearer Token de Firebase válido. Sin sesión → 401.

En el futuro, cuando haya múltiples usuarios, cada señal tendrá un `firebaseUid` propio y solo el dueño podrá acceder a ella.

---

## Regla 5: Piso de Distancia Mínima del Stop Loss

### Concepto
El Stop Loss se calcula una sola vez, al generar la señal, como `precio ∓ 1×ATR(15m)` — sin piso mínimo en % del precio (ROADMAP.md hallazgo A10). Para activos de precio alto (BTC) o momentáneamente poco volátiles (TRX), puede quedar más ajustado que la propia comisión de entrada+salida: el stop "salta" con ruido normal de mercado, sin haber protegido nada de verdad.

### Lógica
Con el precio en vivo (`fetchTicker`), antes de colocar ninguna orden:

```
distancia = |precioActual - stopLoss| / precioActual

SI distancia < 0.5%:
    ❌ RECHAZAR (Regla 5) — Stop Loss demasiado ajustado
```

0.5% ≈ 5x la comisión taker ida y vuelta estimada (0.05% × 2 = 0.10%), para que el stop deje margen real de protección.

### Dónde vive
`src/bot/trader.ts` (`MIN_SL_DISTANCE_PCT`), paso 7.6 de `executeTrade`. Mismo umbral espejado en la app (`kMinStopDistancePct`, `app/lib/core/constants/trading_constants.dart`) para avisar y deshabilitar el botón de operar antes de intentar.

---

## Regla 6: Precio Ya Fuera de los Niveles de la Señal

### Concepto
Entre que se genera la señal y que el usuario aprueba la ejecución puede pasar tiempo suficiente para que el precio ya haya cruzado el Stop Loss o el Take Profit originales. Hallazgo del backtest de auditoría de breakeven (2026-10-01, `docs/auditorias/2026-10-01-breakeven.md`): en el 48% de una muestra de señales, el precio simulado a la vela siguiente ya había cruzado su propio SL o TP — calcular cualquier cosa contra esos niveles en ese estado da números sin sentido (hasta con signo invertido).

### Lógica
Con el precio en vivo, antes de la Regla 7 (que depende de que esto se cumpla):

```
SI LONG:  precioActual <= stopLoss  O  precioActual >= takeProfit
SI SHORT: precioActual >= stopLoss  O  precioActual <= takeProfit
    ❌ RECHAZAR (Regla 6) — el precio ya cruzó el nivel
```

### Dónde vive
`src/bot/trader.ts`, paso 7.4 de `executeTrade`.

---

## Regla 7: Relación Riesgo/Premio Mínima Efectiva

### Concepto
Si el precio se movió desde la señal (sin llegar a cruzar los niveles, Regla 6), la relación riesgo/premio real de entrar AHORA ya no es la que el usuario vio y aprobó. Entrar tarde con una relación degradada cambia la operación sin que nadie lo haya decidido explícitamente.

### Lógica
Con el precio en vivo, la misma fórmula para LONG y SHORT (valor absoluto en los dos lados, no hace falta invertir el signo por dirección):

```
riesgo  = |precioActual - stopLoss|
premio  = |takeProfit - precioActual|
relación = premio / riesgo

SI relación < 1.5:
    ❌ RECHAZAR (Regla 7) — relación degradada
```

El mensaje de rechazo cita los números: cuánto del camino ya se recorrió y en cuánto quedó la relación (ej. *"el precio ya recorrió el 35% del camino; la relación quedó en 1:0.8, por debajo del mínimo de 1:1.5"*).

### Dónde vive
`src/bot/trader.ts` (`MIN_EFFECTIVE_RR = 1.5`), paso 7.5 de `executeTrade`. El umbral viaja en `GET /api/users/config` (`minEffectiveRR`) para que la app lo use en el aviso de "llegás tarde" y en deshabilitar el botón de operar — antes se basaba en un 30% fijo de avance hacia el objetivo (`kSignalLateThreshold`), ahora en esta misma relación mínima.

---

## Regla 8: Antigüedad Máxima de la Señal

### Concepto
Telegram ya corta la ejecución a los 15 minutos de generada la señal. La API web (usada por la app Flutter) no tenía ningún límite de edad (ROADMAP.md hallazgo A2): se podía ejecutar una señal arbitrariamente vieja, con el SL/TP calculados sobre un precio que ya no tiene relación con el actual.

### Lógica
Sin necesidad de precio en vivo, antes de tocar el exchange:

```
antigüedad = ahora - evaluatedAt

SI antigüedad > 60 minutos:
    ❌ RECHAZAR (Regla 8) — señal demasiado vieja
```

### Dónde vive
`src/bot/trader.ts` (`MAX_SIGNAL_AGE_MS`), paso 0.5 de `executeTrade` — backstop común para cualquier canal (Telegram y la API web), más laxo a propósito que el corte de 15 min de Telegram para no duplicarlo. El umbral viaja en `GET /api/users/config` (`maxSignalAgeMinutes`).

---

## Rechazos de `executeTrade`: decisión `"Rechazada"`, no `"Descartada"`

Cuando `executeTrade` rechaza una orden (por cualquier regla de este documento, balance insuficiente, o un fallo de configuración de Binance), la señal se guarda con `decision = "Rechazada"` — nunca `"Descartada"`. `"Descartada"` queda reservada exclusivamente para el descarte manual del usuario (botón "Descartar" en Telegram o en la app). Son dos cosas distintas: una la decide el usuario, la otra la bloquea el sistema antes de arriesgar dinero real — el historial y la actividad reciente las muestran con su propio `StatusPill`.
