import 'screens/history/history_screen.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:toastification/toastification.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'firebase_options.dart';
import 'core/theme/app_theme.dart';
import 'screens/login_screen.dart';
import 'screens/main_screen.dart';
import 'services/auth_service.dart';
import 'screens/dashboard/settings_screen.dart';
import 'screens/signals/signal_detail_screen.dart';
import 'screens/trades/trade_detail_screen.dart';
import 'package:go_router/go_router.dart';
import 'screens/dashboard_screen.dart';

import 'package:provider/provider.dart';
import 'providers/dashboard_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy(); // <-- Remueve el '#' de la URL

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  // Escuchar mensajes en primer plano (Foreground)
  FirebaseMessaging.onMessage.listen((RemoteMessage message) {
    if (message.notification != null) {
      toastification.show(
        title: Text(message.notification!.title ?? 'MacroQuant Alerta', style: const TextStyle(fontWeight: FontWeight.bold)),
        description: Text(message.notification!.body ?? ''),
        type: ToastificationType.info,
        style: ToastificationStyle.flat,
        autoCloseDuration: const Duration(seconds: 5),
        alignment: Alignment.topRight,
        showProgressBar: false,
      );
    }
  });

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => DashboardProvider()),
      ],
      child: const MacroQuantApp(),
    ),
  );
}

final GlobalKey<NavigatorState> _rootNavigatorKey = GlobalKey<NavigatorState>();
final GlobalKey<NavigatorState> _shellNavigatorKey = GlobalKey<NavigatorState>();

final GoRouter _router = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const AuthWrapper(),
    ),
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) {
        return MainScreen(navigationShell: navigationShell);
      },
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/dashboard',
              builder: (context, state) => const DashboardScreen(),
              routes: [
                GoRoute(
                  path: 'signal/:id',
                  builder: (context, state) {
                    final signal = state.extra as Map<String, dynamic>?;
                    if (signal == null) {
                      WidgetsBinding.instance.addPostFrameCallback((_) { context.go('/dashboard'); });
                      return const Scaffold(body: Center(child: CircularProgressIndicator()));
                    }
                    return SignalDetailScreen(signal: signal);
                  },
                ),
                GoRoute(
                  path: 'trade/:id',
                  pageBuilder: (context, state) {
                    final trade = state.extra as Map<String, dynamic>? ?? {};
                    return CustomTransitionPage(
                      key: state.pageKey,
                      child: TradeDetailScreen(trade: trade),
                      transitionsBuilder: (context, animation, secondaryAnimation, child) {
                        return FadeTransition(opacity: animation, child: child);
                      },
                    );
                  }
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/history',
              builder: (context, state) {
                final pageStr = state.uri.queryParameters['page'] ?? '1';
                final filterStr = state.uri.queryParameters['filter'] ?? 'Todos';
                return HistoryScreen(initialPage: int.tryParse(pageStr) ?? 1, filter: filterStr);
              },
              routes: [
                GoRoute(
                  path: 'trade/:id',
                  pageBuilder: (context, state) {
                    final trade = state.extra as Map<String, dynamic>? ?? {};
                    return CustomTransitionPage(
                      key: state.pageKey,
                      child: TradeDetailScreen(trade: trade, isClosed: true),
                      transitionsBuilder: (context, animation, secondaryAnimation, child) {
                        return FadeTransition(opacity: animation, child: child);
                      },
                    );
                  }
                )
              ]
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/settings',
              builder: (context, state) => const SettingsScreen(),
            ),
          ],
        ),
      ],
    ),
  ],
);

class MacroQuantApp extends StatelessWidget {
  const MacroQuantApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ToastificationWrapper(
      child: MaterialApp.router(
        title: 'MacroQuant',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme.copyWith(
          pageTransitionsTheme: PageTransitionsTheme(
            builders: kIsWeb ? {
              TargetPlatform.windows: const NoAnimationPageTransitionsBuilder(),
              TargetPlatform.macOS: const NoAnimationPageTransitionsBuilder(),
              TargetPlatform.linux: const NoAnimationPageTransitionsBuilder(),
              TargetPlatform.android: const NoAnimationPageTransitionsBuilder(),
              TargetPlatform.iOS: const NoAnimationPageTransitionsBuilder(),
              TargetPlatform.fuchsia: const NoAnimationPageTransitionsBuilder(),
            } : const {
              TargetPlatform.android: ZoomPageTransitionsBuilder(),
              TargetPlatform.iOS: ZoomPageTransitionsBuilder(),
              TargetPlatform.windows: ZoomPageTransitionsBuilder(),
              TargetPlatform.macOS: ZoomPageTransitionsBuilder(),
              TargetPlatform.linux: ZoomPageTransitionsBuilder(),
              TargetPlatform.fuchsia: ZoomPageTransitionsBuilder(),
            },
          ),
        ),
        routerConfig: _router,
      ),
    );
  }
}

class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});

  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  bool _isLocallyAuthenticated = false;

  void _onBiometricSuccess() {
    setState(() {
      _isLocallyAuthenticated = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final user = snapshot.data;

        if (user == null) {
          _isLocallyAuthenticated = false;
          return const LoginScreen();
        }

        // En Web, no usamos biometría (FaceID/Huella), así que lo pasamos directamente al Dashboard
        if (kIsWeb) {
          AuthService().initFCM();
          WidgetsBinding.instance.addPostFrameCallback((_) { context.go('/dashboard'); }); return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }

        if (!_isLocallyAuthenticated) {
          return LoginScreen(
            existingUser: user,
            onBiometricSuccess: _onBiometricSuccess,
          );
        }

        // Si ya está logueado en Firebase Y pasó la biometría
        AuthService().initFCM();
        WidgetsBinding.instance.addPostFrameCallback((_) { context.go('/dashboard'); }); return const Scaffold(body: Center(child: CircularProgressIndicator()));
      },
    );
  }
}

class NoAnimationPageTransitionsBuilder extends PageTransitionsBuilder {
  const NoAnimationPageTransitionsBuilder();
  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    return child;
  }
}
