import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../core/network/api_client.dart';


import 'package:flutter/foundation.dart' show kIsWeb;

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

      // 4. Iniciar sesión en Firebase con la credencial
      final userCredential = await _auth.signInWithCredential(credential);
      final fbUser = userCredential.user;

      if (fbUser != null) {
        try {
          print('Sincronizando usuario con backend PostgreSQL...');
          // 5. Sincronizar el usuario con la Base de Datos en AWS Neon
          final response = await ApiClient.post('/api/users/sync', body: {
              'firebaseUid': fbUser.uid,
              'email': fbUser.email ?? 'no-email@unknown.com',
              'name': fbUser.displayName ?? 'Trader',
          });


          if (response.statusCode == 200) {
            print('✅ Usuario sincronizado con éxito en la DB.');
            
            // 6. Configurar Firebase Cloud Messaging
            try {
              // Solicitar permisos nativos de notificación
              NotificationSettings settings = await FirebaseMessaging.instance.requestPermission(
                alert: true,
                badge: true,
                sound: true,
              );
              
              if (settings.authorizationStatus == AuthorizationStatus.authorized) {
                // Obtener el token del dispositivo
                // Para Web, necesitas especificar el vapidKey en getToken(vapidKey: "...")
                // TODO: Reemplaza "TU_VAPID_KEY_AQUI" por el Keypair de Firebase -> Cloud Messaging -> Web configuration
                String? fcmToken = await FirebaseMessaging.instance.getToken(
                  vapidKey: kIsWeb ? "BOdyQFifaU2KNLkvPdByFZ37Yi-7kCC34X2IkBWNdzwNF7LTUKPccBoMoFxdLgf6GzSpkLpMKIySuIpUuFn07eY" : null
                );
                if (fcmToken != null) {
                  // Guardarlo en el backend
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
          } else {

            print('⚠️ Error al sincronizar usuario: ${response.body}');
          }
        } catch (syncError) {
          print('⚠️ Excepción al sincronizar usuario: $syncError');
          // No lanzamos la excepción para no bloquear el inicio de sesión en la app
        }
      }

      return userCredential;
    } catch (e) {
      print('Error durante el inicio de sesión con Google: $e');
      rethrow;
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

