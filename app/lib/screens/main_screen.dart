import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/auth_service.dart';
import 'dashboard/responsive_layout.dart';
import '../core/theme/app_colors.dart';

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
    return ResponsiveLayout(
      mobile: Scaffold(
        backgroundColor: AppColors.background,
        body: navigationShell,
        bottomNavigationBar: BottomNavigationBar(
          backgroundColor: AppColors.background,
          selectedItemColor: AppColors.winGreen,
          unselectedItemColor: AppColors.textSecondary,
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
        backgroundColor: AppColors.background,
        body: Row(
          children: [
            NavigationRail(
              backgroundColor: AppColors.surface,
              selectedIndex: navigationShell.currentIndex,
              onDestinationSelected: (int index) => _onItemTapped(index, context),
              selectedIconTheme: const IconThemeData(color: AppColors.winGreen),
              unselectedIconTheme: const IconThemeData(color: AppColors.textSecondary),
              destinations: const [
                NavigationRailDestination(icon: Icon(Icons.grid_view), label: Text('Inicio')),
                NavigationRailDestination(icon: Icon(Icons.receipt_long), label: Text('Historial')),
                NavigationRailDestination(icon: Icon(Icons.tune), label: Text('Ajustes')),
              ],
            ),
            const VerticalDivider(thickness: 1, width: 1, color: AppColors.border),
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
        border: Border(bottom: BorderSide(color: AppColors.border, width: 1)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Text(title, style: const TextStyle(color: AppColors.textPrimary, fontSize: 18, fontWeight: FontWeight.bold)),
              const Padding(padding: EdgeInsets.symmetric(horizontal: 16), child: Text('/', style: TextStyle(color: AppColors.textSecondary))),
              Text(subtitle, style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
            ],
          ),
          Row(
            children: [
              Row(
                children: [
                  Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  const Text('Conectado', style: TextStyle(color: AppColors.winGreen, fontSize: 12, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(width: 24),
              IconButton(
                icon: const Icon(Icons.logout, color: AppColors.textSecondary),
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
