import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";

async function run() {
  const allSignals = await db.query.signalHistory.findMany({
    orderBy: (history, { desc }) => [desc(history.evaluatedAt)]
  });

  // Filtrar las del "día anterior" (aproximadamente desde hace 24-30 horas)
  // El usuario está a las 08:20 del 17 de septiembre.
  // Filtramos las señales que ocurrieron entre el 16 de septiembre a las 00:00 y las 23:59 UTC-3.
  const startOfDay = new Date("2026-09-16T03:00:00Z"); // 00:00 UTC-3
  const endOfDay = new Date("2026-09-17T03:00:00Z");   // 23:59 UTC-3

  const signalsYesterday = allSignals.filter(s => s.evaluatedAt >= startOfDay && s.evaluatedAt <= endOfDay);

  console.log(`Señales del día 16 de Septiembre: ${signalsYesterday.length}`);
  
  // Imprimir detalles para analizarlas
  for (const s of signalsYesterday.reverse()) { // Reverse to get chronological order
    if (!s.decision || s.decision === "Ninguna") continue; // Ignorar las que no se tocaron
    console.log(`[${s.evaluatedAt.toISOString()}] ${s.symbol} | Dir: ${s.direction} | Dec: ${s.decision} | Rsn: ${s.reason} | FR: ${s.fundingRate}`);
  }
}

run().then(() => process.exit(0));
