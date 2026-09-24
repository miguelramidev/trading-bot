import 'settings_screen.dart';
import '../dashboard_screen.dart';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../signals/signal_detail_screen.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../services/auth_service.dart';
import '../login_screen.dart';

class DesktopDashboard extends StatefulWidget {
  const DesktopDashboard({super.key});

  @override
  State<DesktopDashboard> createState() => _DesktopDashboardState();
}

class _DesktopDashboardState extends State<DesktopDashboard> {
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
      final response = await http.get(
        Uri.parse('https://d283s0b41l.execute-api.ca-central-1.amazonaws.com/api/dashboard'),
        headers: {'Authorization': 'Bearer ${user.uid}'},
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
            _freeBalance = (data['freeBalance'] ?? 0).toDouble();
            _usedBalance = (data['usedBalance'] ?? 0).toDouble();
            _signals = data['signals'] ?? [];
            _chartData = data['chartData'] ?? [];
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


  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Row(
        children: [
          _buildSidebar(context),
          Expanded(
            child: Column(
              children: [
                _buildTopBar(context),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(32.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildHeroSection(context),
                        const SizedBox(height: 32),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(flex: 3, child: _buildOpenTrades(context)),
                            const SizedBox(width: 24),
                            Expanded(flex: 2, child: _buildSignals(context)),
                          ],
                        )
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSidebar(BuildContext context) {
    return Container(
      width: 80,
      color: AppColors.surface,
      child: Column(
        children: [
          const SizedBox(height: 32),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.winGreen.withOpacity(0.1), shape: BoxShape.circle),
            child: const Text('M', style: TextStyle(color: AppColors.winGreen, fontSize: 20, fontWeight: FontWeight.bold)),
          ),
          const SizedBox(height: 8),
          Text('QUANT', style: AppTheme.monoStyle.copyWith(color: AppColors.winGreen, fontSize: 9, fontWeight: FontWeight.bold)),
          const SizedBox(height: 48),
          GestureDetector(onTap: () => Navigator.pushReplacementNamed(context, '/dashboard'), child: _sidebarIcon(Icons.grid_view, 'INICIO', true)),
          const SizedBox(height: 32),
          _sidebarIcon(Icons.show_chart, 'HISTORIAL', false),
          const SizedBox(height: 32),
          GestureDetector(onTap: () => Navigator.pushReplacementNamed(context, '/settings'), child: _sidebarIcon(Icons.tune, 'CONFIGURACIÓN', false)),
          const Spacer(),
          const Icon(Icons.headphones_outlined, color: AppColors.textSecondary),
          const SizedBox(height: 32),
          IconButton(
            icon: const Icon(Icons.logout, color: AppColors.textSecondary),
            onPressed: () => _logout(context),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _sidebarIcon(IconData icon, String label, bool isActive) {
    final color = isActive ? AppColors.winGreen : AppColors.textSecondary;
    return Column(
      children: [
        Icon(icon, color: color),
        const SizedBox(height: 8),
        Text(label, style: AppTheme.monoStyle.copyWith(color: color, fontSize: 9)),
      ],
    );
  }

  Widget _buildTopBar(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.border, width: 1)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Text('MacroQuant Ejecutivo', style: const TextStyle(color: AppColors.textPrimary, fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(width: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
                child: Text('TERMINAL PRO', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
              ),
              const SizedBox(width: 24),
              Row(
                children: [
                  Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  Text('Mercados en vivo • Conexión FIX 4.4', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 11)),
                ],
              )
            ],
          ),
          Row(
            children: [
              const Icon(Icons.notifications_none, color: AppColors.textSecondary),
              const SizedBox(width: 16),
              const Icon(Icons.wifi, color: AppColors.textSecondary),
              const SizedBox(width: 24),
              OutlinedButton(
                onPressed: () {},
                style: OutlinedButton.styleFrom(side: const BorderSide(color: AppColors.border)),
                child: Text('Rebalancear', style: TextStyle(color: AppColors.textPrimary)),
              ),
              const SizedBox(width: 16),
              ElevatedButton(
                onPressed: () {},
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.winGreen),
                child: const Text('Ejecutar Orden', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
              ),
            ],
          )
        ],
      ),
    );
  }

  Widget _buildHeroSection(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 3,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('Bienvenido de nuevo, $_userName', style: Theme.of(context).textTheme.displayLarge?.copyWith(fontSize: 28)),
                  const SizedBox(width: 8),
                  const Icon(Icons.verified, color: AppColors.winGreen, size: 20),
                ],
              ),
              const SizedBox(height: 8),
              Text('Protocolo Institucional Multi-Estrategia • Cuadro de Mando en Tiempo Real', style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
              const SizedBox(height: 32),
              Row(
                children: [
                  Text('VALOR NETO DEL FONDO • BALANCE CONSOLIDADO', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 11)),
                  const SizedBox(width: 16),
                  _buildHorizonTabs(),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('\$', style: Theme.of(context).textTheme.displayLarge?.copyWith(fontSize: 32, color: AppColors.textSecondary)),
                  const SizedBox(width: 4),
                  Text('${(_balance).toStringAsFixed(0).replaceAll(RegExp(r'\B(?=(\d{3})+(?!\d))'), ',')}', style: Theme.of(context).textTheme.displayLarge?.copyWith(fontSize: 48)),
                  Text('.${(_balance.toStringAsFixed(2).split('.')[1])} USDT', style: AppTheme.monoStyle.copyWith(fontSize: 16, color: AppColors.textSecondary, height: 2.5)),
                  const SizedBox(width: 24),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(color: (_unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: (_unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.3))),
                    child: Text('${_unrealizedPnl >= 0 ? '+' : ''}\$${_unrealizedPnl.toStringAsFixed(2)} (${_pnlPercent >= 0 ? '+' : ''}${_pnlPercent.toStringAsFixed(2)}%) PnL ACTIVO', style: AppTheme.monoStyle.copyWith(color: _unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed, fontSize: 12, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Text('Liquidez Disponible: ', style: TextStyle(color: AppColors.textSecondary)),
                  Text('\$${_freeBalance.toStringAsFixed(2)} USDT (${_balance > 0 ? ((_freeBalance / _balance) * 100).toStringAsFixed(1) : 0}%)', style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary)),
                  const Padding(padding: EdgeInsets.symmetric(horizontal: 16), child: Text('•', style: TextStyle(color: AppColors.border))),
                  Text('Margen Utilizado: ', style: TextStyle(color: AppColors.textSecondary)),
                  Text('\$${_usedBalance.toStringAsFixed(2)} USDT (${_balance > 0 ? ((_usedBalance / _balance) * 100).toStringAsFixed(1) : 0}%)', style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary)),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          flex: 2,
          child: Container(
            height: 150,
            padding: const EdgeInsets.only(top: 24, right: 24, bottom: 12, left: 12),
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
            child: _chartData.isEmpty 
              ? const Center(child: CircularProgressIndicator(color: AppColors.winGreen))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: LineChart(
                  LineChartData(
                    gridData: FlGridData(show: false),
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
                    borderData: FlBorderData(show: false),
                    lineBarsData: [
                      LineChartBarData(
                        spots: _chartData.asMap().entries.map((e) {
                          // e.value['balance'] is dynamic, convert to double
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
          ),
        )
      ],
    );
  }

  Widget _buildHorizonTabs() {
    return InkWell(
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
    );
  }

  Widget _buildOpenTrades(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
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
              Row(
                children: [
                  Text('Operaciones Abiertas', style: const TextStyle(color: AppColors.textPrimary, fontSize: 20, fontWeight: FontWeight.bold)),
                  const SizedBox(width: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(12)),
                    child: Text('$_openTradesCount activas', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
                  ),
                ],
              ),
              Text('Ver detalles ->', style: TextStyle(color: AppColors.winGreen)),
            ],
          ),
          const SizedBox(height: 24),
          if (_isLoading)
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
                  "\$${(p['entryPrice'] ?? 0).toStringAsFixed(2)}",
                  "${(p['unrealizedPnl'] ?? 0) >= 0 ? '+' : ''}\$${(p['unrealizedPnl'] ?? 0).toStringAsFixed(2)}",
                  "${(p['percentage'] ?? 0) >= 0 ? '+' : ''}${(p['percentage'] ?? 0).toStringAsFixed(2)}%",
                ),
                const Divider(color: AppColors.border, height: 32),
              ],
            )),
        ],
      ),
    );
  }

  Widget _tradeRow(String pair, String side, String size, String pnl, String pnlPct) {
    return Row(
      children: [
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(8)),
          child: const Icon(Icons.currency_bitcoin, color: Colors.orange, size: 20),
        ),
        const SizedBox(width: 16),
        Expanded(flex: 2, child: Text(pair, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold, fontSize: 16))),
        Expanded(child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(color: (side.contains('LONG') ? AppColors.winGreen : AppColors.lossRed).withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
          child: Text(side, textAlign: TextAlign.center, style: AppTheme.monoStyle.copyWith(color: side.contains('LONG') ? AppColors.winGreen : AppColors.lossRed, fontSize: 11, fontWeight: FontWeight.bold)),
        )),
        Expanded(flex: 2, child: Text(size, textAlign: TextAlign.right, style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 14))),
        Expanded(flex: 2, child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(pnl, style: AppTheme.monoStyle.copyWith(color: pnl.contains('-') ? AppColors.lossRed : AppColors.winGreen, fontWeight: FontWeight.bold, fontSize: 16)),
            Text(pnlPct, style: AppTheme.monoStyle.copyWith(color: pnlPct.contains('-') ? AppColors.lossRed : AppColors.winGreen, fontSize: 12)),
          ],
        )),
      ],
    );
  }

  Widget _buildSignals(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Últimas Señales Cuantitativas', style: const TextStyle(color: AppColors.textPrimary, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 24),
          if (_isLoading)
            const Center(child: Padding(padding: EdgeInsets.all(24.0), child: CircularProgressIndicator(color: AppColors.winGreen)))
          else if (_signals.isEmpty)
            Center(child: Padding(padding: const EdgeInsets.all(24.0), child: Text('No hay señales recientes', style: TextStyle(color: AppColors.textSecondary))))
          else
            ..._signals.map((s) {
              final date = DateTime.parse(s['evaluatedAt']);
              final diff = DateTime.now().difference(date);
              final timeAgo = diff.inMinutes < 60 ? '${diff.inMinutes} min' : '${diff.inHours}h';
              final dir = s['direction'] ?? '';
              return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: _signalRow('Señal $dir en ${s['symbol']}', 'Algoritmo Quant', timeAgo, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SignalDetailScreen(signal: s)))),
              );
            }),
        ],
      ),
    );
  }

  Widget _signalRow(String title, String subtitle, String time, {VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(12)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(width: 8, height: 8, margin: const EdgeInsets.only(top: 6), decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(subtitle, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ],
            ),
          ),
          Text(time, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 11)),
          ],
        ),
      ),
    );
  }

  Future<void> _logout(BuildContext context) async {
    await AuthService().signOut();
    if (context.mounted) {
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (context) => const LoginScreen()));
    }
  }
}



