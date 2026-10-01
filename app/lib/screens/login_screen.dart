import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_radius.dart';
import '../services/auth_service.dart';
import '../services/biometric_service.dart';
import '../core/utils/app_toast.dart';
import '../widgets/widgets.dart';

/// Breakpoint unificado con `ResponsiveLayout` (`lib/screens/dashboard/responsive_layout.dart`).
const double kLoginDesktopBreakpoint = 900;

class LoginScreen extends StatefulWidget {
  final User? existingUser;
  final VoidCallback? onBiometricSuccess;

  const LoginScreen({super.key, this.existingUser, this.onBiometricSuccess});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final AuthService _authService = AuthService();
  bool _isLoading = false;
  String? _deniedEmail;

  @override
  void initState() {
    super.initState();
    if (widget.existingUser != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _handleBiometricAuth());
    }
  }

  Future<void> _handleGoogleSignIn() async {
    setState(() => _isLoading = true);
    try {
      final credential = await _authService.signInWithGoogle();
      if (credential == null) {
        if (mounted) AppToast.showInfo(context, 'Inicio de sesión cancelado o bloqueado por el sistema.');
        return;
      }
      final user = credential.user;
      final result = await _authService.confirmAccess(displayName: user?.displayName);
      await _handleAccessResult(result, user?.email);
      // Si quedó permitido, el StreamBuilder de main.dart navega solo.
    } catch (e) {
      if (mounted) AppToast.showError(context, 'Error al iniciar sesión: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleBiometricAuth() async {
    final isAvailable = await BiometricService.isBiometricAvailable();
    if (!isAvailable) {
      if (mounted) AppToast.showError(context, 'Biometría no disponible en este dispositivo.');
      return;
    }

    final success = await BiometricService.authenticate();
    if (!success || !mounted) return;

    final result = await _authService.confirmAccess(displayName: widget.existingUser?.displayName);
    await _handleAccessResult(result, widget.existingUser?.email);
  }

  /// `denied`: cierra la sesión de Firebase y muestra "cuenta sin acceso".
  /// `allowed`/`unknown`: deja pasar (un error de red no es un 403 confirmado).
  Future<void> _handleAccessResult(AccessCheckResult result, String? email) async {
    if (result == AccessCheckResult.denied) {
      await _authService.signOut();
      if (!mounted) return;
      setState(() => _deniedEmail = email);
      return;
    }
    if (result == AccessCheckResult.allowed && mounted) {
      AppToast.showSuccess(context, 'Autenticación exitosa.');
    }
    widget.onBiometricSuccess?.call();
  }

  void _useAnotherAccount() {
    setState(() => _deniedEmail = null);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DsColors.background,
      body: LayoutBuilder(
        builder: (context, constraints) {
          final isDesktop = constraints.maxWidth >= kLoginDesktopBreakpoint;
          return Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: 80),
              child: SizedBox(
                width: isDesktop ? 440 : double.infinity,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _buildHeader(),
                    const SizedBox(height: AppSpacing.xxl),
                    if (_deniedEmail != null)
                      _buildDeniedCard()
                    else if (widget.existingUser != null)
                      _buildBiometricCard()
                    else
                      _buildStartCard(),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(color: DsColors.surfaceRaised, border: Border.all(color: DsColors.border), borderRadius: BorderRadius.circular(AppRadius.xl)),
          alignment: Alignment.center,
          child: Text('MQ', style: AppTextStyles.numM.copyWith(color: DsColors.accent)),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text('MacroQuant', style: AppTextStyles.title.copyWith(color: DsColors.textPrimary)),
        const SizedBox(height: AppSpacing.sm),
        Text(
          'Tus señales, tus posiciones y tu historial de Binance Futures en un solo lugar.',
          textAlign: TextAlign.center,
          style: AppTextStyles.body.copyWith(color: DsColors.textSecondary),
        ),
      ],
    );
  }

  Widget _buildStartCard() {
    return AppCard(
      child: Column(
        children: [
          _buildGoogleButton(),
          const SizedBox(height: AppSpacing.md),
          Text('El acceso está limitado a cuentas autorizadas.', textAlign: TextAlign.center, style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
        ],
      ),
    );
  }

  Widget _buildBiometricCard() {
    return AppCard(
      child: Column(
        children: [
          PrimaryButton(label: 'Desbloquear', onPressed: _handleBiometricAuth),
          const SizedBox(height: AppSpacing.md),
          SecondaryButton(label: 'Usar otra cuenta', onPressed: () => _authService.signOut()),
        ],
      ),
    );
  }

  Widget _buildDeniedCard() {
    return AppCard(
      child: Column(
        children: [
          Callout(
            variant: CalloutVariant.warning,
            icon: Icons.lock_outline,
            message: 'La cuenta ${_deniedEmail ?? ''} no tiene acceso a esta app.',
          ),
          const SizedBox(height: AppSpacing.lg),
          SecondaryButton(label: 'Usar otra cuenta de Google', onPressed: _useAnotherAccount),
        ],
      ),
    );
  }

  Widget _buildGoogleButton() {
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: ElevatedButton(
        onPressed: _isLoading ? null : _handleGoogleSignIn,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFFF1F3F6),
          foregroundColor: const Color(0xFF0B1220),
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
        ),
        child: _isLoading
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF0B1220)))
            : const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  FaIcon(FontAwesomeIcons.google, color: Color(0xFF0B1220), size: 18),
                  SizedBox(width: AppSpacing.md),
                  Text('Continuar con Google', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15, color: Color(0xFF0B1220))),
                ],
              ),
      ),
    );
  }
}
