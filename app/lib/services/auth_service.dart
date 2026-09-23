import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

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
          final response = await http.post(
            Uri.parse('https://d283s0b41l.execute-api.ca-central-1.amazonaws.com/api/users/sync'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'firebaseUid': fbUser.uid,
              'email': fbUser.email ?? 'no-email@unknown.com',
              'name': fbUser.displayName ?? 'Trader',
            }),
          );

          if (response.statusCode == 200) {
            print('✅ Usuario sincronizado con éxito en la DB.');
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

  // Obtener usuario actual
  User? get currentUser => _auth.currentUser;
  
  // Escuchar cambios de estado (si se loguea o desloguea)
  Stream<User?> get authStateChanges => _auth.authStateChanges();
}
