// Tramo reservado (docs/investigacion/2026-10-05-estrategias-1h-1d.md §8.5): los últimos 12 meses
// de datos no se simulan durante el desarrollo. Se usan una sola vez, al final, con --holdout; una
// idea que falle ahí se descarta sin retocarla.
export const HOLDOUT_START = Date.UTC(2025, 9, 1); // 2025-10-01
