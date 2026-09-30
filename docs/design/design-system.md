# MacroQuant — Sistema de diseño

Especificación para implementar el rediseño en Flutter (`app/`). Las maquetas de referencia están en `maquetas/` (un HTML por pantalla, escritorio y celular). Los valores de este documento mandan sobre cualquier valor escrito a mano en las maquetas.

## 1. Principios

1. **Honestidad ante todo.** La app nunca muestra un dato inventado, decorativo o fijo. Si un dato no existe, se muestra `—`, nunca un `0` que parece real. Ningún texto promete una protección o una capacidad que el sistema no tiene.
2. **Decidir primero.** En cada pantalla, lo que sirve para tomar una decisión va arriba y en grande. Los gráficos y los detalles son respaldo.
3. **Riesgo en plata.** Siempre que se pueda, los niveles (SL, TP) se traducen a cuánto se gana o se pierde en USDT, con la comisión estimada incluida.
4. **Hora visible.** Los datos no son en tiempo real: toda pantalla con datos de Binance muestra de qué hora son ("Datos de las 14:32").
5. **Estados claros.** Cada estado (pendiente, ejecutada, stop, objetivo, descartada, expirada, crítico) tiene un color y un texto propios, y se distingue también sin color.

## 2. Tokens

Todos los tokens viven en `core/theme/` y ninguna pantalla escribe colores, tamaños, espaciados ni radios a mano.

### 2.1 Colores (`AppColors`)

| Token | Hex | Uso |
|---|---|---|
| `background` | `#0E1116` | Fondo de la app |
| `surface` | `#151A21` | Tarjetas y secciones |
| `surfaceRaised` | `#1B222B` | Elementos seleccionados, avisos informativos, nav activo |
| `surfaceSunken` | `#11151B` | Barra inferior, fondo de gráficos, encabezados de tabla |
| `inputBackground` | `#0E1116` | Fondo de campos de texto |
| `border` | `#262E39` | Borde de tarjetas, botones secundarios, campos |
| `borderStrong` | `#3A4553` | Borde de filtro seleccionado |
| `divider` | `#222A34` | Separadores dentro de tarjetas |
| `dividerSubtle` | `#1E252E` | Separadores entre filas de listas y bordes de layout |
| `textPrimary` | `#E6EAF0` | Texto principal |
| `textSecondary` | `#9AA4B2` | Etiquetas y texto secundario |
| `textTertiary` | `#7A8594` | Notas al pie, deshabilitados |
| `textSubtle` | `#C9D1DB` | Texto de avisos informativos |
| `textOnAccent` | `#0B1220` | Texto sobre botones de acento y etiquetas de color sólido |
| `accent` | `#4C9AFF` | Botón principal, switches activos, marca |
| `accentText` | `#8CC2FF` | Links y etiquetas de acento |
| `positive` | `#3FD089` | Ganancia, LONG, objetivo, estados activos |
| `negative` | `#FF8A80` | Pérdida, SHORT, stop (texto) |
| `negativeCandle` | `#FF6B61` | Velas bajistas |
| `warning` | `#F2B441` | Avisos: margen insuficiente, llegar tarde, vencimiento cercano |
| `critical` | `#D50000` | Solo el diálogo de estado crítico (ya existe) |
| `buttonLight` | `#F1F3F6` | Botón de Google |

Fondos translúcidos (tints), siempre sobre `surface`:

| Token | Valor |
|---|---|
| `positiveTint` | `positive` al 12% |
| `negativeTint` | `#FF6B61` al 12% (etiquetas) y al 8% (bloques de "si toca el stop") |
| `accentTint` | `accent` al 14% |
| `warningTint` | `warning` al 10% |
| `positiveTintSoft` | `positive` al 8% (bloques de "si toca el objetivo") |

Se eliminan los colores sueltos actuales (`#07090D`, `#09141E`, `#0F172A`, `#10B981`, `Colors.*` crudos).

### 2.2 Tipografía (`AppTextStyles`)

Dos familias: **Plus Jakarta Sans** para la interfaz y **JetBrains Mono** para todo número (precios, montos, porcentajes, horas en tablas).

| Estilo | Familia | Tamaño | Peso | Uso |
|---|---|---|---|---|
| `numDisplay` | Mono | 40 | 600 | Balance total, PnL principal (escritorio) |
| `numXL` | Mono | 32 | 600 | Último precio en detalle de señal |
| `numL` | Mono | 24 | 600 | Métricas secundarias del balance |
| `numM` | Mono | 20 | 600 | PnL de posición, montos en "si toca" |
| `numS` | Mono | 14 | 400 | Precios en tarjetas y tablas |
| `numXS` | Mono | 12 | 400 | Etiquetas de niveles bajo la barra SL–TP |
| `title` | Sans | 24 | 700 | Título de pantalla (escritorio) |
| `titleMobile` | Sans | 20 | 700 | Título de pantalla (celular) |
| `section` | Sans | 18 | 700 | Encabezado de sección (escritorio; 17 en celular) |
| `cardTitle` | Sans | 16 | 700 | Título dentro de tarjeta (15 en celular) |
| `symbol` | Sans | 20 | 700 | Símbolo en tarjeta de señal (18 en celular) |
| `body` | Sans | 14 | 400 | Texto general |
| `bodySmall` | Sans | 13 | 400 | Subtítulos, contexto, avisos |
| `caption` | Sans | 12 | 400/600 | Etiquetas de campos, etiquetas de estado |
| `micro` | Sans | 11 | 400 | Notas mínimas (solo celular) |

Reglas: no usar mayúsculas sostenidas para etiquetas (se eliminan las etiquetas estilo "PNL NO REALIZADO (UPNL)"). No escribir `fontSize:` en las pantallas: siempre un estilo de esta tabla.

### 2.3 Espaciado (`AppSpacing`)

Escala de 4 px: `xs 4`, `sm 8`, `md 12`, `lg 16`, `xl 20`, `xxl 24`, `xxxl 28`, `huge 32`, `huger 40`.

- Padding de pantalla: escritorio `28` arriba y `40` a los costados; celular `16`.
- Separación entre secciones: escritorio `24–28`; celular `16–24`.
- Padding interno de tarjeta: escritorio `20–24`; celular `16–18`.

### 2.4 Radios (`AppRadius`)

| Token | Valor | Uso |
|---|---|---|
| `tag` | 6 | Etiquetas LONG/SHORT |
| `sm` | 8 | Pestañas, botones de paginación |
| `md` | 10 | Campos, botones de escritorio, avisos |
| `lg` | 12 | Botones grandes (celular), botón principal |
| `xl` | 16 | Tarjetas y secciones |
| `pill` | 999 | Etiquetas de estado, filtros, switches |

### 2.5 Layout

- **Un solo breakpoint: 900 px** (el login hoy usa 800: se unifica).
- Escritorio: barra lateral de navegación de 76 px con tres ítems (Inicio, Historial, Configuración).
- Celular: encabezado de 60 px y barra inferior de 72 px con los mismos tres ítems.
- Área táctil mínima de **44 px** en todo elemento interactivo.

## 3. Formato de datos (`core/utils/`)

| Función | Regla |
|---|---|
| `fmtSymbol` | Ya existe. `ZAMA/USDT:USDT` → `ZAMA` |
| `fmtPrice` | Ya existe. Siempre para precios; nunca decimales fijos |
| `fmtUsd` | Signo explícito para resultados: `+$0.08`, `−$0.32` (con el signo menos tipográfico `−`). Balances sin signo: `$40.12` |
| `fmtPct` | Dos decimales con signo en resultados: `+0.24%`, `−1.50%` |
| `fmtMissing` | `—` para cualquier dato nulo o no calculable |
| `fmtDataTime` | `Datos de las HH:MM` (hora local del dispositivo) |
| `stripHtml` | Ya existe. Para `reason` y cualquier texto que venga del backend |

Nunca se muestra un valor por defecto (`?? 0`, `?? 1`) como si fuera un dato.

## 4. Componentes compartidos (`lib/widgets/`)

Cada componente se implementa una sola vez y lo usan todas las pantallas, en escritorio y en celular.

| Componente | Descripción |
|---|---|
| `AppCard` | Contenedor con `surface`, borde `border` y radio `xl` |
| `SectionHeader` | Título de sección, contador opcional y link opcional a la derecha |
| `MetricBlock` | Etiqueta, valor numérico y línea secundaria opcional. Variantes de color por signo |
| `DirectionTag` | `LONG` (verde) / `SHORT` (rojo), texto en `caption` 600 sobre tint, radio `tag` |
| `StatusPill` | Variantes: `objetivo`, `stop`, `enCurso`, `pendiente`, `descartada`, `expirada`, `activa`, `desactivada`, `retirada`. Texto siempre explícito |
| `SlTpRangeBar` | Barra del stop al objetivo: tramo stop→entrada en tint rojo, entrada→objetivo en tint verde, marca gris en la entrada y punto claro en el último precio. Posiciones: `(precio − stop) / (objetivo − stop)`, invertido en SHORT. Debajo, niveles con su distancia en % |
| `SignalCard` | Símbolo, dirección, estrategia, tiempo hasta vencer, entrada, stop %, objetivo %, riesgo:premio, contexto de BTC y aviso de desplazamiento. Acciones: Descartar / Revisar y operar |
| `PositionCard` | Símbolo, dirección, estrategia, apalancamiento, modo, entrada, último precio, `SlTpRangeBar` y PnL |
| `OutcomeBlock` | Bloque "Si toca el stop / Si toca el objetivo" con monto en USDT, precio y distancia |
| `Callout` | Aviso con ícono. Variantes: `info` (`surfaceRaised`), `warning` (`warningTint`) |
| `PrimaryButton` / `SecondaryButton` / `DangerButton` | Acento sólido / contorno / contorno rojo. Estado deshabilitado con texto que explica por qué |
| `SegmentedControl` | Pestañas de temporalidad y período |
| `FilterChip` | Filtros del historial |
| `AppSwitch` | Switch con estado activo en `accent` |
| `LabeledField` | Campo con etiqueta arriba y sufijo de unidad (USDT, x) |
| `DataTimestamp` | "Datos de las HH:MM", se atenúa si los datos tienen más de 2 minutos |
| `EmptyState` / `ErrorState` | Mensaje claro y acción para reintentar o volver. `TradeDetailLoader` es el modelo actual a seguir |

### Reglas de comportamiento de componentes

- **Vencimiento de señal:** se calcula en la app desde la hora de la señal (vence a los 60 min). Se pinta en `warning` cuando quedan menos de 15 min.
- **Aviso de "llegás tarde":** si el precio recorrió 30% o más del camino al objetivo desde la señal, la tarjeta muestra un `Callout warning` con la relación riesgo:premio efectiva si se entra ahora. Es informativo; la protección real vive en el backend.
- **Margen insuficiente:** si el disponible es menor al margen por operación, el Inicio y el detalle de señal lo avisan, y el botón de operar se deshabilita con el motivo.
- **Actualización:** el Inicio vuelve a pedir datos cada 60 s mientras está visible, y tiene botón manual.

## 5. Pantallas

Orden de contenido de arriba hacia abajo. Las maquetas muestran la distribución exacta.

### Inicio
1. Balance: total, disponible, margen en uso con barra, PnL no realizado, aviso si el disponible no alcanza.
2. Posiciones abiertas (`PositionCard`).
3. Señales pendientes (`SignalCard`): 3 columnas en escritorio, apiladas en celular.
4. Actividad reciente (últimas 5).

### Detalle de señal
1. Último precio y desplazamiento desde la señal.
2. "Si operás ahora": margen, apalancamiento, nocional y `OutcomeBlock`.
3. Contexto de la señal (régimen de BTC, tendencia 4h, funding, correlación, RSI, ADX).
4. Acciones: Descartar / Operar {DIRECCIÓN} en {SÍMBOLO}. En celular, fijas abajo.
5. Un solo gráfico de velas con pestañas 15m / 4h / 1d / BTC 1d y líneas de stop, señal y objetivo.

### Detalle de posición
1. PnL no realizado, último precio y entrada.
2. `SlTpRangeBar` grande con `OutcomeBlock` desde la entrada.
3. Órdenes de protección en Binance (SL y TP con su estado).
4. Detalles: tamaño, nocional, margen, apalancamiento, modo, liquidación, funding.
5. Señal de origen y "Cerrar posición a mercado" (solo cuando exista el endpoint).

### Historial
1. Métricas: operaciones cerradas, aciertos, PnL neto (con comisiones, sin funding), profit factor (en `warning` si es menor a 1, con la explicación).
2. Filtros: Todas / Ejecutadas / Descartadas, búsqueda de activo y estrategia; período 7 días / 30 días / Todo.
3. Tabla (escritorio) o lista (celular) con resultado; las descartadas muestran su resultado simulado cuando exista.

### Configuración
1. Generar señales (switch de `isPaused`) y aviso de ejecución siempre manual.
2. Capital y riesgo: margen por operación, operaciones simultáneas, apalancamiento mín./máx. con validación (mín. ≤ máx.) y aviso calculado de cuántas operaciones entran con el balance actual.
3. Conexión con Binance: estado, tipo de clave, fecha de carga, Futuros habilitado, Retiros deshabilitados, "Reemplazar claves".
4. Notificaciones: push, Telegram, avisos en la app; nota de que las alertas críticas siempre llegan.
5. Estrategias: lista informativa de solo lectura.
6. Barra de guardado visible solo con cambios sin guardar.

### Ingreso
Estados: inicio (Continuar con Google, con el botón oficial de Google), biometría en celular (Desbloquear / Usar otra cuenta) y cuenta sin acceso (respuesta 403 de la lista de permitidos).

## 6. Dependencias de backend

| Pantalla | Qué falta |
|---|---|
| Inicio | Precio actual de los pares con señales pendientes (una llamada a `fetchTickers`) |
| Detalle de posición | Órdenes de protección (algo orders con `trigger: true`); endpoint de cierre manual |
| Historial | Apalancamiento y margen reales por operación (`trade_executions`); resultados simulados (`signal_simulated_results`) |
| Configuración | Restricciones de la API key (retiros); estado real de las estrategias |
| Ingreso | Diferenciar 403 (sin acceso) de otros errores en la app |

Hasta que cada dato exista, la pantalla muestra `—` o esconde la sección, nunca un valor de relleno.

## 7. Orden de implementación sugerido

1. Tokens (`AppColors`, `AppTextStyles`, `AppSpacing`, `AppRadius`) y tema.
2. Utilidades de formato que falten (`fmtUsd`, `fmtPct`, `fmtMissing`, `fmtDataTime`).
3. Componentes compartidos, con tests de widget de los que tienen lógica (`SlTpRangeBar`, `SignalCard`, `StatusPill`).
4. Pantallas en este orden: Inicio, Detalle de señal, Detalle de posición, Historial, Configuración, Ingreso.
5. Eliminar librerías sin uso (`candlesticks` si se confirma) y dejar un solo motor de velas (`k_chart`).
