import re

def fix():
    with open("app/lib/screens/dashboard/desktop_dashboard.dart", "r") as f:
        content = f.read()

    # 1. Fix PnL Activo
    content = re.sub(
        r"Text\('\+\$45,210\.80 \(\+3\.77\%\) PnL ACTIVO'[^)]*\)",
        "Text('${_unrealizedPnl >= 0 ? '+' : ''}\\$${_unrealizedPnl.toStringAsFixed(2)} (${_pnlPercent >= 0 ? '+' : ''}${_pnlPercent.toStringAsFixed(2)}%) PnL ACTIVO', style: AppTheme.monoStyle.copyWith(color: _unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed, fontSize: 12, fontWeight: FontWeight.bold))",
        content
    )

    # 2. Fix Escaping issues
    content = content.replace(
        "Text('\\${_freeBalance.toStringAsFixed(2)}",
        "Text('\\$${_freeBalance.toStringAsFixed(2)}"
    )
    content = content.replace(
        "Text('\\${_usedBalance.toStringAsFixed(2)}",
        "Text('\\$${_usedBalance.toStringAsFixed(2)}"
    )

    # 3. Fix Headers
    content = content.replace(
        "Text('Operaciones Abiertas', style: Theme.of(context).textTheme.displaySmall?.copyWith(fontSize: 20))",
        "Text('Operaciones Abiertas', style: const TextStyle(color: AppColors.textPrimary, fontSize: 20, fontWeight: FontWeight.bold))"
    )
    content = content.replace(
        "Text('Últimas Señales Cuantitativas', style: Theme.of(context).textTheme.displaySmall?.copyWith(fontSize: 20))",
        "Text('Últimas Señales Cuantitativas', style: const TextStyle(color: AppColors.textPrimary, fontSize: 20, fontWeight: FontWeight.bold))"
    )

    # 4. Fix Trades
    hardcoded = """          _tradeRow('BTC/USDT', 'LONG 5x', '\\$45,000.00', '+\\$1,840.20', '+4.12%'),
          const Divider(color: AppColors.border, height: 32),
          _tradeRow('ETH/USDT', 'LONG 5x', '\\$25,000.00', '+\\$620.80', '+2.45%'),
          const Divider(color: AppColors.border, height: 32),
          _tradeRow('SOL/USDT', 'SHORT 2x', '\\$18,500.00', '+\\$312.40', '+1.68%'),"""
    
    dynamic_trades = """          if (_isLoading)
            const Center(child: Padding(padding: EdgeInsets.all(24.0), child: CircularProgressIndicator(color: AppColors.winGreen)))
          else if (_setupRequired)
            const Center(child: Padding(padding: EdgeInsets.all(24.0), child: Text('Configura tu API Key de Binance para ver tus operaciones', style: TextStyle(color: AppColors.textSecondary))))
          else if (_positions.isEmpty)
            const Center(child: Padding(padding: EdgeInsets.all(24.0), child: Text('No hay operaciones activas', style: TextStyle(color: AppColors.textSecondary))))
          else
            ..._positions.map((p) => Column(
              children: [
                _tradeRow(
                  p['symbol'] ?? 'UNKNOWN',
                  "${p['side']?.toString().toUpperCase() ?? ''} ${p['leverage'] ?? 1}x",
                  "\\$${(p['entryPrice'] ?? 0).toStringAsFixed(2)}",
                  "${(p['unrealizedPnl'] ?? 0) >= 0 ? '+' : ''}\\$${(p['unrealizedPnl'] ?? 0).toStringAsFixed(2)}",
                  "${(p['percentage'] ?? 0) >= 0 ? '+' : ''}${(p['percentage'] ?? 0).toStringAsFixed(2)}%",
                ),
                const Divider(color: AppColors.border, height: 32),
              ],
            )),"""
            
    content = content.replace(hardcoded, dynamic_trades)
    
    with open("app/lib/screens/dashboard/desktop_dashboard.dart", "w") as f:
        f.write(content)

fix()
