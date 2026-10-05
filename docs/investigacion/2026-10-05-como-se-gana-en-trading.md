# ¿Cuál es la forma más rentable de hacer trading hoy?

**Fecha:** 2026-10-05. Responde a la pregunta del usuario después de que ninguna de las 44 variantes direccionales del backtest pasara la validación (ver [`2026-10-05-estrategias-1h-1d.md`](2026-10-05-estrategias-1h-1d.md) §14).

Reúne tres investigaciones:
1. Quién gana plata realmente siendo minorista.
2. Fuentes de retorno estructurales accesibles.
3. Qué hacen las firmas que más ganan y qué parte es replicable.

Todas las cifras llevan su fuente. Las de fuentes secundarias están marcadas **[secundaria]**, y las que no se pudieron verificar, **[sin verificar]**.

---

## Respuesta corta

**La forma más rentable de "hacer trading" hoy no es predecir precios: es estar del otro lado del minorista** (market making, compra de flujo de órdenes, vender el producto) **o cobrar una prima de riesgo con escala y apalancamiento barato.** Ninguna de las dos es replicable con 300 USDT.

Para una persona con poco capital y un trabajo de tiempo completo, lo realista, en orden, es:
1. Ahorrar e invertir en forma pasiva. Es el motor real de patrimonio.
2. Cobrar primas de riesgo con disciplina. El carry de funding, por ejemplo, prendiéndolo solo cuando paga.
3. Usar la programación en nichos chicos que a los grandes no les interesan, sabiendo que la capacidad es limitada y que se vuelven más competidos con el tiempo.

---

## 1. Quién gana y quién pierde: las tasas base

| Dónde | Dato | Fuente |
|---|---|---|
| Brasil, day traders de mini índice | 97 % de los que persistieron más de 300 días perdió; solo el 1,1 % ganó más que el salario mínimo; no hay evidencia de aprendizaje | [Chague, De-Losso & Giovannetti](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3423101) |
| Taiwán, 15 años de todos los trades | Menos del 1 % de los day traders es rentable de forma predecible después de costos; más del 75 % abandona en 2 años | [Barber, Lee, Liu, Odean](https://faculty.haas.berkeley.edu/odean/papers/Day%20Traders/Day%20Trading%20and%20Learning%20110217.pdf) |
| India, derivados (más de 10 M de traders) | 93 % perdió entre FY22 y FY24 (91 % en FY25); las firmas prop y los extranjeros ganaron, el 96–97 % con algoritmos | [SEBI](https://aibi.org.in/Sebipr/Updated_SEBI_Study_Reveals_93_percentage_of_Individual_Traders_Incurred_Losses_in_Equity_F&O_between_FY22_and_FY24.pdf) |
| CFDs (avisos obligatorios de los brokers) | 60–73 % de las cuentas minoristas pierde (IG 70 %, CMC 69 %, Pepperstone 72,9 %) | [IG](https://www.ig.com/uk), [ESMA](https://www.esma.europa.eu/press-news/esma-news/esma-agrees-prohibit-binary-options-and-restrict-cfds-protect-retail-investors) |
| Cripto spot (BIS, 95 países) | La mayoría perdió plata con bitcoin; el inversor mediano perdió ~la mitad | [BIS Bulletin 69](https://www.bis.org/publ/bisbull69.htm) |
| Cripto perpetuos | ~75–86 % de las wallets de Hyperliquid pierde; solo el 18 % de los usuarios indios de futuros fue rentable | [BeInCrypto](https://beincrypto.com/hyperliquid-traders-profitability/), [Bitget](https://www.bitget.com/news/detail/12560605671688) **[secundaria]** |
| Firmas prop ("cuentas fondeadas") | Topstep 2025: el 16,8 % pasa, el 33 % de los fondeados cobra algo y el 0,71 % llega a cuenta real. Industria: el 7 % cobró alguna vez | [Topstep](https://www.topstep.com/our-program), [Finance Magnates](https://www.financemagnates.com/forex/only-1-in-20-traders-pass-prop-firm-challenges-reports-the-funded-trader/) |
| Copy trading | El 97 % de los líderes gana con su propia cuenta, pero solo el 43,6 % hace ganar a sus seguidores (demoras, comisiones, reparto de ganancias) | [YieldFund](https://yieldfund.com/is-copy-trading-profitable-a-90-day-multi-exchange-study) **[industria]** |
| Memecoins (pump.fun) | El 98,6 % de los tokens fueron rug pulls o pump-and-dumps; en marzo de 2026, ~96 % de las wallets perdió o ganó menos de $500 | [CoinDesk/Solidus](https://www.coindesk.com/business/2025/05/07/98-of-tokens-on-pump-fun-have-been-rug-pulls-or-an-act-of-fraud-new-report-says) |
| Profesionales vs. índice | El 90 % de los fondos activos de gran capitalización en EE.UU. quedó por debajo del S&P 500 a 15 años | [SPIVA vía Sustainable Investing](https://sustainableinvest.com/chart-of-the-week-september-28-2026-most-large-cap-active-funds-trailed-the-sp-500-in-h1-2026/) **[secundaria]** |

**Qué tiene en común la minoría que gana** (Taiwán, India, Binance):
- Provee liquidez en vez de tomarla: en Taiwán, las órdenes pasivas de los individuos eran rentables y las agresivas explicaban las pérdidas.
- Opera automatizada y con capital.
- Usa poco apalancamiento y rota poco.
- Se especializa en algo concreto.
- La habilidad persiste solo en los extremos (top ~1 %), y solo un historial largo y honesto la distingue de la suerte.

---

## 2. Quién gana más en el mundo y por qué no es replicable

| Actividad | Rendimiento típico | Qué hace falta | ¿Replicable con 300–5.000 USD? |
|---|---|---|---|
| Market making / HFT (Jane Street, Citadel Securities, HRT, XTX) | Jane Street: $20.500 M de ingresos por trading en 2024 ([Bloomberg](https://www.bloomberg.com/news/articles/2025-04-23/jane-street-s-20-5-billion-trading-haul-tops-citigroup-bofa)); Citadel Securities: $9.700 M ([Hedgeweek](https://www.hedgeweek.com/griffins-citadel-securities-reports-record-9-7bn-trading-revenue/)) | Colocación, hardware, licencias, balance, flujo de órdenes comprado | **No** |
| Comprar flujo de órdenes minoristas | ~90 % de los ingresos transaccionales de Robinhood **[secundaria]** | Ser broker-dealer mayorista | **No** |
| Fondos multiestrategia (Citadel, Millennium, D.E. Shaw) | +15 a 18 % neto en 2024 ([Institutional Investor](https://www.institutionalinvestor.com/article/2eaxu6g8f1zzvc4ipdc74/hedge-funds/d-e-shaw-tops-a-2024-hedge-fund-ranking)) | Apalancamiento barato 5–10x, cientos de equipos, datos pagos | **No** |
| Renaissance Medallion | ~66 %/año bruto (1988–2018), cerrado a terceros | Décadas de investigación y datos; ni sus propios fondos abiertos replican el resultado | **No** |
| Trend following / CTAs | +20 % en 2022, pero ~2,2 %/año en 2015–2025 (SG Trend) ([Quantica](https://quantica-capital.com/en/publication/qi-2025Q3)) | Diversificar en ~50 futuros | **Parcial.** Lo más barato es un ETF (DBMF, KMLM) |
| MEV | $233,8 M entre 19 searchers en 19 meses; los 3 primeros se llevaron ~75 % ([arXiv](https://arxiv.org/abs/2507.13023)) | Latencia e integración con builders | **No**, el ganador se lleva casi todo |
| Carry de funding / basis (tipo Ethena) | 2024: ~18 %; hoy en Binance: **~4,2 % anual en BTC** ([The Block](https://www.theblock.co/data/crypto-markets/futures/btc-funding-rates)) | Dos patas, gestión de margen | **Sí / parcial** |
| Arbitraje en mercados de predicción (Polymarket) | ~$40 M entre todos los arbitrajistas en un año; la mejor wallet ~$2 M ([IMDEA vía PANews](https://www.panewslab.com/en/articles/4ca4686b-73ee-4782-b94a-a36d612ce464)) | Scanners rápidos, lógica entre mercados relacionados | **Sí.** Uno de los pocos nichos para un programador solo, aunque se está llenando de bots |
| "Ser la casa" (señales, cursos, cuentas prop) | Sin cuantificar | Audiencia y distribución | **Sí comercialmente**, con riesgo ético y regulatorio |

**La idea central:** los que más ganan no adivinan hacia dónde va el precio. Cobran por dar liquidez a escala, compran el flujo de los minoristas, o cobran primas con apalancamiento barato. El minorista típico es la contraparte que les paga.

---

## 3. Lo accesible hoy para este caso (300 USDT, Binance, programador, trabajo fijo)

| Prioridad | Opción | Rendimiento neto esperado hoy | Riesgo principal | Encaje |
|---|---|---|---|---|
| 1 | **Ahorrar y aportar capital** | — | — | Lo que más mueve la aguja: con 300 USDT, la diferencia entre la mejor y la peor opción sensata es de ~$20/año |
| 2 | Parte en stablecoins: Binance Simple Earn USDT Flexible | ~3 % base; hasta ~7 % con promociones topeadas en saldos chicos (≤800 USDT) ([cex101](https://cex101.com/en/articles/binance-simple-earn-review-2026/)) | Custodia en Binance | Excelente para la parte en efectivo |
| 3 | Referencia sin riesgo: T-bills / tokenizadas (USDY) | T-bill a 3 meses: **4,11 %** ([Trading Economics](https://tradingeconomics.com/united-states/3-month-bill-yield)); USDY ~4,4 % | Emisor/KYC | Toda estrategia tiene que superar esto |
| 4 | **Carry de funding** (spot largo + perpetuo corto 1x), **prendido solo cuando paga** | Hoy ~4 % bruto, igual que la T-bill. En euforia, 10–30 %+ | Exchange; ADL (10/10/2025: Binance cerró los cortos ganadores, que eran la cobertura); funding negativo | **El mejor uso del bot y de tus habilidades:** como monitor que lo active cuando el funding supere a la T-bill + 3–4 % |
| 5 | Exposición de largo plazo (DCA en BTC y/o índice global) | La prima del activo; caídas de −77 % | Mercado | No es "edge"; es el núcleo del patrimonio, con un tamaño que te permita aguantar la caída |
| 6 | Vault HLP de Hyperliquid | ~15–25 % histórico **[secundaria]** | Vende volatilidad; manipulaciones (JELLY, POPCAT) | Como mucho, un satélite chico |
| 7 | BNB + Launchpool/HODLer Airdrops | ~8 %/año en tokens sobre el BNB ([PANews](https://panews.io/articles/36d47306-8503-484d-955a-ffd69b6045ab)) | Precio de BNB, concentración en Binance | Solo si ya querés tener BNB |
| 8 | Dual Investment / venta de opciones | Prima menos el margen de Binance | Cola de crash, upside topeado | Solo calls cubiertos sobre BTC que ya tengas |
| — | **Evitar:** bots de grid (son reversión a la media, que ya fue rechazada), LP en Uniswap (casi la mitad de los LPs pierde contra holdear, [Loesch et al.](https://arxiv.org/pdf/2111.09192)), arbitraje CEX-CEX, MEV, memecoins, señales pagas, cuentas prop | | | |

---

## 4. Conclusión para el proyecto

1. **El resultado del backtest es el esperable, no un fracaso del método.** Que 44 variantes direccionales no tengan edge fuera de muestra coincide con la literatura: menos del 1 % de los traders direccionales tiene habilidad persistente. El motor y el protocolo hicieron su trabajo, que era evitar arriesgar dinero en algo sin edge.
2. **Cómo se reconvierte el bot sin tirar nada:**
   - **Monitor de funding y carry** que prende la operación delta-neutral solo cuando el funding paga muy por encima de la T-bill. Se backtestea con el mismo motor y la misma disciplina; los datos de funding ya están descargados.
   - **Modo sombra** de los dos candidatos direccionales menos malos, solo registrando señales.
   - **Auditoría de la estrategia de 15m** que hoy opera con dinero real.
3. **El dinero importante va a lo pasivo.** El bot queda como un "satélite" chico, con reglas de corte decididas de antemano.
