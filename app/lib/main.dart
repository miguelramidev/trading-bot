import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:toastification/toastification.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'firebase_options.dart';
import 'core/theme/app_theme.dart';
import 'screens/login_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/dashboard/settings_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy(); // <-- Remueve el '#' de la URL
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MacroQuantApp());
}

class MacroQuantApp extends StatelessWidget {
  const MacroQuantApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ToastificationWrapper(
      child: MaterialApp(
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
      initialRoute: '/',
      routes: {
        '/': (context) => const AuthWrapper(),
        '/dashboard': (context) => const DashboardScreen(),
        '/settings': (context) => const SettingsScreen(),
      },
      // home: const AuthWrapper(),
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
          return DashboardScreen();
        }

        if (!_isLocallyAuthenticated) {
          return LoginScreen(
            existingUser: user,
            onBiometricSuccess: _onBiometricSuccess,
          );
        }

        // Si ya está logueado en Firebase Y pasó la biometría
        return DashboardScreen();
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
