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

              // Barra superior
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: SafeArea(
                  child: isWeb ? _buildWebTopBar() : _buildMobileTopBar(),
                ),
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

  // --- Top Bars ---
  Widget _buildMobileTopBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 16.0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 12.0),
        decoration: BoxDecoration(
          color: AppColors.surfaceHighlight.withOpacity(0.5),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.border),
        ),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.shield_outlined, color: AppColors.winGreen, size: 16),
                  const SizedBox(width: 6),
                  Text(
                    'SEGURIDAD NIVEL 4',
                    style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary),
                  ),
                ],
              ),
              const SizedBox(width: 16),
              Row(
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: const BoxDecoration(
                      color: AppColors.winGreen,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'ALGORITMO SINCRONIZADO',
                    style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.winGreen),
                  ),
                  const SizedBox(width: 12),
                  const Icon(Icons.help_outline, color: AppColors.textSecondary, size: 18),
                ],
              )
            ],
          ),
        ),
      ),
    );
  }

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
          Row(
            children: [
              Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Text('Mercados Abiertos', style: AppTheme.monoStyle.copyWith(fontSize: 12, color: AppColors.textPrimary)),
              const SizedBox(width: 24),
              Text('ZURICH L2: 0.38 ms', style: AppTheme.monoStyle.copyWith(fontSize: 12, color: AppColors.textSecondary)),
              const SizedBox(width: 24),
              Text('FEED FIX/ITCH: SINCRONIZADO', style: AppTheme.monoStyle.copyWith(fontSize: 12, color: AppColors.textSecondary)),
              const SizedBox(width: 24),
              const Icon(Icons.help_outline, color: AppColors.textSecondary, size: 20),
            ],
          )
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
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('MOTOR DE EJECUCIÓN', style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary)),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
                          const SizedBox(width: 6),
                          Text('CLUSTER ZÚRICH-01', style: AppTheme.monoStyle.copyWith(fontSize: 12, color: AppColors.textPrimary)),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(width: 16),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('LATENCIA MKT', style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary)),
                      const SizedBox(height: 4),
                      Text('0.42 ms', style: AppTheme.monoStyle.copyWith(fontSize: 12, color: AppColors.winGreen)),
                    ],
                  )
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
          const SizedBox(height: 32),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.lock_outline, color: AppColors.winGreen, size: 14),
                    const SizedBox(width: 4),
                    Text('FIPS 140-3 HSM VALIDADO', style: AppTheme.monoStyle.copyWith(fontSize: 9, color: AppColors.textSecondary)),
                  ],
                ),
                const SizedBox(width: 16),
                Text('ID: MQ-8891-EU', style: AppTheme.monoStyle.copyWith(fontSize: 9, color: AppColors.textSecondary)),
              ],
            ),
          )
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
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Text(
                'Terminal Cuantitativa v4.2 • Zurich Cluster',
                style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary),
              ),
            ],
          ),
          const SizedBox(height: 32),
          Text(
            'Bienvenido a tu terminal',
            style: Theme.of(context).textTheme.displayLarge?.copyWith(fontSize: 24),
          ),
          const SizedBox(height: 12),
          Text(
            'Autenticación de grado criptográfico para fondos\nde cobertura y allocators institucionales.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.textSecondary),
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
          const SizedBox(height: 32),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(width: 4, height: 4, decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
                  const SizedBox(width: 6),
                  Text('SHA-384 HANDSHAKE', style: AppTheme.monoStyle.copyWith(fontSize: 9, color: AppColors.textSecondary)),
                ],
              ),
              Text('ID DE SESIÓN: #MQ-9481-EXT', style: AppTheme.monoStyle.copyWith(fontSize: 9, color: AppColors.textSecondary)),
            ],
          )
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
          Text(
            'Cifrado AES-256 • Conexión Bloomberg & Refinitiv',
            textAlign: TextAlign.center,
            style: AppTheme.monoStyle.copyWith(fontSize: 9, color: AppColors.textSecondary, height: 1.5),
          ),
          const SizedBox(height: 16),
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
              const Icon(Icons.lock_outline, color: AppColors.winGreen, size: 12),
              const SizedBox(width: 6),
              Text('Cifrado FIPS 140-3 Nivel 4', style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textPrimary)),
              const SizedBox(width: 16),
              Text('•', style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary)),
              const SizedBox(width: 16),
              Text('Conexión directa FIX / ITCH', style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary)),
              const SizedBox(width: 16),
              Text('•', style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary)),
              const SizedBox(width: 16),
              Text('Términos Institucionales', style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary)),
              const SizedBox(width: 16),
              Text('•', style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary)),
              const SizedBox(width: 16),
              Text('Privacidad Cuantitativa', style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary)),
            ],
          ),
          Text(
            'MacroQuant Financial Technologies AG © 2024',
            style: AppTheme.monoStyle.copyWith(fontSize: 10, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}
