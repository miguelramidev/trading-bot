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

class MobileSignalDetail extends StatefulWidget {
  final Map<String, dynamic> signal;

  const MobileSignalDetail({super.key, required this.signal});

  @override
  State<MobileSignalDetail> createState() => _MobileSignalDetailState();
}

class _MobileSignalDetailState extends State<MobileSignalDetail> {
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

  @override
  Widget build(BuildContext context) {
    final marginWarning = context.watch<DashboardProvider>().marginWarning;
    final insufficientMargin = marginWarning?['insufficient'] == true;
    final canOperate = _controller.canOperate && !insufficientMargin;

    return Scaffold(
      backgroundColor: DsColors.background,
      appBar: AppBar(
        backgroundColor: DsColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go('/dashboard');
            }
          },
        ),
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, _controller.canOperate ? 96 : AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildHeader(),
            if (buildWarningsSection(_controller) != null) ...[
              const SizedBox(height: AppSpacing.lg),
              buildWarningsSection(_controller)!,
            ],
            const SizedBox(height: AppSpacing.lg),
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
            const SizedBox(height: AppSpacing.lg),
            AppCard(
              child: SignalChartView(
                symbol: _controller.symbol,
                entry: _controller.entry,
                stop: _controller.stop,
                target: _controller.target,
                strategy: _controller.strategy,
                evaluatedAt: _controller.evaluatedAt,
                triggerAdx: _controller.triggerAdxValue,
              ),
            ),
            if (_controller.wasExecuted) ...[
              const SizedBox(height: AppSpacing.lg),
              _buildReasonCard(),
            ],
          ],
        ),
      ),
      bottomNavigationBar: _controller.canOperate ? _buildBottomBar(canOperate, insufficientMargin) : null,
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            Text(fmtSymbol(_controller.symbol), style: AppTextStyles.titleMobile.copyWith(color: DsColors.textPrimary)),
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
    );
  }

  String _formatTime(DateTime? t) {
    if (t == null) return '—';
    return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }

  Widget _buildReasonCard() {
    final reason = _controller.reason;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Resultado de la ejecución', style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
          const SizedBox(height: AppSpacing.sm),
          Text(
            reason != null ? stripHtml(reason) : 'Sin detalle adicional.',
            style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary, height: 1.5),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomBar(bool canOperate, bool insufficientMargin) {
    return SafeArea(
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: const BoxDecoration(color: DsColors.background, border: Border(top: BorderSide(color: DsColors.border))),
        child: Row(
          children: [
            Expanded(
              child: SecondaryButton(
                label: 'Descartar',
                onPressed: _controller.isExecuting ? null : () => performDiscard(context, _controller),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              flex: 2,
              child: PrimaryButton(
                label: 'Operar ${_controller.isLong ? 'LONG' : 'SHORT'} en ${fmtSymbol(_controller.symbol)}',
                onPressed: (_controller.isExecuting || !canOperate) ? null : () => performTrade(context, _controller),
                disabledReason: insufficientMargin ? 'Sin margen disponible' : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
