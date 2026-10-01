import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../core/network/api_client.dart';


import 'package:flutter/foundation.dart' show kIsWeb;

/// Resultado de confirmar el acceso contra el backend después del login.
/// `denied` es la lista de permitidos (403, tanda 2) — nunca se confunde con
/// un error de red o del servidor (`unknown`, que no bloquea la entrada).
enum AccessCheckResult { allowed, denied, unknown }

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  // Inicialización condicional: En Web, GoogleSignIn requiere explícitamente el clientId
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    clientId: kIsWeb 
      ? '552492159103-jkl75m9c2f3aaehn6q12teksorn5eb89.apps.googleusercontent.com' 
      : null,
  );

  // Flujo principal de inicio de sesión con Google
  Future<UserCredential?> signInWithGoogle() async {
    try {
      // 1. Iniciar el flujo de autenticación de Google
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        // El usuario canceló el flujo de login
        return null;
      }

      // 2. Obtener los detalles de autenticación de la solicitud
      final GoogleSignInAuthentication googleAuth = await googleUser.authentication;

      // 3. Crear una nueva credencial para Firebase
      final OAuthCredential credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      // 4. Iniciar sesión en Firebase con la credencial. La confirmación de
      // acceso contra el backend (y el FCM que depende de ella) vive en
      // `confirmAccess()` — el caller (LoginScreen) la llama después, porque
      // necesita el resultado para decidir si deja pasar o muestra "cuenta
      // sin acceso".
      return await _auth.signInWithCredential(credential);
    } catch (e) {
      print('Error durante el inicio de sesión con Google: $e');
      rethrow;
    }
  }

  /// Llamada autenticada liviana (`POST /api/users/sync`) para confirmar que
  /// el uid está en la lista de permitidos ANTES de dejar entrar a la app —
  /// tanto después de un login con Google nuevo como después de desbloquear
  /// con biometría una sesión ya existente. Si el acceso está permitido,
  /// también dispara el registro de FCM.
  Future<AccessCheckResult> confirmAccess({String? displayName}) async {
    try {
      final response = await ApiClient.post('/api/users/sync', body: {
        'name': displayName ?? 'Trader',
      });

      if (response.statusCode == 200) {
        await initFCM();
        return AccessCheckResult.allowed;
      }
      if (response.statusCode == 403) {
        return AccessCheckResult.denied;
      }
      // Error del servidor o de red: no es un "no tenés acceso" confirmado,
      // así que no se bloquea la entrada — el resto de la app ya maneja sus
      // propios errores de conexión.
      return AccessCheckResult.unknown;
    } catch (e) {
      return AccessCheckResult.unknown;
    }
  }

  // Cerrar sesión
  Future<void> signOut() async {
    await _googleSignIn.signOut();
    await _auth.signOut();
  }

  // Inicializar FCM para el usuario logueado
  Future<void> initFCM() async {
    try {
      NotificationSettings settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      
      if (settings.authorizationStatus == AuthorizationStatus.authorized) {
        String? fcmToken = await FirebaseMessaging.instance.getToken(
          vapidKey: kIsWeb ? "BOdyQFifaU2KNLkvPdByFZ37Yi-7kCC34X2IkBWNdzwNF7LTUKPccBoMoFxdLgf6GzSpkLpMKIySuIpUuFn07eY" : null
        );
        if (fcmToken != null) {
          final fcmResponse = await ApiClient.post('/api/users/fcm-token', body: {
            'token': fcmToken
          });
          if (fcmResponse.statusCode == 200) {
             print('✅ FCM Token guardado exitosamente.');
          }
        }
      }
    } catch (e) {
      print('⚠️ No se pudo inicializar FCM: $e');
    }
  }

  // Obtener usuario actual
  User? get currentUser => _auth.currentUser;
  
  // Escuchar cambios de estado (si se loguea o desloguea)
  Stream<User?> get authStateChanges => _auth.authStateChanges();
}

