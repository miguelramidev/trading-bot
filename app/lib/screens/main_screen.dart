import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import 'dashboard/responsive_layout.dart';
import '../core/theme/ds_colors.dart';
import '../providers/dashboard_provider.dart';

class MainScreen extends StatelessWidget {
  final StatefulNavigationShell navigationShell;

  const MainScreen({super.key, required this.navigationShell});

  void _onItemTapped(int index, BuildContext context) {
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    // El shell mantiene todas las ramas montadas (indexedStack) — avisamos
    // al provider si Inicio (índice 0) es la pestaña visible ahora mismo,
    // para que el polling de 60s se pause al salir de ella.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (context.mounted) {
        context.read<DashboardProvider>().setActiveTab(navigationShell.currentIndex == 0);
      }
    });
    return ResponsiveLayout(
      mobile: Scaffold(
        backgroundColor: DsColors.background,
        body: navigationShell,
        bottomNavigationBar: BottomNavigationBar(
          backgroundColor: DsColors.background,
          selectedItemColor: DsColors.positive,
          unselectedItemColor: DsColors.textSecondary,
          currentIndex: navigationShell.currentIndex,
          onTap: (index) => _onItemTapped(index, context),
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.grid_view), label: 'Inicio'),
            BottomNavigationBarItem(icon: Icon(Icons.receipt_long), label: 'Historial'),
            BottomNavigationBarItem(icon: Icon(Icons.tune), label: 'Ajustes'),
          ],
        ),
      ),
      desktop: Scaffold(
        backgroundColor: DsColors.background,
        body: Row(
          children: [
            NavigationRail(
              backgroundColor: DsColors.surface,
              selectedIndex: navigationShell.currentIndex,
              onDestinationSelected: (int index) => _onItemTapped(index, context),
              selectedIconTheme: const IconThemeData(color: DsColors.positive),
              unselectedIconTheme: const IconThemeData(color: DsColors.textSecondary),
              destinations: const [
                NavigationRailDestination(icon: Icon(Icons.grid_view), label: Text('Inicio')),
                NavigationRailDestination(icon: Icon(Icons.receipt_long), label: Text('Historial')),
                NavigationRailDestination(icon: Icon(Icons.tune), label: Text('Ajustes')),
              ],
            ),
            const VerticalDivider(thickness: 1, width: 1, color: DsColors.border),
            Expanded(
              child: Column(
                children: [
                  _buildDesktopTopBar(context),
                  Expanded(child: navigationShell),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDesktopTopBar(BuildContext context) {
    String title = 'MacroQuant Executive';
    String subtitle = 'Panel de Control';
    if (navigationShell.currentIndex == 0) subtitle = 'Monitor Algorítmico';
    if (navigationShell.currentIndex == 1) subtitle = 'Historial de Señales';
    if (navigationShell.currentIndex == 2) subtitle = 'Configuración de Motor';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: DsColors.border, width: 1)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Text(title, style: const TextStyle(color: DsColors.textPrimary, fontSize: 18, fontWeight: FontWeight.bold)),
              const Padding(padding: EdgeInsets.symmetric(horizontal: 16), child: Text('/', style: TextStyle(color: DsColors.textSecondary))),
              Text(subtitle, style: const TextStyle(color: DsColors.textSecondary, fontSize: 14)),
            ],
          ),
          Row(
            children: [
              Row(
                children: [
                  Container(width: 6, height: 6, decoration: const BoxDecoration(color: DsColors.positive, shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  const Text('Conectado', style: TextStyle(color: DsColors.positive, fontSize: 12, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(width: 24),
              IconButton(
                icon: const Icon(Icons.logout, color: DsColors.textSecondary),
                tooltip: 'Cerrar sesión',
                onPressed: () async {
                  await AuthService().signOut();
                  if (context.mounted) context.go('/');
                },
              ),
            ],
          )
        ],
      ),
    );
  }
}
