import { Trader } from "../src/bot/trader.js";

export async function getTradeRealizedPnl(symbol: string, sinceMs: number): Promise<{ pnl: number, fee: number }> {
    const trader = new Trader();
    const trades = await trader.exchange.fetchMyTrades(symbol.replace(":USDT", ""), sinceMs, 100);
    let totalPnl = 0;
    let totalFee = 0;
    for (const t of trades) {
        if (t.info && t.info.realizedPnl) {
            totalPnl += parseFloat(t.info.realizedPnl);
        }
        if (t.fee && t.fee.cost) {
            totalFee += t.fee.cost;
        }
    }
    return { pnl: totalPnl, fee: totalFee };
}
