import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import 'dashboard/responsive_layout.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';
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
        bottomNavigationBar: SelectionContainer.disabled(
          child: BottomNavigationBar(
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
      ),
      desktop: Scaffold(
        backgroundColor: DsColors.background,
        body: Row(
          children: [
            SelectionContainer.disabled(
              child: NavigationRail(
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

  static const _titles = ['Inicio', 'Historial', 'Configuración'];

  Widget _buildDesktopTopBar(BuildContext context) {
    final title = _titles[navigationShell.currentIndex.clamp(0, _titles.length - 1)];
    final connected = context.watch<DashboardProvider>().binanceConnected;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xxl, vertical: AppSpacing.xl),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: DsColors.border, width: 1)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: AppTextStyles.section.copyWith(color: DsColors.textPrimary)),
          Row(
            children: [
              Row(
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: connected == null ? DsColors.textTertiary : (connected ? DsColors.positive : DsColors.negative),
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Text(
                    connected == null ? 'Verificando conexión' : (connected ? 'Binance conectado' : 'Sin conexión con Binance'),
                    style: AppTextStyles.caption.copyWith(
                      color: connected == null ? DsColors.textTertiary : (connected ? DsColors.positive : DsColors.negative),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(width: AppSpacing.xxl),
              SelectionContainer.disabled(
                child: IconButton(
                  icon: const Icon(Icons.logout, color: DsColors.textSecondary),
                  tooltip: 'Cerrar sesión',
                  onPressed: () async {
                    await AuthService().signOut();
                    if (context.mounted) context.go('/');
                  },
                ),
              ),
            ],
          )
        ],
      ),
    );
  }
}
