import 'package:local_auth/local_auth.dart';
import 'package:flutter/services.dart';

class BiometricService {
  static final LocalAuthentication _auth = LocalAuthentication();

  /// Comprueba si el dispositivo tiene hardware biométrico y si hay huellas o rostros enrolados.
  static Future<bool> isBiometricAvailable() async {
    try {
      final bool canAuthenticateWithBiometrics = await _auth.canCheckBiometrics;
      final bool canAuthenticate = canAuthenticateWithBiometrics || await _auth.isDeviceSupported();
      return canAuthenticate;
    } on PlatformException catch (e) {
      print('Error al chequear biometría: $e');
      return false;
    }
  }

  /// Inicia el diálogo del sistema operativo para autenticar al usuario
  static Future<bool> authenticate() async {
    try {
      final bool didAuthenticate = await _auth.authenticate(
        localizedReason: 'Por favor, autentícate para acceder a tu portafolio institucional.',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false, // Permite PIN o Patrón como fallback
        ),
      );
      return didAuthenticate;
    } on PlatformException catch (e) {
      print('Error en autenticación biométrica: $e');
      return false;
    }
  }
}
