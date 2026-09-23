import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/mobile_dashboard.dart", "utf8");

// 1. Add state variables if missing
if (!content.includes("_freeBalance")) {
    content = content.replace(
        `String _userName = 'Fondo Alpha';`,
        `String _userName = 'Fondo Alpha';
  double _freeBalance = 0.0;
  double _usedBalance = 0.0;
  List<dynamic> _signals = [];`
    );

    content = content.replace(
        `_userName = data['userName'] ?? 'Usuario';`,
        `_userName = data['userName'] ?? 'Usuario';
            _freeBalance = (data['freeBalance'] ?? 0).toDouble();
            _usedBalance = (data['usedBalance'] ?? 0).toDouble();
            _signals = data['signals'] ?? [];`
    );
}

// 2. Replace static trades block
const staticTradesBlock = `            _buildTradeCard('BTC/USDT', 'LONG 5x', '\\$64,280.00', '\\$45,000', '+\\$1,840.20', '+4.12%'),
            const SizedBox(height: 8),
            _buildTradeCard('ETH/USDT', 'LONG 3x', '\\$3,420.50', '\\$25,000', '+\\$620.80', '+2.45%'),`;

const dynamicTradesBlock = `            if (_isLoading)
              const Center(child: Padding(padding: EdgeInsets.all(24.0), child: CircularProgressIndicator(color: AppColors.brandBlue)))
            else if (_setupRequired)
              const Center(child: Padding(padding: EdgeInsets.all(24.0), child: Text('Configura tu API Key de Binance', style: TextStyle(color: AppColors.textSecondary))))
            else if (_positions.isEmpty)
              const Center(child: Padding(padding: EdgeInsets.all(24.0), child: Text('No hay operaciones activas', style: TextStyle(color: AppColors.textSecondary))))
            else
              ..._positions.map((p) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _buildTradeCard(
                  p['symbol'] ?? 'UNKNOWN',
                  '\${(p['side'] ?? '').toString().toUpperCase()} \${p['leverage'] ?? 1}x',
                  '\\$\${(p['entryPrice'] ?? 0).toStringAsFixed(2)}',
                  p['size'].toString(),
                  '\${(p['unrealizedPnl'] ?? 0) >= 0 ? '+' : ''}\\$\${(p['unrealizedPnl'] ?? 0).toStringAsFixed(2)}',
                  '\${(p['percentage'] ?? 0) >= 0 ? '+' : ''}\${(p['percentage'] ?? 0).toStringAsFixed(2)}%',
                ),
              )),`;

content = content.replace(staticTradesBlock, dynamicTradesBlock);

// Replace '2 activas' with dynamic length
content = content.replace(`_buildSectionHeader('OPERACIONES ABIERTAS', '2 activas', 'Gestionar >'),`, `_buildSectionHeader('OPERACIONES ABIERTAS', '\$_openTradesCount activas', 'Gestionar >'),`);


// 3. Replace static signals block
const staticSignalsBlock = `            _buildSignalCard('SOL', 'SOL/USDT', 'Hace 12 min', 'Breakout Volatilidad H1', 'Ejecutado', true),
            const SizedBox(height: 8),
            _buildSignalCard('AVX', 'AVAX/USDT', 'Hace 38 min', 'Media Móvil Exponencial Alpha', 'Descartado', false),
            const SizedBox(height: 8),
            _buildSignalCard('LNK', 'LINK/USDT', 'Hace 1h', 'Arbitraje Estadístico L2', 'Ejecutado', true),`;

const dynamicSignalsBlock = `            if (_isLoading)
              const Center(child: Padding(padding: EdgeInsets.all(24.0), child: CircularProgressIndicator(color: AppColors.brandBlue)))
            else if (_signals.isEmpty)
              const Center(child: Padding(padding: EdgeInsets.all(24.0), child: Text('No hay señales recientes', style: TextStyle(color: AppColors.textSecondary))))
            else
              ..._signals.map((s) {
                final date = DateTime.parse(s['evaluatedAt']);
                final diff = DateTime.now().difference(date);
                final timeAgo = diff.inMinutes < 60 ? 'Hace \${diff.inMinutes} min' : 'Hace \${diff.inHours}h';
                final symbol = (s['symbol'] ?? 'UNK').toString();
                final shortSymbol = symbol.length >= 3 ? symbol.substring(0, 3) : symbol;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _buildSignalCard(shortSymbol, symbol, timeAgo, 'Algoritmo Quant', s['direction'] ?? '', true),
                );
              }),`;

content = content.replace(staticSignalsBlock, dynamicSignalsBlock);

// 4. Update Footer Info with Margin / Coverage
const staticFooter = `            children: [
              Text('COBERTURA ', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
              Text('98.2%', style: AppTheme.monoStyle.copyWith(color: AppColors.winGreen, fontSize: 10, fontWeight: FontWeight.bold)),
            ],`;

const dynamicFooter = `            children: [
              Text('USO MARGEN ', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
              Text('\${_balance > 0 ? ((_usedBalance / _balance) * 100).toStringAsFixed(1) : 0}%', style: AppTheme.monoStyle.copyWith(color: AppColors.winGreen, fontSize: 10, fontWeight: FontWeight.bold)),
            ],`;

content = content.replace(staticFooter, dynamicFooter);

// Update TradeCard color bindings
content = content.replace(
    `Text(pnl, style: AppTheme.monoStyle.copyWith(color: AppColors.winGreen, fontWeight: FontWeight.bold, fontSize: 14)),`,
    `Text(pnl, style: AppTheme.monoStyle.copyWith(color: pnl.startsWith('-') ? AppColors.lossRed : AppColors.winGreen, fontWeight: FontWeight.bold, fontSize: 14)),`
);
content = content.replace(
    `const Icon(Icons.show_chart, color: AppColors.winGreen, size: 12),`,
    `Icon(pnlPct.startsWith('-') ? Icons.trending_down : Icons.trending_up, color: pnlPct.startsWith('-') ? AppColors.lossRed : AppColors.winGreen, size: 12),`
);
content = content.replace(
    `Text(pnlPct, style: AppTheme.monoStyle.copyWith(color: AppColors.winGreen, fontSize: 11)),`,
    `Text(pnlPct, style: AppTheme.monoStyle.copyWith(color: pnlPct.startsWith('-') ? AppColors.lossRed : AppColors.winGreen, fontSize: 11)),`
);


fs.writeFileSync("app/lib/screens/dashboard/mobile_dashboard.dart", content);
