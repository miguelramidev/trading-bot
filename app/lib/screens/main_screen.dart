import 'package:flutter/material.dart';
import 'dashboard_screen.dart';
import 'dashboard/settings_screen.dart';
import 'dashboard/responsive_layout.dart';
import '../core/theme/app_colors.dart';
import 'package:toastification/toastification.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _currentIndex = 0;

  final List<Widget> _screens = [
    const DashboardScreen(),
    const Center(child: Text('Historial de Operaciones', style: TextStyle(color: Colors.white))), // Placeholder for History
    const SettingsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return ResponsiveLayout(
      mobile: Scaffold(
        backgroundColor: AppColors.background,
        body: IndexedStack(
          index: _currentIndex,
          children: _screens,
        ),
        bottomNavigationBar: BottomNavigationBar(
          backgroundColor: AppColors.background,
          selectedItemColor: AppColors.winGreen,
          unselectedItemColor: AppColors.textSecondary,
          currentIndex: _currentIndex,
          onTap: (index) {
            setState(() {
              _currentIndex = index;
            });
          },
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
              onDestinationSelected: (int index) {
                setState(() {
                  _currentIndex = index;
                });
              },
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
              child: IndexedStack(
                index: _currentIndex,
                children: _screens,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
