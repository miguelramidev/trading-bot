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
