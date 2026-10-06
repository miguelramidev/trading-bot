import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_spacing.dart';
import '../../widgets/widgets.dart';
import '../dashboard/responsive_layout.dart';
import 'market_controller.dart';
import 'market_sections.dart';

/// Tablero de posicionamiento: saturación de cuentas y funding por moneda,
/// más el seguimiento del modo sombra (POS y carry registrados sin operar).
class MarketScreen extends StatelessWidget {
  const MarketScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => MarketController(),
      child: const ResponsiveLayout(mobile: _MarketBody(mobile: true), desktop: _MarketBody(mobile: false)),
    );
  }
}

class _MarketBody extends StatelessWidget {
  final bool mobile;
  const _MarketBody({required this.mobile});

  @override
  Widget build(BuildContext context) {
    final body = Consumer<MarketController>(
      builder: (context, c, _) {
        if (c.isLoading && c.data == null) {
          return const Center(child: CircularProgressIndicator());
        }
        if (c.errorMessage != null && c.data == null) {
          return ErrorState(message: c.errorMessage!, actionLabel: 'Reintentar', onAction: c.fetch, icon: Icons.cloud_off);
        }
        final pad = mobile ? AppSpacing.lg : AppSpacing.xxl;
        return RefreshIndicator(
          onRefresh: c.fetch,
          child: ListView(
            padding: EdgeInsets.all(pad),
            children: [
              buildMarketIntro(c),
              const SizedBox(height: AppSpacing.xl),
              SectionHeader(title: 'Modo sombra', mobile: mobile),
              const SizedBox(height: AppSpacing.md),
              buildShadowSummaries(c, mobile: mobile),
              const SizedBox(height: AppSpacing.xl),
              buildShadowPositions(c, mobile: mobile),
              const SizedBox(height: AppSpacing.xl),
              SectionHeader(title: 'Saturación por moneda', count: marketDataLabel(c), mobile: mobile),
              const SizedBox(height: AppSpacing.md),
              buildPositioningTable(c, mobile: mobile),
            ],
          ),
        );
      },
    );

    if (!mobile) {
      return Stack(children: [
        body,
        Positioned(
          top: AppSpacing.md,
          right: AppSpacing.md,
          child: Consumer<MarketController>(
            builder: (context, c, _) => IconButton(icon: const Icon(Icons.refresh, color: DsColors.textSecondary), tooltip: 'Actualizar', onPressed: c.fetch),
          ),
        ),
      ]);
    }
    return Scaffold(
      backgroundColor: DsColors.background,
      appBar: AppBar(
        backgroundColor: DsColors.background,
        elevation: 0,
        title: Text('Mercado', style: AppTextStyles.sectionMobile),
        actions: [
          Consumer<MarketController>(builder: (context, c, _) => IconButton(icon: const Icon(Icons.refresh), onPressed: c.fetch)),
        ],
      ),
      body: body,
    );
  }
}
