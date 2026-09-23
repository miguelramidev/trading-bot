import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'firebase_options.dart';
import 'core/theme/app_theme.dart';
import 'screens/login_screen.dart';
import 'screens/dashboard_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MacroQuantApp());
}

class MacroQuantApp extends StatelessWidget {
  const MacroQuantApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MacroQuant',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const AuthWrapper(),
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

        // Si no hay usuario en Firebase, mandarlo al login normal.
        // Al desloguearse de Firebase, el stream emitirá null, y _isLocallyAuthenticated no importa.
        if (user == null) {
          // Reseteamos el estado local por seguridad cuando no hay usuario
          _isLocallyAuthenticated = false;
          return const LoginScreen();
        }

        // Si el usuario está en Firebase, pero aún no pasó la biometría local
        if (!_isLocallyAuthenticated) {
          return LoginScreen(
            existingUser: user,
            onBiometricSuccess: _onBiometricSuccess,
          );
        }

        // Si ya está logueado en Firebase Y pasó la biometría
        return const DashboardScreen();
      },
    );
  }
}
