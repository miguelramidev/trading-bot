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
