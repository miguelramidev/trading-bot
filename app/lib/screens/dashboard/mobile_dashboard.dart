import 'package:go_router/go_router.dart';
import 'settings_screen.dart';
import '../signals/signal_detail_screen.dart';
import '../dashboard_screen.dart';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../../core/network/api_client.dart';

import 'package:firebase_auth/firebase_auth.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../services/auth_service.dart';
import '../login_screen.dart';

class MobileDashboard extends StatefulWidget {
  const MobileDashboard({super.key});

  @override
  State<MobileDashboard> createState() => _MobileDashboardState();
}

class _MobileDashboardState extends State<MobileDashboard> {
  bool _isLoading = true;
  bool _setupRequired = false;
  double _balance = 0.0;
  double _unrealizedPnl = 0.0;
  double _pnlPercent = 0.0;
  int _openTradesCount = 0;
  List<dynamic> _positions = [];
  String _userName = 'Fondo Alpha';
  double _freeBalance = 0.0;
  double _usedBalance = 0.0;
  List<dynamic> _signals = [];
  List<dynamic> _chartData = [];

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
      final response = await ApiClient.get('/api/dashboard');

      final data = jsonDecode(response.body);
      if (response.statusCode == 200 || response.statusCode == 500) {
        if (data['status'] == 'setup_required' || data['status'] == 'error' || response.statusCode == 500) {
          setState(() {
            _setupRequired = true;
            _isLoading = false;
          });
          _showSetupModal(data['message'] ?? 'API Key inválida o sin configurar. Por favor, actualiza tus credenciales.');
        } else {
          setState(() {
            _setupRequired = false;
            _balance = (data['balance'] ?? 0).toDouble();
            _unrealizedPnl = (data['unrealizedPnl'] ?? 0).toDouble();
            _pnlPercent = (data['unrealizedPnlPercent'] ?? 0).toDouble();
            _openTradesCount = data['openTrades'] ?? 0;
            _positions = data['positions'] ?? [];
            _userName = data['userName'] ?? 'Usuario';
            _freeBalance = (data['freeBalance'] ?? 0).toDouble();
            _usedBalance = (data['usedBalance'] ?? 0).toDouble();
            _signals = data['signals'] ?? [];
            _chartData = data['chartData'] ?? [];
            _isLoading = false;
          });
        }
      } else {
        if (mounted) setState(() => _isLoading = false);
        _showSetupModal('Error de conexión o credenciales inválidas.');
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }



  void _showSetupModal(String message) {
    if (!mounted) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return WillPopScope(
          onWillPop: () async => false, // Evita cerrar con el botón atrás
          child: AlertDialog(
            backgroundColor: const Color(0xFF1E2025), // AppColors.surface
            title: Row(
              children: [
                const Icon(Icons.warning_amber_rounded, color: Colors.orange),
                const SizedBox(width: 8),
                const Text('Credenciales Inválidas', style: TextStyle(color: Colors.white, fontSize: 18)),
              ],
            ),
            content: Text(
              message,
              style: const TextStyle(color: Colors.white70),
            ),
            actions: [
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF22C55E), // AppColors.winGreen
                  foregroundColor: Colors.white,
                ),
                onPressed: () {
                  Navigator.of(context).pop();
                  context.go('/settings');
                },
                child: const Text('Ir a Ajustes'),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: _buildAppBar(context),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildBalanceCard(context),
            _buildPerformanceChart(),
            const SizedBox(height: 24),
            _buildSectionHeader('OPERACIONES ABIERTAS', '$_openTradesCount activas', 'Gestionar >'),
            const SizedBox(height: 12),
            if (_isLoading)
              const Center(child: Padding(padding: EdgeInsets.all(24.0), child: CircularProgressIndicator(color: AppColors.winGreen)))
            else if (_setupRequired)
              const Center(child: Padding(padding: EdgeInsets.all(24.0), child: Text('Configura tu API Key de Binance', style: TextStyle(color: AppColors.textSecondary))))
            else if (_positions.isEmpty)
              const Center(child: Padding(padding: EdgeInsets.all(24.0), child: Text('No hay operaciones activas', style: TextStyle(color: AppColors.textSecondary))))
            else
              ..._positions.map((p) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _buildTradeCard(
                  p['symbol'] ?? 'UNKNOWN',
                  "${p['side']?.toString().toUpperCase() ?? ''} ${p['leverage'] ?? 1}x",
                  "\$${(p['entryPrice'] ?? 0).toStringAsFixed(2)}",
                  p['size'].toString(),
                  "${(p['unrealizedPnl'] ?? 0) >= 0 ? '+' : ''}\$${(p['unrealizedPnl'] ?? 0).toStringAsFixed(2)}",
                  "${(p['percentage'] ?? 0) >= 0 ? '+' : ''}${(p['percentage'] ?? 0).toStringAsFixed(2)}%",
                  onTap: () => context.go('/dashboard/trade/${(p["symbol"]?.toString() ?? "UNKNOWN").replaceAll("/", "-")}', extra: p),
                ),
              )),
            const SizedBox(height: 32),
            _buildSectionHeader('ÚLTIMAS SEÑALES CUANTITATIVAS', null, 'Ver todas >'),
            const SizedBox(height: 12),
            if (_isLoading)
              const Center(child: Padding(padding: EdgeInsets.all(24.0), child: CircularProgressIndicator(color: AppColors.winGreen)))
            else if (_signals.isEmpty)
              const Center(child: Padding(padding: EdgeInsets.all(24.0), child: Text('No hay señales recientes', style: TextStyle(color: AppColors.textSecondary))))
            else
              ..._signals.map((s) {
                final date = DateTime.parse(s['evaluatedAt']);
                final diff = DateTime.now().difference(date);
                final timeAgo = diff.inMinutes < 60 ? 'Hace ${diff.inMinutes} min' : 'Hace ${diff.inHours}h';
                final symbol = (s['symbol'] ?? 'UNK').toString();
                final shortSymbol = symbol.length >= 3 ? symbol.substring(0, 3) : symbol;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _buildSignalCard(shortSymbol, symbol, timeAgo, 'Algoritmo Quant', s['direction'] ?? '', true, onTap: () async { await context.push('/dashboard/signal/${s['id']}', extra: s); _fetchDashboardData(); }),
                );
              }),
            const SizedBox(height: 24),
            _buildFooterInfo(),
          ],
        ),
      ),
      
    );
  }

  AppBar _buildAppBar(BuildContext context) {
    return AppBar(
      backgroundColor: AppColors.background,
      elevation: 0,
      titleSpacing: 0,
      leading: const Icon(Icons.shield_outlined, color: AppColors.winGreen),
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('MacroQuant', style: Theme.of(context).textTheme.displaySmall?.copyWith(fontSize: 18)),
          Row(
            children: [
              Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
              const SizedBox(width: 4),
              Text('ZÚRICH CLUSTER L2 • 0.38 MS', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 0.5)),
            ],
          )
        ],
      ),
      actions: [
        IconButton(icon: const Icon(Icons.help_outline, color: AppColors.textSecondary, size: 20), onPressed: () {}),
        GestureDetector(
          onTap: () => _logout(context),
          child: Container(
            margin: const EdgeInsets.only(right: 16),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: AppColors.surface, shape: BoxShape.circle),
            child: const Text('MQ', style: TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.bold)),
          ),
        ),
      ],
    );
  }


  Widget _buildPerformanceChart() {
    return Container(
      height: 180,
      margin: const EdgeInsets.only(top: 24),
      padding: const EdgeInsets.only(top: 24, right: 24, bottom: 12, left: 12),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: _chartData.isEmpty 
        ? const Center(child: CircularProgressIndicator(color: AppColors.winGreen))
        : Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: LineChart(
                  LineChartData(
                    gridData: FlGridData(show: false),
                    borderData: FlBorderData(show: false),
                    titlesData: FlTitlesData(
                      show: true,
                      rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      leftTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          reservedSize: 40,
                          getTitlesWidget: (value, meta) {
                            return Text('\$' + value.toInt().toString(), style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10));
                          },
                        ),
                      ),
                    ),
                    lineBarsData: [
                      LineChartBarData(
                        spots: _chartData.asMap().entries.map((e) {
                          return FlSpot(e.key.toDouble(), (e.value['balance'] ?? 0).toDouble());
                        }).toList(),
                        isCurved: true,
                        color: AppColors.winGreen,
                        barWidth: 2,
                        isStrokeCapRound: true,
                        dotData: FlDotData(show: false),
                        belowBarData: BarAreaData(
                          show: true,
                          color: AppColors.winGreen.withValues(alpha: 0.1),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text('Progreso Diario', textAlign: TextAlign.center, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
            ],
          ),
    );
  }

  Widget _buildBalanceCard(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('BALANCE TOTAL', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 11)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: AppColors.winGreen.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
                child: Row(
                  children: [
                    Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
                    const SizedBox(width: 4),
                    Text('STREAMING L1', style: AppTheme.monoStyle.copyWith(color: AppColors.winGreen, fontSize: 10)),
                  ],
                ),
              )
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('\$', style: Theme.of(context).textTheme.displayLarge?.copyWith(fontSize: 24, color: AppColors.textSecondary)),
              const SizedBox(width: 4),
              Text('${(_balance).toStringAsFixed(0).replaceAll(RegExp(r'\B(?=(\d{3})+(?!\d))'), ',')}', style: Theme.of(context).textTheme.displayLarge?.copyWith(fontSize: 32)),
              Text('.${(_balance.toStringAsFixed(2).split('.')[1])} USD', style: AppTheme.monoStyle.copyWith(fontSize: 14, color: AppColors.textSecondary, height: 2)),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(color: AppColors.winGreen.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.arrow_outward, color: AppColors.winGreen, size: 14),
                const SizedBox(width: 4),
                Text('${_unrealizedPnl >= 0 ? '+' : ''}${_unrealizedPnl.toStringAsFixed(2)} (${_pnlPercent >= 0 ? '+' : ''}${_pnlPercent.toStringAsFixed(2)}%)', style: AppTheme.monoStyle.copyWith(color: _unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed, fontSize: 12, fontWeight: FontWeight.bold)),
                const SizedBox(width: 6),
                Text('PnL Abierto hoy', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('HORIZONTE', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 11)),
              InkWell(
                onTap: () {
                  setState(() {
                    _isLoading = true;
                  });
                  _fetchDashboardData();
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.sync, color: AppColors.winGreen, size: 14),
                      const SizedBox(width: 6),
                      Text('Sincronizar', style: AppTheme.monoStyle.copyWith(color: AppColors.winGreen, fontSize: 12)),
                    ],
                  ),
                ),
              )
            ],
          )
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, String? tag, String action) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: [
            Text(title, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.bold)),
            if (tag != null) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: AppColors.winGreen.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
                child: Text(tag, style: AppTheme.monoStyle.copyWith(color: AppColors.winGreen, fontSize: 10)),
              )
            ]
          ],
        ),
        Text(action, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 11)),
      ],
    );
  }

  Widget _buildTradeCard(String pair, String side, String entry, String size, String pnl, String pnlPct, {VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(8)),
            child: const Icon(Icons.currency_bitcoin, color: Colors.orange, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(pair, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold)),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: AppColors.winGreen.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
                      child: Text(side, style: AppTheme.monoStyle.copyWith(color: AppColors.winGreen, fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text('Entrada: ', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                    Text(entry, style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 12)),
                    const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('•', style: TextStyle(color: AppColors.textSecondary))),
                    Text('Tamaño: ', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                    Text(size, style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 12)),
                  ],
                )
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(pnl, style: AppTheme.monoStyle.copyWith(color: pnl.contains('-') ? AppColors.lossRed : AppColors.winGreen, fontWeight: FontWeight.bold, fontSize: 14)),
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(pnlPct.contains('-') ? Icons.trending_down : Icons.trending_up, color: pnlPct.contains('-') ? AppColors.lossRed : AppColors.winGreen, size: 12),
                  const SizedBox(width: 4),
                  Text(pnlPct, style: AppTheme.monoStyle.copyWith(color: pnlPct.contains('-') ? AppColors.lossRed : AppColors.winGreen, fontSize: 11)),
                ],
              )
            ],
          )
        ],
      ),
      ),
    );
  }

  Widget _buildSignalCard(String avatarTxt, String title, String time, String desc, String status, bool isSuccess, {VoidCallback? onTap}) {
    final color = isSuccess ? AppColors.winGreen : AppColors.textSecondary;
    return GestureDetector(
      onTap: onTap,
      child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(8)),
            alignment: Alignment.center,
            child: Text(avatarTxt, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(title, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold, fontSize: 13)),
                    const Padding(padding: EdgeInsets.symmetric(horizontal: 6), child: Text('•', style: TextStyle(color: AppColors.textSecondary, fontSize: 10))),
                    Text(time, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
                  ],
                ),
                const SizedBox(height: 4),
                Text(desc, style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: [
                Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
                const SizedBox(width: 4),
                Text(status, style: AppTheme.monoStyle.copyWith(color: color, fontSize: 10)),
              ],
            ),
          )
        ],
      ),
      ),
    );
  }

  Widget _buildFooterInfo() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12)),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              const Icon(Icons.lock_outline, color: AppColors.winGreen, size: 16),
              const SizedBox(width: 8),
              Text('RIESGO VAR 99% 1D: ', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
              Text('0.84%', style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
          Row(
            children: [
              Text('USO MARGEN ', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
              Text('${_balance > 0 ? ((_usedBalance / _balance) * 100).toStringAsFixed(1) : 0}%', style: AppTheme.monoStyle.copyWith(color: AppColors.winGreen, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          )
        ],
      ),
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    return BottomNavigationBar(
      backgroundColor: AppColors.background,
      selectedItemColor: AppColors.winGreen,
      unselectedItemColor: AppColors.textSecondary,
      onTap: (index) {
        if (index == 0) {
          Navigator.pushReplacementNamed(context, '/dashboard');
        } else if (index == 2) {
          Navigator.pushReplacementNamed(context, '/settings');
        }
      },
      items: const [
        BottomNavigationBarItem(icon: Icon(Icons.grid_view), label: 'Inicio'),
        BottomNavigationBarItem(icon: Icon(Icons.receipt_long), label: 'Historial'),
        BottomNavigationBarItem(icon: Icon(Icons.tune), label: 'Ajustes'),
      ],
    );
  }

  Future<void> _logout(BuildContext context) async {
    await AuthService().signOut();
    if (context.mounted) {
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (context) => const LoginScreen()));
    }
  }
}





