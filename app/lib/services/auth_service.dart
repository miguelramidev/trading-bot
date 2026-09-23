import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final GoogleSignIn _googleSignIn = GoogleSignIn();

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
      return await _auth.signInWithCredential(credential);
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
