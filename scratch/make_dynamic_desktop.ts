import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/desktop_dashboard.dart", "utf8");

// 1. Add state variables
content = content.replace(
    `String _userName = 'Fondo Alpha';`,
    `String _userName = 'Fondo Alpha';
  double _freeBalance = 0.0;
  double _usedBalance = 0.0;
  List<dynamic> _signals = [];`
);

// 2. Extract from JSON
content = content.replace(
    `_userName = data['userName'] ?? 'Usuario';`,
    `_userName = data['userName'] ?? 'Usuario';
            _freeBalance = (data['freeBalance'] ?? 0).toDouble();
            _usedBalance = (data['usedBalance'] ?? 0).toDouble();
            _signals = data['signals'] ?? [];`
);

// 3. Make Liquidez and Margen Utilizado dynamic
content = content.replace(
    `Text('\\$412,890.12 USDT (33.1%)', style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary)),`,
    `Text('\\$\${_freeBalance.toStringAsFixed(2)} USDT (\${_balance > 0 ? ((_freeBalance / _balance) * 100).toStringAsFixed(1) : 0}%)', style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary)),`
);
content = content.replace(
    `Text('\\$832,350.38 USDT (66.9%)', style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary)),`,
    `Text('\\$\${_usedBalance.toStringAsFixed(2)} USDT (\${_balance > 0 ? ((_usedBalance / _balance) * 100).toStringAsFixed(1) : 0}%)', style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary)),`
);

// 4. Make Signals section dynamic
const staticSignalsBlock = `          _signalRow('Señal Breakout Volatilidad en SOL/USDT', 'Volumen relativo 2.8x • Algoritmo V-Delta', '12 min'),
          const SizedBox(height: 16),
          _signalRow('Cruce Algorítmico EMA en BTC/USDT', 'Frecuencia 15M • Slippage 0.01%', '45 min'),`;

const dynamicSignalsBlock = `          if (_isLoading)
            const Center(child: Padding(padding: EdgeInsets.all(24.0), child: CircularProgressIndicator(color: AppColors.brandBlue)))
          else if (_signals.isEmpty)
            Center(child: Padding(padding: const EdgeInsets.all(24.0), child: Text('No hay señales recientes', style: TextStyle(color: AppColors.textSecondary))))
          else
            ..._signals.map((s) {
              final date = DateTime.parse(s['evaluatedAt']);
              final diff = DateTime.now().difference(date);
              final timeAgo = diff.inMinutes < 60 ? '\${diff.inMinutes} min' : '\${diff.inHours}h';
              final dir = s['direction'] ?? '';
              return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: _signalRow('Señal \$dir en \${s['symbol']}', 'Algoritmo Quant', timeAgo),
              );
            }),`;

content = content.replace(staticSignalsBlock, dynamicSignalsBlock);

fs.writeFileSync("app/lib/screens/dashboard/desktop_dashboard.dart", content);
