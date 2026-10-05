// Resolución de salidas dentro de una vela de 1h, para una posición abierta. Es la parte donde
// un backtest suele mentir sin querer, así que las reglas son explícitas y pesimistas:
//
// - Stop duro (STOP_MARKET) y TP (TAKE_PROFIT_MARKET) disparan por último precio (el bot no
//   setea workingType → CONTRACT_PRICE), así que se simulan con las velas normales.
// - Si la vela abre ya más allá del nivel (gap), el fill es el open, no el nivel.
// - Si en la misma vela se tocan el stop y el TP, no se sabe cuál fue primero con OHLC: se
//   asume el stop (pesimista) y se marca como ambigua para reportar qué % de trades lo fue.
// - Trailing nativo (TRAILING_STOP_MARKET de Binance): sigue el extremo alcanzado DESPUÉS de
//   activarse y dispara cuando el precio retrocede `callbackRate` desde ahí. Con OHLC de 1h no
//   se conoce el orden de high y low dentro de la vela; se resuelve así (versión long, el short
//   es el espejo):
//     1. Con el pico de las velas anteriores: si el low perfora ese stop → sale a ese nivel (o al
//        open si abrió por debajo). Si además hubo un pico nuevo antes, el stop real habría sido
//        más alto: tomar el viejo es el lado pesimista.
//     2. Se actualiza el pico con el high de la vela.
//     3. Si el CIERRE quedó por debajo del stop recalculado con el pico nuevo, el precio tuvo que
//        cruzarlo bajando → sale a ese nivel. Si solo el low lo cruzó (pero el cierre no), se
//        asume que el low fue antes que el high y no dispara.
// Todo en términos de "favorable" según el lado: para un short se invierten las comparaciones.

export type Side = "long" | "short";

export interface Bar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface NativeTrailing {
  /** Fracción (0.001 a 0.10, igual que el rango 0.1–10 % de Binance). */
  callbackRate: number;
  /** Precio de activación; si falta, activo desde la entrada (default de Binance: último precio). */
  activatePrice?: number;
}

export interface ExitState {
  side: Side;
  stop: number; // stop duro vigente
  takeProfit?: number;
  trailing?: NativeTrailing;
  trailingActive: boolean;
  /** Mejor precio alcanzado desde la activación del trailing (high para long, low para short). */
  trailingPeak: number;
}

export type ExitReason = "stop" | "take_profit" | "trailing";

export interface ExitFill {
  reason: ExitReason;
  price: number;
  /** Stop y TP en la misma vela: se resolvió de forma pesimista. */
  ambiguous: boolean;
}

/** Signo del lado: +1 long, −1 short. "Peor" para el trade = menor precio * signo. */
function dir(side: Side): number {
  return side === "long" ? 1 : -1;
}

/** ¿El precio `p` está igual o peor que el nivel `level` para este lado? (long: p ≤ level) */
function atOrWorse(side: Side, p: number, level: number): boolean {
  return dir(side) * p <= dir(side) * level;
}

function trailingStopLevel(state: ExitState): number {
  const cb = state.trailing!.callbackRate;
  return state.side === "long" ? state.trailingPeak * (1 - cb) : state.trailingPeak * (1 + cb);
}

/**
 * Procesa una vela de 1h. Devuelve el fill si la posición se cierra en esta vela, o null.
 * Muta `state` (activación y pico del trailing).
 */
export function processBar(state: ExitState, bar: Bar): ExitFill | null {
  const { side } = state;
  const s = dir(side);
  const adverse = side === "long" ? bar.low : bar.high; // extremo en contra
  const favorable = side === "long" ? bar.high : bar.low; // extremo a favor

  const candidates: { reason: ExitReason; price: number }[] = [];

  // Stop duro.
  if (atOrWorse(side, bar.open, state.stop)) candidates.push({ reason: "stop", price: bar.open });
  else if (atOrWorse(side, adverse, state.stop)) candidates.push({ reason: "stop", price: state.stop });

  // Trailing con el pico de las velas anteriores (paso 1).
  if (state.trailing && state.trailingActive) {
    const level = trailingStopLevel(state);
    if (atOrWorse(side, bar.open, level)) candidates.push({ reason: "trailing", price: bar.open });
    else if (atOrWorse(side, adverse, level)) candidates.push({ reason: "trailing", price: level });
  }

  // TP.
  let tpHit: { reason: ExitReason; price: number } | null = null;
  if (state.takeProfit !== undefined) {
    if (s * bar.open >= s * state.takeProfit) tpHit = { reason: "take_profit", price: bar.open };
    else if (s * favorable >= s * state.takeProfit) tpHit = { reason: "take_profit", price: state.takeProfit };
  }

  if (candidates.length > 0) {
    // El peor de los niveles en contra que se tocaron (pesimista).
    const worst = candidates.reduce((a, b) => (s * b.price < s * a.price ? b : a));
    // TP en el open (gap a favor) gana siempre: es lo primero que pasó en la vela.
    if (tpHit && tpHit.price === bar.open) return { ...tpHit, ambiguous: false };
    return { ...worst, ambiguous: tpHit !== null };
  }
  if (tpHit) return { ...tpHit, ambiguous: false };

  // Pasos 2 y 3 del trailing: activación / pico nuevo dentro de esta vela.
  if (state.trailing) {
    const activate = state.trailing.activatePrice;
    if (!state.trailingActive && activate !== undefined && s * favorable >= s * activate) {
      state.trailingActive = true;
      state.trailingPeak = favorable;
    } else if (state.trailingActive && s * favorable > s * state.trailingPeak) {
      state.trailingPeak = favorable;
    }
    if (state.trailingActive) {
      const level = trailingStopLevel(state);
      if (atOrWorse(side, bar.close, level)) return { reason: "trailing", price: level, ambiguous: false };
    }
  }
  return null;
}

/** Estado inicial de salida para una entrada al precio `entry`. */
export function initExitState(side: Side, entry: number, stop: number, takeProfit?: number, trailing?: NativeTrailing): ExitState {
  const active = trailing !== undefined && trailing.activatePrice === undefined;
  return { side, stop, takeProfit, trailing, trailingActive: active, trailingPeak: entry };
}

/** Clampea el callback al rango que acepta Binance (0.1 % a 10 %). */
export function clampCallbackRate(rate: number): number {
  return Math.min(0.1, Math.max(0.001, rate));
}
