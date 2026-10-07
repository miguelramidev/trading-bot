# Desbloqueos de tokens y señales del "presente" (volumen, flujo, libro) — pre-registro

**Fecha:** 2026-10-07 · **Estado:** pre-registrado; sin resultados.

Las dos líneas las pidió el usuario después del torneo (`2026-10-07-torneo.md`). Igual que antes, primero se hace una **revisión que no opera** (estudio de eventos o deciles). Si muestra algo, entra a un **segundo torneo en sombra**; ninguna va a dinero real directo.

---

## A · Cortos antes de desbloqueos (UNLOCK)

**Tesis.** Cuando se liberan tokens de equipo o inversores, esos tenedores venden. Si el desbloqueo es grande respecto de lo que ya circula, la presión vendedora mueve el precio, y empieza antes de la fecha porque el mercado lo anticipa (Keyrock: ~90 % de desbloqueos con presión negativa desde ~30 días antes).

**Datos** (gratis):
- Calendario: DefiLlama, `emissionsProtocolsList` y `emissions/<slug>`.
- Ticker: `coins.llama.fi`.
- Velas diarias y funding de los perpetuos de Binance (`data_dl/`).

**Eventos:**
- Desbloqueos de tipo `cliff` (de golpe) con fecha entre 2022-01-01 y 2025-09-30. Los de una misma moneda en el mismo día se suman.
- **Tamaño** = tokens liberados / tokens ya desbloqueados el día anterior (todas las categorías, serie `documentedData`).
- **Grupos:** grande (≥ 1 %) y chico (< 1 %). Por categoría: equipo e inversores (`insiders`, `privateSale`) contra el resto.
- **Solo cuentan** eventos de monedas con perpetuo USDT en Binance que ya cotizaba **30 días antes** del evento y siguió cotizando **30 días después**.

**Medición:**
- Retorno del perpetuo **ajustado por BTC** (log de la moneda − log de BTC) en las ventanas [−30, −1], [−7, −1], [0, +7] y [+1, +30] días. El día 0 es la fecha del evento.
- **Prueba de trading:** corto desde el cierre del día −8 hasta el cierre del día +7, con BTC como referencia.
  - Resultado = −(retorno ajustado) + funding cobrado por el corto − 0,3 % de costos (comisión y slippage de ida y vuelta, el doble del taker por cautela).

**Pasa si, en los eventos grandes:**
1. El resultado medio del corto es **> 0** con **t > 2**, con errores agrupados por mes.
2. Es positivo en **las dos mitades**: 2022–2023 y 2024–2025.
3. Sigue siendo **> 0 sin los 3 mejores eventos**.

Si pasa, entra a un segundo torneo en sombra: aviso automático N días antes de cada desbloqueo grande, corto virtual y registro del resultado.

---

## B · Señales del presente: flujo de órdenes, volumen y libro

**Tesis.** Lo que pasa *ahora* en el mercado (quién compra o vende agresivamente, si el volumen se dispara, si el libro está cargado de un lado) anticipa el movimiento de las horas siguientes.

**Advertencia anticipada:**
- Estas señales suelen tener efecto en **segundos o minutos**, el terreno de las firmas de alta frecuencia.
- Acá se miden con resolución de **1 hora** (velas cerradas), que es lo que el bot puede operar sin cambiar de infraestructura. Si el efecto existe solo a escala de segundos, esta revisión no lo va a ver, y operarlo exigiría otra infraestructura (un proceso conectado 24/7).
- No se sabe de antemano si el efecto es de **continuidad** o de **reversión**. Por eso se acepta cualquiera de los dos signos, pero con una vara más alta y exigiendo que el signo sea **el mismo** en todas las réplicas.

**Señales**, con muestreo al cierre de cada vela de 1h, sobre el top 30 y las monedas 31–60 por separado:
- **FLOW:** proporción de volumen comprador agresivo (taker buy / volumen) de las últimas 4 h. z-score de 30 días por moneda.
- **VOLSPIKE:** z-score del volumen de las últimas 4 h contra 30 días, multiplicado por el signo del retorno de esas 4 h. Positivo = volumen alto con suba; negativo = volumen alto con caída.
- **BOOK** (solo si FLOW o VOLSPIKE muestran algo, porque los datos pesan varios GB): desequilibrio del libro a ±1 %, (compras − ventas) / (compras + ventas), al cierre de cada hora. Desde 2023-01, top 10.

**Medición.**
- Retorno futuro ajustado por mercado (menos el promedio del grupo en esa hora) a **4 h** y **24 h**, por decil de la señal.
- t corregido por superposición (÷ √horizonte en velas) y agrupado por fecha.
- Período: 2022-02 → 2025-09.

**Pasa si:**
1. El decil extremo (D1 o D10) tiene **|t corregido| > 2,5** en **los dos grupos** (top 30 y 31–60).
2. El signo es el mismo en los dos grupos y en las dos mitades del período (2022–2023 y 2024–2025).
3. El efecto, en % por operación, supera **0,2 %** a 4 h o **0,3 %** a 24 h, para que haya margen sobre los costos.

---

## Resultado B · señales del presente (2026-10-07)

Script: `src/backtest/analysis/presentScreens.ts`, con ~960 mil observaciones por grupo y horizonte (cada hora, 2022-02 → 2025-09). Retorno ajustado por mercado del decil extremo, con t corregido por superposición.

| Señal | Horizonte | Top 30 | Monedas 31–60 |
|---|---|---|---|
| FLOW (compras agresivas) | 4 h | D1 −0,001 % · D10 −0,012 % (t −0,7) | D1 +0,016 % (t 1,2) · D10 −0,020 % (t −1,2) |
| FLOW | 24 h | D1 +0,03 % · D10 −0,02 % (t ≤ 0,3) | D1 +0,01 % · D10 −0,03 % (t ≤ 0,3) |
| VOLSPIKE (volumen × signo) | 4 h | D1 −0,036 % (t −1,2) · D10 +0,008 % | D1 −0,018 % · D10 −0,050 % (t −2,0) |
| VOLSPIKE | 24 h | D1 −0,157 % (t −1,0) · D10 −0,008 % | D1 −0,118 % (t −0,9) · D10 −0,180 % (t −1,3) |

**No pasa ninguna.** Ningún decil extremo llega a |t| > 2,5, y todos los efectos quedan muy por debajo del mínimo pre-registrado (0,2 % a 4 h, 0,3 % a 24 h).

- **VOLSPIKE D1** (volumen alto con caída → sigue cayendo a 24 h) tiene el mismo signo en los dos grupos y en las dos mitades, pero es chico (−0,12 a −0,16 %) y con t ≈ −1. Se anota y **no** se convierte en candidata.
- **A escala de 1 hora, el flujo de órdenes y el volumen no anticipan nada operable.** Si el efecto existe, vive a escala de segundos, el terreno de la alta frecuencia.
- **BOOK no se corre:** el pre-registro lo condicionaba a que FLOW o VOLSPIKE mostraran algo.

---

## Resultado A · desbloqueos (2026-10-07)

Script: `src/backtest/analysis/unlockStudy.ts`.

**Eventos:**
- 10.425 desbloqueos de golpe entre 2022 y 2025 con perpetuo en Binance.
- **7.559 medibles**, de 89 proyectos. El cruce de ticker se validó por precio una vez por proyecto, y ningún proyecto se descartó por ticker homónimo.
- 2.866 eventos sin precio en la ventana.

**Con los criterios pre-registrados, pasa:**

| Grandes (≥ 1 %), N = 703 | Resultado | Exigido |
|---|---|---|
| Corto de −8 a +7, con funding y 0,3 % de costos | **+4,94 %**, t (por mes) 2,97 | > 0 y t > 2 ✅ |
| Mitades | +1,66 % (2022–23) / +6,23 % (2024–25) | ambas > 0 ✅ |
| Sin los 3 mejores | +4,56 % | > 0 ✅ |

**Pero no es un efecto de los desbloqueos.** La señal de alarma: los desbloqueos **chicos** (< 1 %), que según la tesis no mueven el precio, daban casi lo mismo (+3,46 %), y todas las ventanas eran negativas contra BTC, incluso a +30 días.

El pre-registro **no incluía un grupo de control**, y fue un error de diseño. Se agregó después, como prueba **más exigente**: el mismo corto, en la misma ventana, sobre las monedas del top 100 sin desbloqueos de golpe a ±15 días.

| | Corto en el evento | Mismo corto sin desbloqueo (control) | **Exceso** |
|---|---|---|---|
| Grandes (N = 703) | +4,94 % | +4,30 % | **+0,65 %** (t 0,40; mitades −0,73 % / +1,19 %) |
| Grandes, equipo e inversores (N = 512) | +5,03 % | +4,64 % | **+0,39 %** (t 0,01) |
| Chicos (N = 6.856) | +3,46 % | +3,68 % | **−0,22 %** (t −0,99) |

**Conclusión: UNLOCK se descarta.** La ganancia aparente se explica porque entre 2022 y 2025 casi cualquier altcoin rindió menos que BTC (la dominancia de BTC subió de forma sostenida). El desbloqueo agrega, como mucho, una fracción de punto que no se distingue de cero.

**Observación a posteriori, no candidata:** "corto en altcoins contra BTC" ganó ~4 % cada 15 días en 2022–2025. Es una tendencia de régimen, no una ventaja. Se medió en un período de dominancia de BTC en alza y deja afuera 2021 (temporada de altcoins), cuando habría perdido fuerte. Para considerarla habría que pre-registrarla con 2020–2021 incluidos y un filtro de régimen, y validarla en sombra.
