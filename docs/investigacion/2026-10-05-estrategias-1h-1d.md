# Investigación: estrategias para 1h / 4h / 6h / 1d

**Fecha:** 2026-10-05 · **Estado:** investigación terminada, backtest sin empezar.

Este documento reemplaza al trabajo equivalente que se perdió junto con los 19 commits que no estaban en el remoto. Reúne cuatro líneas de investigación:

1. Tendencia y momentum.
2. Reversión a la media y filtros de régimen.
3. Señales propias de cripto y de derivados.
4. Metodología de backtest.

Respeta el marco de [`PROMPT_GUIDE.md`](../../PROMPT_GUIDE.md): cuatro familias, una tesis en una frase, universo sin look-ahead, costos duplicados y un tramo de datos reservado. Las cifras citadas son las que publica cada fuente. Cuando no se pudieron verificar, se aclara. **Ninguna es un resultado nuestro.** Los resultados propios se obtienen recién en el backtest.

---

## 1. Conclusiones

1. **La evidencia más sólida es diaria, no de 1h.** El mejor respaldo es para breakouts de canal (Donchian) en velas de 1d, solo largos, con trailing stop y tamaño ajustado por volatilidad:
   - Zarattini, Pagani y Barbon (2025), con una muestra sin sesgo de supervivencia y neto de comisiones.
   - Una réplica independiente sobre **perpetuos USDT de Binance (2021–2025)**.

   En 1h la evidencia es escasa y contradictoria. Hay un estudio de 2026 que encuentra **reversión** a horizonte de 1 hora, justo en contra de entrar por breakout en 1h.
2. **El bracket actual (SL 1 ATR / TP 2 ATR) le corta la cola a cualquier estrategia de tendencia.** Los sistemas de tendencia con evidencia ganan entre el 35 % y el 45 % de las veces, pero con una ganancia promedio de 3 a 4 veces la pérdida promedio, y salen con trailing o con un stop de canal. Un TP de 2R elimina justamente los trades que pagan el sistema. **Hay que testear salidas con trailing.** Eso implica cambiar cómo el bot gestiona el SL en Binance (ver §7).
3. **El lado corto rinde bastante menos que el largo.** En perpetuos, el Sharpe largo-corto fue alrededor de la mitad del de solo largos, y los breakouts bajistas revierten en 4 a 5 días. Conviene empezar con solo largos, o testear los cortos por separado y con un filtro más estricto.
4. **La reversión a la media casi no tiene evidencia en un top 100.**
   - Las monedas grandes y líquidas muestran **momentum** a escala diaria y semanal. La reversión aparece en monedas chicas e ilíquidas, que quedan fuera del universo, o en menos de 4h, donde el edge no cubre los costos.
   - Esto explica el fracaso de la Estrategia 2 (Bollinger "liquidity sweep" en 15m): un estudio sobre 183 pares de Binance mide un edge bruto de alrededor de 1,3 bp por trade contra unos 5 bp de costo, y ese edge desaparece antes de las 4h.
   - La única variante defendible es **comprar retrocesos dentro de una tendencia alcista** (estilo RSI(2) de Connors con filtro diario).
5. **Momentum entre monedas (cross-sectional):**
   - Es la familia cripto con mejor respaldo académico. Liu, Tsyvinski y Wu (Journal of Finance 2022) lo encuentran a 1–4 semanas y más fuerte en monedas grandes.
   - Pero se debilitó desde 2021 y es sensible a los costos.
   - Encaja mejor como **filtro de qué monedas operar** que como un libro largo-corto.
6. **El funding como señal direccional no rinde.**
   - El carry contrarian, comprar lo de funding bajo y vender lo de funding alto, dio un Sharpe neto de **−0,47** en Binance 2023–2025.
   - **El veto actual por |funding| > 0,05 % no tiene evidencia a favor.** Un backtest en BTC encontró que bloquear las entradas con funding alto eliminaba los mejores trades, porque el funding alto acompaña las tendencias fuertes.
   - Hay que volver a testearlo, no darlo por bueno.
7. **El funding como costo es de primer orden** en posiciones largas que duran días.
   - Elm Wealth reporta un promedio de ~14 %/año en Binance y ~36 % en 2021.
   - Casi ningún backtest de tendencia en cripto lo incluye. El nuestro tiene que incluirlo.
8. **Filtros de régimen: lo simple alcanza.** No apareció evidencia, con costos y fuera de muestra, de que HMM, Hurst o Choppiness superen a "precio vs SMA(100/200) en 1d" de la moneda y de BTC.

---

## 2. Restricción operativa: confirmación manual y horario

Según `PROMPT_GUIDE.md`, el bot **no es autónomo**: cada entrada la confirma el usuario, que trabaja de lunes a viernes de 8 a 17. Esto pesa tanto como la evidencia a la hora de elegir temporalidad:

| TF | Cierres de vela en PYT (UTC−3) | Señales/día (orden) | Encaje con confirmación manual |
|---|---|---|---|
| 1h | cada hora, 24/7 | muchas | **Malo.** La mayoría llega en horario laboral o de noche, y caduca rápido (la Regla 8 corta a los 60 min). |
| 4h | 21, 01, 05, 09, 13, 17 h | pocas | Aceptable: 21 h, 09 h, 13 h y 17 h son revisables. |
| 6h | 21, 03, 09, 15 h | pocas | Aceptable: 21 h y 09 h. |
| 1d | 21 h (00:00 UTC) | muy pocas | **Óptimo:** una revisión por día, a las 21 h. |

Con trailing stop, el bot **gestiona la salida solo**. El usuario confirma la entrada y no necesita mirar la salida. Esto mantiene la separación "la máquina filtra, yo decido la entrada", pero le da al bot autonomía sobre el stop. Es una decisión explícita que hay que tomar (ver §9).

---

## 3. Familia 1: tendencia y momentum de serie temporal

**Tesis:** los inversores minoristas persiguen las subas y la información se difunde lento, así que las tendencias en cripto duran más que en acciones. La ganancia viene de pocas tendencias muy largas, y la paga quien aguanta muchos stops chicos.

| Estrategia | Mejor evidencia | Credibilidad | ¿Costos? | ¿Fuera de muestra? |
|---|---|---|---|---|
| **Donchian ensemble 1d, solo largos, vol-target, trailing al punto medio del canal** | [Zarattini et al. 2025](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5209907) (2015–2025, sin sesgo de supervivencia, top 20 líquidas): Sharpe > 1,5 y alfa de 10,8 %/año vs BTC. [dimaquant](https://dimaquant.substack.com/p/do-breakouts-work-in-crypto-research), perpetuos Binance 2021–25, top 40 point-in-time: ensemble 10/20/40/80 solo largos con Sharpe neto 1,33 y MDD −35,8 %; largo-corto 0,57–0,63 | Working paper + practitioner con datos | Comisiones sí, **funding no** | Sin split formal |
| Precio vs SMA / cruce de medias, 1d | [Detzel et al. 2021](https://www.researchgate.net/publication/339051076), [Grobys et al. 2020](https://www.sciencedirect.com/science/article/pii/S1544612319308852) (SMA 20 sin BTC: +8,76 %/año), [Hudson & Urquhart 2021](https://econpapers.repec.org/article/sprannopr/v_3a297_3ay_3a2021_3ai_3a1_3ad_3a10.1007_5fs10479-019-03357-1.htm) | Peer-reviewed | Parcial | **No funciona fuera de muestra en BTC.** Sí en las altcoins |
| TSMOM sobre retornos de 1–4 semanas | [Liu & Tsyvinski 2021](https://www.nber.org/papers/w24877), [Borgards 2021](https://www.sciencedirect.com/science/article/abs/pii/S1062940821000590) | Peer-reviewed | Casi nunca | **Se degrada después de 2020.** En [Summitward](https://summitward.com/learn/crypto-trend-following), el escalado por volatilidad por sí solo explica la mayor parte del beneficio |
| Filtro 1d + entrada 1h (MACD) | [Quantpedia](https://quantpedia.com/how-to-design-a-simple-multi-timeframe-trend-strategy-on-bitcoin/), BTC: MACD 1h puro con Sharpe 0,33 y 2.262 trades; con filtro diario, 0,80 y ~1.000 trades | Practitioner | No | No |
| Supertrend / Keltner / ADX / Ichimoku | Blogs y TradingView ([ejemplo Supertrend](https://boringedge.com/bitcoin-supertrend-strategy-backtest/): 42 % de aciertos, ganancia promedio 4,1 veces la pérdida, 38 trades en 8,6 años) | Anecdótica | A veces | Raro |
| Volatility breakout de Larry Williams | Blogs, retail coreano | Anecdótica | No verificado | No |
| Cercanía al máximo de 52 semanas | Jia et al. 2025, **réplica fallida** ([PwB](https://paperswithbacktest.com/strategies/psychological-anchoring-effect-and-cross-section-of-cryptocurrency-returns): −23 %/año) | Working paper | No | Réplica negativa |

**Advertencias transversales:**
- BTC es el activo más eficiente y pierde el edge primero (Hudson & Urquhart). Las altcoins grandes y medianas son el punto óptimo. En las chicas, los breakouts **revierten** (dimaquant).
- [Grobys et al. 2025](https://ideas.repec.org/a/kap/fmktpm/v39y2025i4d10.1007_s11408-025-00474-9.html) encontraron que **una sola moneda explica el 37 % del retorno compuesto** de una cartera de momentum. Por eso hay que reportar el PnL excluyendo las 3 mejores monedas.
- Las varianzas del momentum en cripto siguen leyes de potencia ([Grobys & Shahzad 2026](https://onlinelibrary.wiley.com/doi/abs/10.1002/ijfe.70036)), así que el Sharpe solo engaña. Hay que mirarlo junto con el MDD, la cola y Monte Carlo.

---

## 4. Familia 2: reversión a la media y rango

**Tesis, en la única forma defendible:** dentro de una tendencia establecida, los retrocesos bruscos de corto plazo son sobrerreacciones de liquidez que se corrigen en pocos días. Fuera de una tendencia, comprar caídas es "atrapar cuchillos".

| Hallazgo | Fuente | Credibilidad |
|---|---|---|
| Momentum hasta 2–4 semanas, reversión después de ~1 mes, impulsada por las perdedoras | [Dobrynskaya 2023](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3913263) | Peer-reviewed |
| La reversión semanal existe **solo en monedas chicas e ilíquidas**; las líquidas tienen momentum semanal | [Fičura & Colak 2023](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4378429) | Working paper |
| Las monedas más grandes muestran momentum diario, no reversión | [Zaremba et al. 2021](https://www.sciencedirect.com/science/article/pii/S1057521921002349) | Peer-reviewed |
| Reversión en 15m en 183 pares de Binance, también en perpetuos. Edge de ~1,3 bp contra ~5 bp de costo; **desaparece antes de las 4h** | [arXiv 2608.21888](https://arxiv.org/html/2608.21888v1) | Preprint, con costos y holdout |
| BTC: comprar en el mínimo de x días falló fuera de muestra (2022–2024); comprar en el máximo de x días aguantó | [Quantpedia revisit](https://quantpedia.com/revisiting-trend-following-and-mean-reversion-strategies-in-bitcoin/) | Practitioner con OOS real |
| 78 backtests de reversión en BTC/ETH: bull +16 %, lateral −2 %, **bear −41 %**. 14 de ellos acertaban más del 65 % y aun así perdían plata | [Coinquant](https://www.coinquant.ai/blog/building-a-mean-reversion-strategy-in-cryptocurrency-markets-evidence-from-78-backtests) | Practitioner |
| Pairs trading: el edge está por debajo de 1h. En diario, ~0 % (−0,07 %/mes) | [Fil & Kristoufek 2020](https://www.researchgate.net/publication/346845365_Pairs_Trading_in_Cryptocurrency_Markets) | Peer-reviewed |

**Descartados o de baja prioridad:**
- **Bollinger o z-score sin filtro de tendencia:** en 4h BTC da un PF de ~1,1 antes de penalizar.
- **IBS, VWAP y fade de Keltner:** sin evidencia en cripto.
- **Pairs trading:** necesita dos patas simultáneas, que no encajan con la ejecución de una sola orden del bot.

**Filtros de régimen:**

| Filtro | Evidencia | Uso |
|---|---|---|
| **Precio vs SMA(100/200) 1d, de la moneda y de BTC** | Consistente en varias fuentes | **Base. Siempre.** |
| ADX(14) < 20–25 para habilitar la reversión | Vendor, débil | A/B |
| Efficiency Ratio de Kaufman | [Alvarez](https://alvarezquanttrading.com/blog/efficiency-ratio-and-mean-reversion/), en acciones: la reversión funcionó mejor después de una caída eficiente | A/B en los dos sentidos |
| Percentil de ATR (saltear > p80/p90) | Vendor | A/B |
| Hurst / HMM / Choppiness | Sin evidencia de trading con costos y fuera de muestra; el Hurst de BTC casi nunca entra en zona de reversión | **Descartar** salvo que lo simple falle |

---

## 5. Familia 3: señales propias de cripto, derivados y cross-sectional

**Momentum relativo (cross-sectional)**
- **Tesis:** la atención de los inversores y el capital rotan hacia las monedas que vienen ganando, y en monedas grandes ese efecto dura 1–4 semanas.
- **A favor:** [Liu, Tsyvinski & Wu (JF 2022)](https://www.nber.org/papers/w25882) miden 2,7–4,1 %/semana entre el quintil ganador y el perdedor con 1–3 semanas de lookback, y 4,2 %/semana en monedas grandes contra 0,6 % en chicas. Es una muestra de 2014–2018 sin costos. [CTREND (JFQA 2025)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4601972) dice que "sobrevive a los costos y persiste en monedas grandes y líquidas".
- **En contra:** [Starkiller](https://www.starkiller.capital/post/cross-sectional-momentum-in-cryptocurrency-markets) obtuvo un rendimiento menor que BTC en su período de entrenamiento y un MDD de 75 %, y con 125 bp de costo el edge desaparece.
- **Adaptación al bot:** un score de fuerza relativa residual, r_i − β_i·r_BTC sobre L días, que deja operar en largo solo al top k (y en corto solo al bottom k). No es un libro largo-corto.

**Funding**
- El carry directo con cobertura (spot + perp) tiene Sharpe alto ([He et al.](https://arxiv.org/abs/2212.06888)), pero es neutral al mercado y no es replicable con este bot. Además las desviaciones cayeron ~80 % desde 2022.
- El carry direccional dio Sharpe neto −0,47 y se dio vuelta en 2025 ([dimaquant](https://dimaquant.substack.com/p/does-funding-contain-useful-information)).
- Según [BIS WP 1087](https://www.bis.org/publ/work1087.pdf), el carry alto predice crashes a un mes, no a horas.
- Como filtro: re-testear el veto actual contra "sin veto" y contra "veto solo si está saturado **y** el momentum se apaga".

**Open interest (OI)**
- Los cuatro cuadrantes OI × precio tienen solo evidencia de practitioners. Son baratos de testear como filtro de confirmación de breakout, porque los datos existen.

**Rechazados**
- **Desbalance taker:** el edge es real pero queda por debajo de los costos ([arXiv 2608.21888](https://arxiv.org/pdf/2608.21888), [arXiv 2607.09426](https://arxiv.org/html/2607.09426v2)).
- **Ratio long/short:** sin evidencia.
- **Liquidaciones:** no hay historia gratuita. El endpoint REST está muerto desde 2021-04-27.
- **Estacionalidad horaria o semanal:** inestable, por ejemplo se dio vuelta después de los ETF de 2024. Solo sirve como higiene de ejecución: no entrar ±15 min alrededor del funding y excluir listados de menos de 30 días.

**Compresión de volatilidad (squeeze):** predice volatilidad, no dirección. Solo sirve como filtro de timing sobre breakouts.

---

## 6. Lista corta para backtestear (con presupuesto de pruebas)

Con ~5–6 años de historia de perpetuos, el número de configuraciones independientes antes de que un Sharpe de 1 sea puro ruido es del orden de **45** ([Bailey et al.](https://www.ams.org/notices/201405/rnoti-p458.pdf)). La lista se diseñó para no pasarse: **~40 corridas en total**, registradas todas, incluso las que fallen.

### Líneas base (no cuentan como pruebas, son obligatorias)
- B0: buy & hold de BTC.
- B1: top 5 del ranking con rebalanceo semanal (de `PROMPT_GUIDE.md`).
- B2: siempre largo con escalado por volatilidad (Summitward mostró que explica casi todo el TSMOM).
- B3: **la estrategia actual** (MACD zero-cross + inversión macro de la Estrategia 3), corrida en el mismo motor. Esto también audita si la "inversión por Macro Breakout" tiene el edge que se le atribuye en el ROADMAP.

### Candidatas principales

**T1. Donchian ensemble 1d, solo largos, trailing al punto medio** (familia tendencia, 8 corridas)
- Entrada: close > máximo de los cierres de N días. Se calcula para cada N del ensemble y la posición es la fracción de sub-señales activas.
- Salida: trailing en `max(stopPrevio, (HHV_N+LLV_N)/2)`.
- Grilla: ensemble {10,20,40,80} vs {20,60,150} × vol-target {20 %, 30 %} × salida {punto medio, mínimo de N/2}.

**T2. Breakout 4h/6h con filtro diario y trailing tipo chandelier** (tendencia multi-timeframe, 8 corridas)
- Filtro: close 1d > EMA50 1d de la moneda.
- Entrada: close 4h/6h > máximo de las N velas previas.
- Stop inicial: 2,5 ATR. Salida: `HHV(close,22) − m×ATR`, sin TP.
- Grilla: TF {4h, 6h} × N {20, 55} × m {3, 4}.
- Es la versión con más señales de T1. Tiene que ganarle a T1 en Sharpe ajustado por turnover para justificarse.

**M1. Retroceso dentro de una tendencia (RSI(2) estilo Connors), solo largos** (reversión, 8 corridas)
- Condición: close 1d > SMA200 de la moneda **y** de BTC.
- Entrada: en el TF de señal, RSI(2) < L.
- Salida: RSI(2) > X o close > SMA5, con stop duro de 2,5 ATR y corte por tiempo de 10 velas.
- Grilla: TF {4h, 1d} × L {5, 10} × salida {RSI>70, close>SMA5}.

**X1. Filtro de fuerza relativa residual** (cross-sectional, 4 corridas, aplicado sobre la mejor de T1/T2)
- Score r_i − β_i·r_BTC sobre L días, con β por OLS a 60 días. Se entra solo si la moneda está en el top k del universo point-in-time.
- Grilla: L {14, 28} × k {5, 10}.

### A/B de componentes (sobre la ganadora, ~10 corridas)
- **Salida:** bracket actual 1/2 ATR vs trailing. Esto cuantifica cuánto cuesta el TP fijo.
- **Funding:** sin veto / veto actual |f| > 0,05 % / veto solo si está saturado (z > 2) y el momentum de 3 días es < 0.
- **Régimen BTC:** ninguno / SMA200 1d.
- **Cortos:** apagados / espejo con filtro BTC < SMA200.

### Exploratorias, solo si sobra presupuesto
- Cruce de EMA 1d con trailing (incluye el intento anterior: EMA 20/50 + EMA200 + trailing de 3 ATR en 1h).
- TSMOM con escalado por volatilidad.
- Filtro de confirmación por ΔOI en 4h.
- Filtro de squeeze.
- Turtle Soup en 1h/4h con filtro de tendencia, solo para cerrar la pregunta que dejó la Estrategia 2.

### Descartadas
- Bollinger/sweep sin filtro, pairs trading, carry de funding direccional, desbalance taker, ratio L/S, liquidaciones, calendario.
- Ichimoku, Keltner y Williams como fuentes de edge propias.
- Máximo de 52 semanas como señal sola.
- HMM y Hurst.

---

## 7. Qué cambia en el bot si gana una estrategia de tendencia

Cada punto toca lógica de trading real. Antes de implementar hay que pasar por la skill `reglas-trading` y escribir tests.

1. **Salida con trailing.**
   - Hoy `executeTrade` coloca SL/TP fijos con `closePosition`, y el monitor solo detecta los cierres.
   - Con trailing, el cron tiene que **recalcular el stop en cada cierre de vela y reemplazar el STOP_MARKET**: cancelar y volver a crear la orden algo. Necesita un `clientOrderId` versionado y la conciliación como red de seguridad.
   - La alternativa es el `TRAILING_STOP_MARKET` nativo, pero su callback va en %, no en ATR, y sus límites no se verificaron.
   - En cualquier caso, el SL nunca puede quedar ausente durante el reemplazo: primero se crea el nuevo stop y después se cancela el viejo.
2. **Cron alineado al TF.** El cron tiene que correr al cierre de la vela (00:00 UTC en 1d, cada 4h en 4h) y no cada 15 min. El de 15 min puede quedar solo para el monitoreo y la conciliación.
3. **Edad de la señal (Regla 8).** Con 1d, una señal de las 21 h confirmada a la mañana siguiente tiene ~12 h. Hay que redefinir el corte por TF, y las Reglas 6 y 7 se vuelven todavía más importantes.
4. **Tamaño de posición.** La evidencia favorece ajustar el tamaño por volatilidad sobre el margen fijo de $25. Esto choca con la Regla 1 de `RULES.md` (escalado de apalancamiento), que **no debe regresionar**. Si se adopta, primero se cambia `RULES.md`, después los tests y recién después el código.
5. **Estrategia 3 (inversión macro) y correlación con BTC.** La correlación se calcula hoy sobre **precios**, no sobre retornos, así que es espuria con series en tendencia. Hay que corregirla o abandonarla según lo que dé B3.
6. **Piso de SL (Regla 5).** Con stops de 2–3 ATR en 4h/1d, el piso de 0,5 % deja de ser un problema práctico.

---

## 8. Protocolo de backtest

Es un resumen de la investigación de metodología. Las cifras de costos se verificaron el 2026-10-05.

### 8.1 Datos (data.binance.vision, `futures/um/`)
- **Klines 1h/4h/6h/1d de todos los perpetuos USDT, incluidos los deslistados.**
  - El listado de S3 los conserva (SRM, BTS, FTT, …). El intervalo 6h es nativo y está verificado.
  - Cada zip trae un `.CHECKSUM`.
- **`fundingRate` mensual**, con columnas `calc_time, funding_interval_hours, last_funding_rate`. El intervalo **no es fijo**: hay contratos de 8h, otros de 4h desde 2023 y otros de 1h desde 2025. Se usan los timestamps reales.
- **`metrics` diario a 5 min** (OI, ratios L/S, taker), solo si se testea el filtro de OI. La API REST da solo 30 días.
- **`bookDepth` desde 2023**, para calibrar el slippage.
  - Snapshot del 2026-09-15: profundidad dentro de ±0,2 % de ~$35M en BTC, ~$3M en SOL y ~$5k en ARKM. Es una diferencia de unas 10.000 veces dentro del mismo universo.
- **Klines de 1m o 5m solo para resolver la vela ambigua** (cuando el SL y el TP se tocan en la misma vela) y para simular el trailing.
- **Calidad:**
  - Detectar huecos de más de 7 días y cambios de escala de precio por tickers reutilizados. Ya pasó con AIN (82,9 %).
  - Los contratos con prefijo 1000 son símbolos aparte.

### 8.2 Universo point-in-time
- En cada fecha t se toma el top 100 por mediana de 30 días del quote volume, usando solo datos anteriores a t, y se exigen ≥ 30 días de listado.
- Una posición abierta se mantiene aunque la moneda salga del universo.
- Si la moneda se deslista, la posición se cierra al último precio con una penalización.
- **`scripts_py/download_top100.py` tiene sesgo de supervivencia** (usa el top 100 de hoy). [Ammann et al.](https://www.alexandria.unisg.ch/bitstreams/2bc8397d-47dd-4f66-8467-9004b2c9d212/download) estiman ese sesgo en **62 %/año en carteras de igual peso**.

### 8.3 Costos
- **Taker:** 0,05 % por lado en VIP0, 0,045 % con BNB ([FAQ Binance](https://www.binance.com/en/support/faq/binance-futures-fee-structure-fee-calculations-360033544231)). La entrada a mercado, el STOP_MARKET y el TAKE_PROFIT_MARKET son todos taker.
- **Funding:** por cada `calc_time` con la posición abierta, `−lado × qty × markPrice × rate`. Se reporta como línea aparte.
- **Slippage por nivel de liquidez** (supuestos a calibrar con los fills reales de `signal_history`):
  - BTC/ETH ~1 bp, medianas 3–5 bp, cola 10–25 bp por lado.
  - Los stops tienen un extra de 1–2× ese slippage.
  - Si hay gap: fill a max(stop, apertura siguiente).
- **Escenario de validación con costos ×2** (regla de `PROMPT_GUIDE.md`).
- **Precio de disparo:** `trader.ts` no setea `workingType`, así que los SL/TP disparan por el **último precio** y se simulan con klines normales, no con klines de mark.

### 8.4 Sin look-ahead
- Solo velas cerradas. Entrada a la apertura de la vela siguiente.
- Los TF superiores se desplazan una vela.
- SL y TP en la misma vela: se resuelve con 1m/5m; si no se puede, se asume que tocó primero el SL. Se reporta el % de casos ambiguos.
- Test automático de fuga de datos: recalcular las señales con los datos cortados en t y comprobar que salen iguales.

### 8.5 Control de overfitting
- **Holdout:** últimos 12 meses (**2025-10 → 2026-09**). Se toca una sola vez, al final, y la idea que falle ahí se descarta sin retocarla.
- **Walk-forward:** 24 meses in-sample y 6 de out-of-sample, rodando. Solo se reporta la curva out-of-sample concatenada.
- **Registro de todas las corridas**, con su N, para calcular el **Deflated Sharpe Ratio** ([Bailey & López de Prado](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)) y la **PBO** ([SSRN 2326253](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253)).
- **Meseta de parámetros:** con cada parámetro movido ±20 %, todos los vecinos tienen que seguir siendo rentables. Se muestran heatmaps.
- **Monte Carlo:** reordenar los trades y hacer bootstrap por bloques de 5–20 días para obtener la distribución del MDD.

### 8.6 Simulación de cartera
- Una cuenta compartida: margen fijo × apalancamiento con el escalado de la Regla 1, rechazo si no llega al minNotional y máximo de posiciones simultáneas (sensibilidad con 3/5/10).
- Prioridad determinista cuando no hay cupo, tope de exposición neta a BTC y tope de clusters correlacionados.
- **Se reporta cuántas señales se perdieron por falta de cupo.** Diez largos en altcoins se comportan casi como una sola apuesta apalancada a BTC.

### 8.7 Métricas y criterios de aceptación
Son propuestas de política, no datos de una fuente. Todo va **neto de comisiones, slippage y funding**, out-of-sample.

| Criterio | Umbral |
|---|---|
| Trades out-of-sample | ≥ 200 en total y ≥ 30 por año en ≥ 3 años |
| Expectativa por trade | > 0,10R y > 2× el costo de ida y vuelta |
| Profit factor | ≥ 1,3 (≥ 1,2 en el holdout; ≥ 1,1 con slippage ×2) |
| Sharpe / Sortino | ≥ 1,0 / ≥ 1,5, desde retornos diarios ×√365, nunca por trade |
| Sharpe out-of-sample vs in-sample | ≥ 50 % |
| DSR / PBO | ≥ 0,95 / ≤ 0,20 |
| MDD | Percentil 95 de Monte Carlo dentro del presupuesto de riesgo (ver §9) |
| Regímenes | Rentable en ≥ 2 de 3 bloques (2021 bull / 2022 bear / 2023–25) |
| Concentración | Ninguna moneda > 25 % del PnL; se reporta el PnL sin el top 3 |

Desgloses obligatorios: por año, por régimen, por nivel de liquidez, por símbolo, por largo/corto y la proporción de PnL del 5 % de mejores trades.

### 8.8 Herramientas
| Opción | Pros | Contras |
|---|---|---|
| **Motor propio en TypeScript** (recomendado) | Reusa los indicadores de `data.ts` y la lógica de `trader.ts`: lo que se valida es lo que se ejecuta. Ya hay un `backtest.ts`. Node ya está instalado | Hay que construir la contabilidad, el funding y el resolutor intravela |
| freqtrade | Soporta futuros de Binance con funding, tiene `--timeframe-detail` y análisis de look-ahead | Hay que portar a Python, no modela slippage por defecto. Sirve como **verificación cruzada** de 1–2 estrategias |
| vectorbt | Barridos de parámetros muy rápidos, útil para PBO | El funding y las restricciones de cartera son a mano |
| backtesting.py | Simple | Un solo activo: descartado |
| backtrader (el intento anterior) | Ya se usó | Lento para un universo de 100+, sin funding nativo |

Las estadísticas (DSR, PBO, SPA de White/Hansen) se pueden hacer en TS o en Python (`arch`, `pypbo`) leyendo el log de trades. **En esta máquina no está instalado Python** (el comando `python` abre el instalador de la Microsoft Store).

### 8.9 Pasos
1. ☐ Cerrar las decisiones de §9.
2. ☐ Descargar los datos (todos los símbolos, con checksums) y hacer el control de calidad.
3. ☐ Construir el universo point-in-time.
4. ☐ Armar el motor: costos, funding, slippage, entrada a la apertura siguiente, resolutor intravela, cartera y test de fugas.
5. ☐ Calibrar el slippage con los fills reales.
6. ☐ Correr las líneas base B0–B3.
7. ☐ Bloquear el holdout. Registrar las hipótesis y el presupuesto de corridas.
8. ☐ Walk-forward de T1, T2, M1 y X1, y después los A/B de componentes.
9. ☐ DSR, PBO, mesetas, Monte Carlo y desgloses.
10. ☐ Una sola corrida en el holdout con las sobrevivientes.
11. ☐ Shadow de 1–3 meses: el bot registra las señales nuevas sin operarlas y se comparan contra el backtest.
12. ☐ Recién entonces, implementar en el bot (skill `reglas-trading`, cambios en `RULES.md` y tests).

---

## 9. Decisiones tomadas (2026-10-05)

1. **Drawdown máximo tolerado: 25 %.** Criterio de aceptación: el percentil 95 del MDD en Monte Carlo tiene que quedar ≤ 25 % del capital asignado.
2. **Temporalidades: 4h y 1d.** 1h queda descartado como TF de señal. Las velas de 1h se usan solo para resolver lo que pasa dentro de una vela de 4h/1d (SL/TP en la misma vela, recorrido del trailing).
3. **Solo largos** para decidir. Los cortos se corren aparte, con el mismo motor, como información.
4. **Salida autónoma con el trailing stop nativo de Binance** (`TRAILING_STOP_MARKET`), para no cargar al cron con el reemplazo de stops. Lo que dice la doc oficial ([New Algo Order](https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/New-Algo-Order)), verificado el 2026-10-05:
   - `callbackRate` va de **0,1 a 10 (%)**. Es un % fijo desde el extremo alcanzado: **no se adapta al ATR** después de colocarlo.
   - `activatePrice` es opcional y por defecto es el último precio. Sigue `workingType`, que por defecto es `CONTRACT_PRICE`.
   - **No admite `closePosition`**, así que va con cantidad + `reduceOnly`. Convive con un STOP_MARKET fijo como stop inicial duro.
   - Consecuencias para el backtest:
     - La salida "trailing nativo" se simula **exactamente así**: callback = clamp(m × ATR% en la entrada, 0,1 %, 10 %), con un stop inicial fijo y una activación opcional.
     - Se compara contra un trailing ATR gestionado por el bot (Donchian/chandelier) para medir cuánto se pierde por el tope de 10 %. En altcoins en 1d, el stop al punto medio del canal suele quedar a más del 10 %.
5. **Capital inicial supuesto: 30 USDT, apalancamiento x1–x10.** El backtest usa un margen de 6 USDT por operación (20 %). Como la Regla 1 sube el apalancamiento solo hasta alcanzar el notional mínimo, el máximo de x10 no agranda las posiciones de la mayoría:
   - Pares con MIN_NOTIONAL de 5: x2 (notional 12).
   - ETH/BCH/LTC/ETC/LINK (mínimo 20): x4 (notional 24).
   - BTC (mínimo 50): x9 (notional 54).
   - Con x1–x2 estos últimos quedaban rechazados.

   Los MIN_NOTIONAL son los del exchangeInfo actual: los históricos no se publican.

   Como a x9 la liquidación en aislado queda a ~10 % de la entrada, el simulador modela la liquidación:
   - Si el precio llega a ese nivel antes que al stop, se pierde todo el margen.
   - Mantenimiento supuesto: 1 %, sin verificar (la tabla de brackets de Binance es un endpoint autenticado).
6. **Tamaño: margen fijo**, como hoy (Regla 1 de `RULES.md` sin cambios). El vol-target de la literatura no se usa para dimensionar. Queda solo como línea base (B2) y como referencia.
7. **Motor de backtest en TypeScript**, dentro de `src/backtest/`.

---

## 10. Primeros resultados (2026-10-05) — in-sample, sin walk-forward

**Período:** 2021-01-01 → 2025-09-30 (el holdout 2025-10 → 2026-09 no se tocó). **Costos ×1.** Margen de 6 USDT con apalancamiento x1–x10 y máximo 5 posiciones. Corridas registradas en `data_dl/backtests/registry.jsonl`.

> **Advertencia.** Todo esto es in-sample, sobre el período completo y eligiendo la mejor de varias variantes. **No es evidencia de edge todavía.** Sirve para descartar ideas y para detectar problemas de diseño, no para elegir una estrategia.

**Datos:**
- 679 perpetuos elegibles descargados (40.931 archivos, 0 errores).
- 596 instrumentos pasaron por el top 100 en algún momento.
- Los saltos de más del 50 % en 1h son eventos reales (LUNA, ZKJ, pumps de listados), no errores de escala.

### Líneas base
| | CAGR | MDD | Sharpe |
|---|---|---|---|
| B0 BTC comprado y mantenido | 17,7 % | 78,9 % | 0,57 |
| B1 top 5 por volumen, semanal | −4,9 % | 95,2 % | 0,37 |

### Hallazgo 1: con 30 USDT el tamaño mínimo de Binance hace inviable un MDD del 25 %
El bot exige un notional de al menos 10 USDT (Regla 1), así que cada posición es de 12 USDT, el 40 % de la cuenta. Con un stop de 2,5 ATR diario (15–20 % en altcoins), cada trade arriesga el 6–8 % del capital, y 4 stops seguidos rompen el 25 %.

Con 30 USDT casi todas las variantes **quiebran la cuenta**: un anual de −17 % y un MDD de 88–95 % quieren decir que se quedó sin margen para operar. Con el mismo margen de 6 USDT y **300 USDT** de capital, el riesgo por trade baja a ~0,7 % y las mismas reglas dan:

| Variante (300 USDT) | Trades | PF | Anual | MDD | Sharpe | Sin top 3 monedas | Años negativos |
|---|---|---|---|---|---|---|---|
| T1 1d long n20, trailing del bot | 375 | 1,82 | 33,8 % | 16,4 % | 0,85 | +154 (de +482) | 2022, 2024 |
| T1 1d long n55, trailing del bot | 341 | 1,22 | 7,7 % | 22,0 % | 0,32 | | |
| T1 1d long n55, trailing nativo | 1.705 | 1,02 | 1,2 % | 18,7 % | 0,11 | | |
| T1 1d **short** n20, trailing nativo | 1.348 | 1,24 | 10,0 % | 7,9 % | 0,80 | +114 (de +143) | 2023 (−2 %) |
| T2 4h **short** n20, trailing nativo | 1.696 | 1,18 | 8,6 % | 9,1 % | 0,65 | +92 (de +122) | 2023 (−2 %) |

### Hallazgo 2: en largos de 1d, el trailing nativo de Binance no sirve con callback desde la entrada
- Con trailing nativo, las posiciones largas duran **1,2 velas diarias en promedio**, contra 19 con el trailing del bot (chandelier de 3 ATR).
- La causa es que 3 ATR diarios en altcoins son el 18–24 %, y Binance recorta el callback al 10 %: la posición sale en el ruido normal del día siguiente.
- Resultado: rinde igual que el bracket actual (los dos pierden), mientras que el trailing del bot es la única salida larga rentable.
- Variantes no probadas que podrían cambiar esto:
  - Nativo con `activatePrice`, para que el trailing arranque recién después de +k ATR.
  - Stop gestionado por el bot y actualizado una vez por día. En 1d eso es un solo reemplazo de orden por posición y por día.

### Hallazgo 3: T2 (4h) y M1 (retroceso RSI(2)) no funcionan
- **T2 largo** pierde con las tres salidas.
- **M1** pierde en 4h. En 1d queda en PF ~1,05–1,10, sin edge después de costos. Coincide con la investigación: la reversión no rinde en un top 100.

### Hallazgo 4: los cortos rinden más parejo que los largos
- Contra lo que anticipaba la literatura, en este período (bear de 2022 y caída lenta de las altcoins en 2024–2025) los cortos con trailing nativo son los más estables: MDD bajo, poca dependencia de las mejores monedas y 4 de 5 años positivos.
- La decisión sigue siendo operar solo largos. Esto queda como información.

### Advertencias
- **Trial budget:** ya hay ~50 corridas registradas, contando la sensibilidad de capital. El Deflated Sharpe tiene que descontar esa N.
- **Dependencia de outliers:**
  - El mejor largo depende de un puñado de trades: MYX 2025 aportó +167 USDT, con +112 de funding cobrado durante un squeeze de cortos.
  - El PnL sin las 3 mejores monedas cae al ~30 %.
- **Faltan:** walk-forward, costos ×2, Monte Carlo y Deflated Sharpe. Ninguna variante llega todavía al umbral de Sharpe ≥ 1,0.

---

## 11. Validación fuera de muestra (2026-10-05) — ninguna variante pasa

**Decisiones del usuario tras §10:**
- Capital de **300 USDT**, con margen fijo de 6 USDT y x1–x10.
- Probar el stop gestionado por el bot y el trailing nativo con activación.
- **Evaluar los cortos en serio**, con el mismo margen.

**Método (`src/backtest/validate.ts`):**
- Pools pre-registrados en `presets.ts`:
  - `LONG_WF`: T1 completo, más el trailing nativo con activación a +2 ATR.
  - `SHORT_WF`: T1 corto n20/n55 × {nativo, bot}, más T2 corto.
- Walk-forward de 24 meses in-sample y 6 out-of-sample, **re-seleccionando** la mejor variante en cada paso.
- Costos ×1 y ×2, Monte Carlo por bloques de 10 días y Deflated Sharpe con N = variantes distintas probadas (34).
- El holdout no se tocó.

### Resultados
| | Sharpe OOS | Anual OOS | MDD OOS | MC p95 | DSR |
|---|---|---|---|---|---|
| Walk-forward largos | 0,53 (×2: 0,50) | 17,0 % | 30,3 % | 73,3 % | 0,19 |
| Walk-forward cortos | −0,04 (×2: −0,38) | −0,4 % | 11,6 % | 33,9 % | 0,04 |
| *Umbral (§8.7)* | *≥ 1,0* | | | *≤ 25 %* | *≥ 0,95* |

- **Largos:** el resultado OOS lo explica casi entero un solo semestre (2025-07 → 2025-09: +152,5 USDT, el squeeze de MYX). Sin ese tramo, los otros cinco semestres suman −12 USDT.
  - La mejor variante en todo el período (T1 n20 con trailing del bot) tiene un MDD histórico del 16 %, pero de **66 % en el p95 de Monte Carlo**: depende de días extremos que no se repiten de forma confiable.
  - El trailing nativo con activación no rescata los largos: Sharpe −0,04 con n20 y 0,32 con n55.
- **Cortos:** in-sample se veían estables (Sharpe 0,80, MDD 8 %), pero la re-selección fuera de muestra da ~0, y con costos ×2 son negativos.
  - Son sensibles a los costos: muchos trades cortos con el trailing nativo.

### Lectura
Según el protocolo (`PROMPT_GUIDE.md`, "si no funciona, descarto la idea completa y no la retoco"), **T1, T2, M1 y los cortos quedan descartados en su forma actual.** No se ajustan parámetros mirando estos resultados.

Diferencias de diseño contra la literatura que sí tenía resultados positivos (Zarattini, dimaquant), y que estaban pre-registradas en §6 pero todavía no se corrieron:
1. **Universo:**
   - Esas pruebas usan el top 20–40 líquido. El nuestro es el top 100, y la investigación ya advertía que en las chicas los breakouts **revierten** (dimaquant).
   - La prioridad por "fuerza de la ruptura en ATR" favorece justamente los pumps más estirados, que tienden a ser monedas chicas.
2. **Filtro de fuerza relativa (X1)** y **corte por nivel de liquidez:** los dos estaban en §6 y no se probaron todavía.
3. **Presupuesto de pruebas:** quedan ~10 corridas antes de llegar a las ~45 que admite el período.

---

## 12. Opción A: universo top 30 y fuerza relativa (2026-10-05) — tampoco pasa

**Qué se probó:** los dos ítems de §6 que faltaban, solo sobre el T1 largo con trailing del bot y sin tocar nada más:
- Universo top 30 líquido (n20 y n55).
- Filtro de fuerza relativa residual X1 sobre n20: L {14, 28} × top k {5, 10}.

Son 6 variantes nuevas, así que N = 40. El walk-forward re-selecciona sobre las 14 variantes largas.

**Lo que mejoró, en el período completo:** depende menos de outliers. Sin las 3 mejores monedas conserva entre el 28 % y el 43 % del PnL, y los MDD bajan a 20–29 %. La mejor nueva es top 30 n55: Sharpe 0,64 y MDD del 19,9 %.

**Lo que no alcanza:**

| | Sharpe OOS | Anual OOS | MDD OOS | MC p95 | DSR |
|---|---|---|---|---|---|
| Walk-forward largos (pool ampliado) | 0,39 (×2: 0,36) | 8,0 % | 19,5 % | 51,7 % | 0,13 |
| *Umbral* | *≥ 1,0* | | | *≤ 25 %* | *≥ 0,95* |

- La re-selección eligió top 30 n55 en los últimos 4 semestres.
- Sus resultados OOS alternan: −53, +41, −33, +49 USDT. No hay un edge estable.

**Conclusión:** con esto se agotan los ítems pre-registrados para breakout/tendencia de serie temporal. Según el protocolo, **se cierra esta línea sin retocarla.** El holdout sigue sin usarse.

**Presupuesto de pruebas:**
- Ya hay 40 variantes distintas probadas sobre estos ~5 años. Cualquier familia nueva sobre los mismos datos arranca con un Deflated Sharpe más exigente: el N es acumulativo, porque los datos son los mismos.
- La próxima familia tiene que venir con una tesis nueva y pocas variantes, idealmente 3 o 4.
