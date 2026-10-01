import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/symbol_formatter.dart';
import '../../core/utils/text_sanitizer.dart';
import '../../providers/dashboard_provider.dart';
import '../../widgets/widgets.dart';
import 'signal_chart_view.dart';
import 'signal_detail_actions.dart';
import 'signal_detail_controller.dart';
import 'signal_detail_sections.dart';

class DesktopSignalDetail extends StatefulWidget {
  final Map<String, dynamic> signal;

  const DesktopSignalDetail({super.key, required this.signal});

  @override
  State<DesktopSignalDetail> createState() => _DesktopSignalDetailState();
}

class _DesktopSignalDetailState extends State<DesktopSignalDetail> {
  late final SignalDetailController _controller;

  @override
  void initState() {
    super.initState();
    _controller = SignalDetailController(widget.signal)..addListener(_onControllerChanged);
  }

  void _onControllerChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _controller.removeListener(_onControllerChanged);
    _controller.dispose();
    super.dispose();
  }

  String _formatTime(DateTime? t) {
    if (t == null) return '—';
    return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final marginWarning = context.watch<DashboardProvider>().marginWarning;
    final insufficientMargin = marginWarning?['insufficient'] == true;
    final canOperate = _controller.canOperate && !insufficientMargin;

    return Scaffold(
      backgroundColor: DsColors.background,
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.huger, AppSpacing.xxl, AppSpacing.huger, AppSpacing.huger),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () {
                    if (context.canPop()) {
                      context.pop();
                    } else {
                      context.go('/dashboard');
                    }
                  },
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: AppSpacing.sm,
                        runSpacing: AppSpacing.xs,
                        children: [
                          Text(fmtSymbol(_controller.symbol), style: AppTextStyles.title.copyWith(color: DsColors.textPrimary)),
                          DirectionTag(isLong: _controller.isLong),
                          buildStatusPill(_controller),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        'Señal ${_controller.strategy} · generada ${_formatTime(_controller.evaluatedAt)}${_controller.priceUpdatedAt != null ? ' · datos de las ${_formatTime(_controller.priceUpdatedAt)}' : ''}',
                        style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xl),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 420,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      buildPriceSection(_controller),
                      if (_controller.canOperate) ...[
                        const SizedBox(height: AppSpacing.lg),
                        buildTradeNowSection(_controller),
                      ],
                      const SizedBox(height: AppSpacing.lg),
                      buildContextSection(_controller),
                      if (insufficientMargin) ...[
                        const SizedBox(height: AppSpacing.lg),
                        buildMarginWarningSection(marginWarning)!,
                      ],
                      if (_controller.canOperate) ...[
                        const SizedBox(height: AppSpacing.lg),
                        Row(
                          children: [
                            SizedBox(
                              width: 140,
                              child: SecondaryButton(
                                label: 'Descartar',
                                onPressed: _controller.isExecuting ? null : () => performDiscard(context, _controller),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.md),
                            Expanded(
                              child: PrimaryButton(
                                label: 'Operar ${_controller.isLong ? 'LONG' : 'SHORT'} en ${fmtSymbol(_controller.symbol)}',
                                onPressed: (_controller.isExecuting || !canOperate) ? null : () => performTrade(context, _controller),
                                disabledReason: insufficientMargin ? 'Sin margen disponible' : null,
                              ),
                            ),
                          ],
                        ),
                      ],
                      const SizedBox(height: AppSpacing.lg),
                      _buildReasonCard(),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.xl),
                Expanded(
                  child: AppCard(
                    child: SignalChartView(
                      symbol: _controller.symbol,
                      entry: _controller.entry,
                      stop: _controller.stop,
                      target: _controller.target,
                      strategy: _controller.strategy,
                      evaluatedAt: _controller.evaluatedAt,
                      onPriceLoaded: _controller.setCurrentPrice,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReasonCard() {
    final reason = _controller.reason;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Razón de la señal', style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
          const SizedBox(height: AppSpacing.sm),
          Text(
            reason != null ? stripHtml(reason) : 'Sin detalle adicional.',
            style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary, height: 1.5),
          ),
        ],
      ),
    );
  }
}
