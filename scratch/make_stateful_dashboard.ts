import fs from "fs";

function transformDashboard(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");

    // Add http import
    if (!content.includes("import 'package:http/http.dart'")) {
        content = content.replace("import 'package:flutter/material.dart';", "import 'package:flutter/material.dart';\nimport 'package:http/http.dart' as http;\nimport 'dart:convert';");
    }

    // Convert StatelessWidget to StatefulWidget
    content = content.replace(/class (DesktopDashboard|MobileDashboard) extends StatelessWidget \{/g, `class $1 extends StatefulWidget {`);
    content = content.replace(/const (DesktopDashboard|MobileDashboard)\(\{super\.key\}\);/g, `const $1({super.key});\n\n  @override\n  State<$1> createState() => _$1State();\n}\n\nclass _$1State extends State<$1> {`);

    // Add state variables and initState
    const stateVars = `
  bool _isLoading = true;
  bool _setupRequired = false;
  double _balance = 0.0;
  double _unrealizedPnl = 0.0;
  double _pnlPercent = 0.0;
  int _openTradesCount = 0;
  List<dynamic> _positions = [];
  String _userName = 'Fondo Alpha';

  @override
  void initState() {
    super.initState();
    _fetchDashboardData();
  }

  Future<void> _fetchDashboardData() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      if (mounted) setState(() => _isLoading = false);
      return;
    }

    try {
      final response = await http.get(
        Uri.parse('https://d283s0b41l.execute-api.ca-central-1.amazonaws.com/api/dashboard'),
        headers: {'Authorization': 'Bearer \${user.uid}'},
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['status'] == 'setup_required') {
          setState(() {
            _setupRequired = true;
            _isLoading = false;
          });
        } else {
          setState(() {
            _setupRequired = false;
            _balance = (data['balance'] ?? 0).toDouble();
            _unrealizedPnl = (data['unrealizedPnl'] ?? 0).toDouble();
            _pnlPercent = (data['unrealizedPnlPercent'] ?? 0).toDouble();
            _openTradesCount = data['openTrades'] ?? 0;
            _positions = data['positions'] ?? [];
            _userName = data['userName'] ?? 'Usuario';
            _isLoading = false;
          });
        }
      } else {
        if (mounted) setState(() => _isLoading = false);
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }
`;

    content = content.replace(/class _(DesktopDashboard|MobileDashboard)State extends State<(DesktopDashboard|MobileDashboard)> \{/g, `class _$1State extends State<$2> {` + stateVars);

    // Replace the hardcoded Hero Section values
    content = content.replace(/Text\('Bienvenido de nuevo, Fondo Alpha'/g, `Text('Bienvenido de nuevo, \$_userName'`);
    
    // Balance
    content = content.replace(/Text\('1,245,240'/g, `Text('\${(_balance).toStringAsFixed(0).replaceAll(RegExp(r'\\B(?=(\\d{3})+(?!\\d))'), ',')}'`);
    content = content.replace(/Text\('\.50 USDT'/g, `Text('.\${(_balance.toStringAsFixed(2).split('.')[1])} USDT'`);
    
    // PnL Box
    content = content.replace(/Text\('\+\\$45,210\.80 \(\+3\.77\%\) PnL ACTIVO'/g, `Text('\${_unrealizedPnl >= 0 ? '+' : ''}\$\${_unrealizedPnl.toStringAsFixed(2)} (\${_pnlPercent >= 0 ? '+' : ''}\${_pnlPercent.toStringAsFixed(2)}%) PnL ACTIVO'`);
    
    // PnL Box colors based on profit/loss
    content = content.replace(/decoration: BoxDecoration\(color: AppColors\.winGreen\.withOpacity\(0\.1\), borderRadius: BorderRadius\.circular\(20\), border: Border\.all\(color: AppColors\.winGreen\.withOpacity\(0\.3\)\)\),/g, 
      `decoration: BoxDecoration(color: (_unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: (_unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.3))),`);
    content = content.replace(/style: AppTheme\.monoStyle\.copyWith\(color: AppColors\.winGreen, fontSize: 12, fontWeight: FontWeight\.bold\)\),/g,
      `style: AppTheme.monoStyle.copyWith(color: _unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed, fontSize: 12, fontWeight: FontWeight.bold)),`);

    // Add Loading overlay / logic if needed. Or just replace the open trades text
    content = content.replace(/Text\('3 activas'/g, `Text('\$_openTradesCount activas'`);

    // Replace _tradeRow calls with dynamic positions mapped
    // Note: this is a bit trickier, I'll just clear the hardcoded _tradeRow and build from _positions.
    const hardcodedTradesRegex = /_tradeRow\('BTC\/USDT', 'LONG 5x', '\\$45,000\.00', '\+\\$1,840\.20', '\+4\.12\%'\),[\s\S]*?const Divider\(color: AppColors\.border, height: 32\),/g;
    
    const dynamicTrades = `
          if (_isLoading)
            const Center(child: Padding(padding: EdgeInsets.all(24.0), child: CircularProgressIndicator(color: AppColors.brandBlue)))
          else if (_setupRequired)
            Center(child: Padding(padding: const EdgeInsets.all(24.0), child: Text('Configura tu API Key de Binance para ver tus operaciones', style: TextStyle(color: AppColors.textSecondary))))
          else if (_positions.isEmpty)
            Center(child: Padding(padding: const EdgeInsets.all(24.0), child: Text('No hay operaciones activas', style: TextStyle(color: AppColors.textSecondary))))
          else
            ..._positions.map((p) => Column(
              children: [
                _tradeRow(
                  p['symbol'] ?? 'UNKNOWN',
                  '\${(p['side'] ?? '').toString().toUpperCase()} \${p['leverage'] ?? 1}x',
                  '\$\${(p['entryPrice'] ?? 0).toStringAsFixed(2)}',
                  '\${(p['unrealizedPnl'] ?? 0) >= 0 ? '+' : ''}\$\${(p['unrealizedPnl'] ?? 0).toStringAsFixed(2)}',
                  '\${(p['percentage'] ?? 0) >= 0 ? '+' : ''}\${(p['percentage'] ?? 0).toStringAsFixed(2)}%',
                ),
                const Divider(color: AppColors.border, height: 32),
              ],
            )),
    `;

    content = content.replace(hardcodedTradesRegex, dynamicTrades);

    // Dynamic _tradeRow colors for PnL
    content = content.replace(/Text\(pnl, style: AppTheme\.monoStyle\.copyWith\(color: AppColors\.winGreen, fontWeight: FontWeight\.bold\)\),/g,
      `Text(pnl, style: AppTheme.monoStyle.copyWith(color: pnl.startsWith('-') ? AppColors.lossRed : AppColors.winGreen, fontWeight: FontWeight.bold)),`);
    content = content.replace(/Container\(\s*padding: const EdgeInsets\.symmetric\(horizontal: 8, vertical: 4\),\s*decoration: BoxDecoration\(color: AppColors\.winGreen\.withOpacity\(0\.1\), borderRadius: BorderRadius\.circular\(4\)\),\s*child: Text\(pnlPct, style: AppTheme\.monoStyle\.copyWith\(color: AppColors\.winGreen, fontSize: 10\)\),\s*\),/g,
      `Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: (pnlPct.startsWith('-') ? AppColors.lossRed : AppColors.winGreen).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4)),
                child: Text(pnlPct, style: AppTheme.monoStyle.copyWith(color: pnlPct.startsWith('-') ? AppColors.lossRed : AppColors.winGreen, fontSize: 10)),
              ),`);


    fs.writeFileSync(filePath, content);
}

transformDashboard("app/lib/screens/dashboard/desktop_dashboard.dart");
transformDashboard("app/lib/screens/dashboard/mobile_dashboard.dart");

