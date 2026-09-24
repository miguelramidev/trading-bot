import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
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
            Expanded(child: navigationShell),
          ],
        ),
      ),
    );
  }
}
