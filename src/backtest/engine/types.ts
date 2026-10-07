import type { NativeTrailing, Side, ExitReason } from "./exits.js";

export type { Side };

/** Serie de velas en columnas (más liviana que un array de objetos para ~50k velas de 1h). */
export interface Series {
  openTime: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
  quoteVolume: Float64Array;
  length: number;
}

export interface FundingSeries {
  time: Float64Array; // calc_time redondeado a la hora (ms)
  rate: Float64Array;
}

export interface InstrumentData {
  id: string;
  symbol: string;
  /** Velas de 1h: para ejecutar entradas, salidas intravela, funding y mark-to-market. */
  h1: Series;
  /** Velas del TF de señal (4h o 1d), derivadas de las de 1h. */
  tf: Series;
  /** Velas diarias, para filtros de tendencia de TF superior. */
  daily: Series;
  funding: FundingSeries;
  /** MIN_NOTIONAL del par en Binance (USDT). Del exchangeInfo actual; 5 si el símbolo ya no figura. */
  minNotional: number;
  /** openTime de la primera vela de 1h del instrumento (listado, o relistado si es "SYMBOL~2"). */
  listedAt?: number;
  /** Posicionamiento por hora (solo si alguna estrategia del grupo lo pide: `needsMetrics`). */
  metrics?: MetricsSeries;
}

/**
 * Métricas de posicionamiento de Binance llevadas a 1h: para cada hora, la última fila de 5m
 * conocida a esa hora (`time` = hora a la que ya se conocía, ms). Hay huecos: solo se bajaron los
 * días en que el símbolo estuvo en el top 30, más un mes de calentamiento.
 */
export interface MetricsSeries {
  time: Float64Array;
  /** count_long_short_ratio: cuentas en largo / cuentas en corto. */
  lsAccount: Float64Array;
  /** sum_open_interest (en contratos de la base). */
  openInterest: Float64Array;
}

/** Contexto de mercado común a todos los instrumentos (BTC como referencia de régimen). */
export interface MarketData {
  btcDaily: Series;
  /** Velas de 1h de BTC (solo se cargan para estrategias de TF 1h: correlación por retornos). */
  btcH1?: Series;
}

export interface EntrySignal {
  /** Prioridad cuando hay más señales que cupos: mayor primero (desempate: rank de volumen). */
  score: number;
  /** Lado de la entrada. Obligatorio si la estrategia es `side: "both"`; si no, se ignora. */
  side?: Side;
}

/** Posición abierta tal como la ve un filtro de cartera (`allowEntry`). */
export interface OpenPositionInfo {
  instrument: string;
  side: Side;
  prepared: unknown;
  entryTfIndex: number;
}

/** Entrada candidata que el motor está por abrir. */
export interface EntryCandidate {
  instrument: string;
  side: Side;
  prepared: unknown;
  i: number;
}

export interface ExitPlan {
  stop: number;
  takeProfit?: number;
  trailing?: NativeTrailing;
}

export interface PositionView {
  side: Side;
  entryPrice: number;
  entryTfIndex: number;
  stop: number;
  barsHeld: number; // velas del TF de señal desde la entrada
  /** Posición en el ranking cross-sectional al cierre de esta vela (1 = la mejor). undefined si la
   * estrategia no rankea o si la moneda quedó fuera del ranking (salió del universo o sin datos). */
  csRank?: number;
}

/**
 * Una estrategia evalúa SOLO velas cerradas del TF de señal: `i` es el índice de la vela que
 * acaba de cerrar. La entrada se ejecuta al open de la vela siguiente (la decide el motor).
 */
export interface Strategy<P = unknown> {
  id: string;
  family: "tendencia" | "reversion" | "cross_sectional" | "baseline";
  timeframeHours: number;
  /** "both": largos y cortos en la misma cuenta; cada señal trae su lado (EntrySignal.side). */
  side: Side | "both";
  prepare(inst: InstrumentData, market: MarketData): P;
  entry(p: P, i: number): EntrySignal | null;
  /** Niveles de salida fijados en la entrada. `i` es la vela de señal; `entryPrice`, el fill real. */
  plan(p: P, i: number, entryPrice: number, side: Side): ExitPlan;
  /** Stop gestionado por el bot (referencia, no nativo): se evalúa al cierre de cada vela del TF
   * y solo puede mejorar el stop vigente. Devuelve undefined si no aplica. */
  updateStop?(p: P, i: number, pos: PositionView): number | undefined;
  /** Salida por señal: si devuelve true, se cierra a mercado al open de la vela siguiente. */
  exitSignal?(p: P, i: number, pos: PositionView): boolean;
  /** Corte por tiempo, en velas del TF de señal. */
  maxBars?: number;
  /** Solo se entra en instrumentos con rank de volumen ≤ maxRank en el universo vigente. */
  maxRank?: number;
  /** Filtro cross-sectional: en cada cierre se rankean todos los instrumentos del universo por
   * este score (mayor primero) y solo se permiten entradas en el top `crossSectionalTopK`.
   * NaN = sin dato suficiente (no compite). */
  crossSectionalScore?(p: P, i: number): number;
  crossSectionalTopK?: number;
  /** Tope de posiciones abiertas propio de la estrategia (además del de la cuenta). */
  maxPositions?: number;
  /** "ranked" (por defecto): solo el universo point-in-time vigente. "all": cualquier instrumento
   * cargado que cotice en ese momento (para eventos como listados, que todavía no están en el
   * ranking). Fuera del ranking el slippage es el del peor tramo y `maxRank` no aplica. */
  universe?: "ranked" | "all";
  /** La estrategia usa las métricas de posicionamiento (InstrumentData.metrics). */
  needsMetrics?: boolean;
  /** Filtro de cartera: se evalúa justo antes de abrir, con las posiciones abiertas en ese
   * momento (incluidas las que se abrieron en la misma hora). false = no se entra. */
  allowEntry?(candidate: EntryCandidate, open: OpenPositionInfo[]): boolean;
}

/**
 * Estrategia con simulador propio (por ejemplo el carry de funding, que tiene dos patas y no pasa
 * por `simulate`). Carga sus propios datos y devuelve el mismo SimResult, así `computeMetrics` y
 * `validate.ts` la tratan igual que a las demás.
 */
export interface CustomStrategy {
  id: string;
  family: Strategy["family"];
  timeframeHours: number;
  run(cfg: SimConfig): SimResult;
}

export type AnyStrategy = Strategy<any> | CustomStrategy;

export function isCustom(s: AnyStrategy): s is CustomStrategy {
  return "run" in s;
}

export type TradeExitReason = ExitReason | "signal" | "time" | "delisted" | "end";

export interface Trade {
  strategyId: string;
  instrument: string;
  side: Side;
  rankAtEntry: number;
  entryTime: number;
  entryPrice: number;
  initialStop: number;
  exitTime: number;
  exitPrice: number;
  exitReason: TradeExitReason;
  ambiguous: boolean;
  qty: number;
  leverage: number;
  notional: number;
  grossPnl: number;
  fees: number;
  funding: number;
  netPnl: number;
  /** PnL neto en múltiplos del riesgo inicial (qty × distancia al stop inicial). */
  rMultiple: number;
  barsHeld: number;
}

export interface SlippageTier {
  maxRank: number;
  bps: number;
}

export interface SimConfig {
  start: number;
  end: number;
  initialEquity: number;
  /** Margen fijo por operación (como `montoOperacion` del bot). */
  marginPerTrade: number;
  /** "fixed" (por defecto, como el bot hoy): cada operación usa `marginPerTrade`.
   * "fullEquity": cada operación usa como margen TODO el saldo libre (equity − margen ya usado), así
   * las ganancias y pérdidas se acumulan en el tamaño de la siguiente (interés compuesto).
   * "fraction": cada operación usa como margen una fracción fija del saldo total del momento. */
  sizing?: "fixed" | "fullEquity" | "fraction";
  /** Solo sizing "fraction": margen = equityFraction × saldo total del momento (0,18 = 18 %). */
  equityFraction?: number;
  /** Rango de apalancamiento de la Regla 1 de RULES.md: arranca en leverageMin y sube de a 1
   * hasta leverageMax mientras el notional (margen × apalancamiento) no alcance el mínimo. */
  leverageMin: number;
  leverageMax: number;
  /** Piso de notional que exige el bot además del MIN_NOTIONAL del par: max(10, minNotional). */
  notionalFloor: number;
  /** Tasa de margen de mantenimiento para el precio de liquidación (margen aislado). */
  maintenanceMarginRate: number;
  maxPositions: number;
  /** Comisión taker por lado (0.0005 = 0.05 %, VIP0). */
  feeRate: number;
  slippageTiers: SlippageTier[];
  /** Multiplicador de slippage para salidas tipo stop (stop duro y trailing), que llenan contra el movimiento. */
  stopSlippageMult: number;
  /** Penalización adversa si el instrumento deja de cotizar con la posición abierta. */
  delistPenalty: number;
  /** 1 = costos estimados; 2 = costos duplicados (regla de PROMPT_GUIDE.md). Multiplica comisiones y slippage. */
  costMultiplier: number;
}

// Capital inicial: 300 USDT (decisión del usuario, 2026-10-05, después de ver que con 30 USDT el
// notional mínimo de Binance hacía inviable un MDD del 25 %). Margen fijo de 6 USDT por
// operación (2 % del capital) y apalancamiento x1–x10 (máximo pedido por el usuario). Con la
// Regla 1 el apalancamiento sube solo lo necesario para el notional mínimo: los pares de mínimo
// 5 USDT se operan a x2 (notional 12), ETH/BCH/LTC/ETC/LINK (20) a x4 y BTC (50) a x9.
export const DEFAULT_SIM_CONFIG: Omit<SimConfig, "start" | "end"> = {
  initialEquity: 300,
  marginPerTrade: 6,
  leverageMin: 1,
  leverageMax: 10,
  notionalFloor: 10,
  // Supuesto, no verificado (la tabla de brackets de Binance es un endpoint autenticado):
  // primer tramo de mantenimiento de 1 %, conservador frente al 0,4 % de BTC. A x9 la
  // liquidación queda a ~10 % de la entrada.
  maintenanceMarginRate: 0.01,
  maxPositions: 5,
  feeRate: 0.0005,
  // Supuestos a calibrar contra los fills reales de signal_history (ver docs §8.3).
  slippageTiers: [
    { maxRank: 10, bps: 2 },
    { maxRank: 30, bps: 5 },
    { maxRank: 100, bps: 10 },
  ],
  stopSlippageMult: 2,
  delistPenalty: 0.05,
  costMultiplier: 1,
};

export interface DailyEquity {
  date: number;
  equity: number;
  openPositions: number;
}

export interface SimResult {
  config: SimConfig;
  strategyId: string;
  trades: Trade[];
  equity: DailyEquity[];
  /** Señales válidas que no se tomaron por falta de cupo o de margen. */
  skippedNoSlot: number;
  skippedNoMargin: number;
  /** Señales rechazadas por la Regla 1: ni con leverageMax se llega al notional mínimo. */
  skippedMinNotional: number;
  /** Señales bloqueadas por el filtro de cartera de la estrategia (allowEntry). */
  skippedFiltered: number;
}
