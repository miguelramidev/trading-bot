import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'dashboard/responsive_layout.dart';
import '../core/theme/app_colors.dart';

class MainScreen extends StatelessWidget {
  final Widget child;
  final String currentPath;

  const MainScreen({super.key, required this.child, required this.currentPath});

  int get _currentIndex {
    if (currentPath.startsWith('/settings')) return 2;
    if (currentPath.startsWith('/history')) return 1;
    return 0; // /dashboard
  }

  void _onItemTapped(int index, BuildContext context) {
    if (index == 0) context.go('/dashboard');
    if (index == 1) context.go('/history');
    if (index == 2) context.go('/settings');
  }

  @override
  Widget build(BuildContext context) {
    return ResponsiveLayout(
      mobile: Scaffold(
        backgroundColor: AppColors.background,
        body: child, // Lazy loading: Solo renderiza la ruta actual
        bottomNavigationBar: BottomNavigationBar(
          backgroundColor: AppColors.background,
          selectedItemColor: AppColors.winGreen,
          unselectedItemColor: AppColors.textSecondary,
          currentIndex: _currentIndex,
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
              selectedIndex: _currentIndex,
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
            Expanded(child: child), // Lazy loading
          ],
        ),
      ),
    );
  }
}
