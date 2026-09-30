import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';
import '../services/auth_service.dart';
import '../services/biometric_service.dart';
import '../core/utils/app_toast.dart';

class LoginScreen extends StatefulWidget {
  final User? existingUser;
  final VoidCallback? onBiometricSuccess;

  const LoginScreen({
    super.key,
    this.existingUser,
    this.onBiometricSuccess,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final AuthService _authService = AuthService();
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    if (widget.existingUser != null) {
      // Si ya hay usuario, disparamos la biometría automáticamente al cargar
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _handleBiometricAuth();
      });
    }
  }

  Future<void> _handleGoogleSignIn() async {
    setState(() => _isLoading = true);
    try {
      final UserCredential? userCredential = await _authService.signInWithGoogle();
      if (userCredential != null) {
        // La navegación se maneja automáticamente en main.dart gracias al StreamBuilder
        // que escucha los cambios de estado de autenticación.
      } else {
        if (mounted) {
          AppToast.showInfo(context, 'Inicio de sesión cancelado o bloqueado por el sistema.');
        }
      }
    } catch (e) {
      if (mounted) {
        AppToast.showError(context, 'Error al iniciar sesión: $e');
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _handleBiometricAuth() async {
    final isAvailable = await BiometricService.isBiometricAvailable();
    if (!isAvailable) {
      if (mounted) {
        AppToast.showError(context, 'Biometría no disponible en este dispositivo.');
      }
      return;
    }

    final success = await BiometricService.authenticate();
    if (success && mounted) {
      AppToast.showSuccess(context, 'Autenticación exitosa.');
      if (widget.onBiometricSuccess != null) {
        widget.onBiometricSuccess!();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LayoutBuilder(
        builder: (context, constraints) {
          final isWeb = constraints.maxWidth > 800;

          return Stack(
            children: [
              // Fondo (matriz de puntos para web, degradado sutil para mobile)
              if (isWeb) _buildWebBackground() else _buildMobileBackground(),

              // Barra superior (solo web: título)
              if (isWeb)
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: SafeArea(child: _buildWebTopBar()),
                ),

              // Tarjeta Central
              Center(
                child: SingleChildScrollView(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 80.0),
                    child: isWeb ? _buildWebCard(context) : _buildMobileCard(context),
                  ),
                ),
              ),

              // Footer
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: SafeArea(
                  child: isWeb ? _buildWebFooter(context) : _buildMobileFooter(context),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  // --- Fondos ---
  Widget _buildWebBackground() {
    return Container(
      color: const Color(0xFF07090D),
      // Podríamos agregar un CustomPaint para dibujar la grilla de puntos si se desea
    );
  }

  Widget _buildMobileBackground() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xFF09141E), // Tono azulado en la parte superior
            AppColors.background,
          ],
        ),
      ),
    );
  }

  // --- Top Bar (solo web) ---
  Widget _buildWebTopBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32.0, vertical: 20.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              const Icon(Icons.shield_outlined, color: AppColors.winGreen),
              const SizedBox(width: 8),
              Text('MacroQuant', style: AppTheme.monoStyle.copyWith(fontSize: 18, color: Colors.white, fontWeight: FontWeight.bold)),
            ],
          ),
        ],
      ),
    );
  }

  // --- Cards ---
  Widget _buildMobileCard(BuildContext context) {
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(maxWidth: 400),
      padding: const EdgeInsets.all(24.0), // Reducido el padding para pantallas pequeñas
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildLogoIcon(),
          const SizedBox(height: 24),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              'MacroQuant',
              style: Theme.of(context).textTheme.displayLarge?.copyWith(fontSize: 28),
            ),
          ),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              'INTELIGENCIA CUANTITATIVA',
              style: AppTheme.monoStyle.copyWith(fontSize: 12, color: AppColors.textSecondary, letterSpacing: 1.5),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.surfaceHighlight,
              borderRadius: BorderRadius.circular(16),
            ),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.verified_user_outlined, color: AppColors.winGreen, size: 14),
                  const SizedBox(width: 8),
                  Text(
                    'Acceso Institucional & Portafolios Privados',
                    style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 32),
          if (widget.existingUser == null)
            _buildGoogleButton(isDark: true)
          else ...[
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _handleBiometricAuth,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.winGreen,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.fingerprint, color: Colors.black, size: 20),
                      const SizedBox(width: 12),
                      const Text('Verificar Identidad (Face ID)', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: () async {
                await _authService.signOut();
                // No necesitamos setState porque el StreamBuilder en main.dart reconstruirá la vista
              },
              child: Text('Cambiar de cuenta', style: TextStyle(color: AppColors.textSecondary)),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildWebCard(BuildContext context) {
    return Container(
      width: 500,
      padding: const EdgeInsets.all(48.0),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildLogoIcon(),
          const SizedBox(height: 24),
          Text(
            'MACROQUANT',
            style: AppTheme.monoStyle.copyWith(fontSize: 20, color: AppColors.textPrimary, letterSpacing: 2.0),
          ),
          const SizedBox(height: 8),
          Text(
            'Bienvenido a tu terminal',
            style: Theme.of(context).textTheme.displayLarge?.copyWith(fontSize: 24),
          ),
          const SizedBox(height: 40),
          if (widget.existingUser == null)
            _buildGoogleButton(isDark: false)
          else ...[
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _handleBiometricAuth,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.winGreen,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.key_outlined, color: Colors.black, size: 20),
                    const SizedBox(width: 12),
                    const Text('Hardware Key / SSO Institucional', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: () async {
                await _authService.signOut();
              },
              child: Text('Cambiar de cuenta', style: TextStyle(color: AppColors.textSecondary)),
            ),
          ],
          const SizedBox(height: 40),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.shield_outlined, color: AppColors.textSecondary, size: 14),
              const SizedBox(width: 8),
              Text('Plataforma exclusiva para trading institucional', style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary)),
            ],
          ),
        ],
      ),
    );
  }

  // --- Helpers ---
  Widget _buildLogoIcon() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Image.asset(
        'assets/images/logo.png',
        width: 64,
        height: 64,
        fit: BoxFit.cover,
      ),
    );
  }

  Widget _buildGoogleButton({required bool isDark}) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: _isLoading ? null : _handleGoogleSignIn,
        style: ElevatedButton.styleFrom(
          backgroundColor: isDark ? AppColors.surfaceHighlight : Colors.white,
          foregroundColor: isDark ? Colors.white : Colors.black,
          padding: const EdgeInsets.symmetric(vertical: 16),
          elevation: 0,
          side: isDark ? const BorderSide(color: AppColors.border) : null,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          disabledBackgroundColor: isDark ? AppColors.surfaceHighlight.withOpacity(0.5) : Colors.white70,
        ),
        child: _isLoading
            ? SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: isDark ? Colors.white : Colors.black,
                ),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  FaIcon(FontAwesomeIcons.google, color: isDark ? Colors.white : Colors.black, size: 20),
                  const SizedBox(width: 12),
                  Text(
                    'Continuar con Google',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                      color: isDark ? Colors.white : Colors.black,
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildMobileFooter(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24.0, horizontal: 32.0),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Términos del Servicio', style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontSize: 12, color: AppColors.textSecondary)),
              const SizedBox(width: 16),
              const Icon(Icons.circle, size: 4, color: AppColors.textSecondary),
              const SizedBox(width: 16),
              Text('Privacidad Institucional', style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontSize: 12, color: AppColors.textSecondary)),
            ],
          )
        ],
      ),
    );
  }

  Widget _buildWebFooter(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24.0, horizontal: 32.0),
      child: Wrap(
        alignment: WrapAlignment.spaceBetween,
        runSpacing: 12,
        children: [
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('Términos Institucionales', style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary)),
              const SizedBox(width: 16),
              Text('•', style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary)),
              const SizedBox(width: 16),
              Text('Privacidad Cuantitativa', style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary)),
            ],
          ),
        ],
      ),
    );
  }
}
