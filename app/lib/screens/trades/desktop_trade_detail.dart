import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/symbol_formatter.dart';
import '../../widgets/widgets.dart';
import 'position_detail_controller.dart';
import 'trade_detail_sections.dart';

class DesktopTradeDetail extends StatefulWidget {
  final Map<String, dynamic> trade;
  final bool isClosed;

  const DesktopTradeDetail({super.key, required this.trade, this.isClosed = false});

  @override
  State<DesktopTradeDetail> createState() => _DesktopTradeDetailState();
}

class _DesktopTradeDetailState extends State<DesktopTradeDetail> {
  late final PositionDetailController _controller;

  @override
  void initState() {
    super.initState();
    _controller = PositionDetailController(widget.trade, isClosed: widget.isClosed)..addListener(_onChanged);
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _controller.removeListener(_onChanged);
    _controller.dispose();
    super.dispose();
  }

  void _goBack(BuildContext context) {
    if (context.canPop()) {
      context.pop();
      return;
    }
    final currentUrl = GoRouterState.of(context).uri.toString();
    context.go(currentUrl.contains('history') ? '/history' : '/dashboard');
  }

  @override
  Widget build(BuildContext context) {
    final signalId = _controller.signalId;

    return Scaffold(
      backgroundColor: DsColors.background,
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.huger, AppSpacing.xxl, AppSpacing.huger, AppSpacing.huger),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => _goBack(context)),
                const SizedBox(width: AppSpacing.sm),
                Text(fmtSymbol(_controller.symbol), style: AppTextStyles.title.copyWith(color: DsColors.textPrimary)),
                const SizedBox(width: AppSpacing.sm),
                DirectionTag(isLong: _controller.isLong),
                const SizedBox(width: AppSpacing.sm),
                StatusPill(widget.isClosed ? StatusPillVariant.desactivada : StatusPillVariant.activa, label: widget.isClosed ? 'Cerrada' : 'Abierta'),
              ],
            ),
            const SizedBox(height: AppSpacing.xl),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 7,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      buildResultSection(_controller),
                      const SizedBox(height: AppSpacing.lg),
                      buildExitRangeSection(_controller),
                      if (!widget.isClosed) ...[
                        const SizedBox(height: AppSpacing.lg),
                        buildProtectionSection(_controller),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.xl),
                Expanded(
                  flex: 5,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      buildDetailsSection(_controller),
                      const SizedBox(height: AppSpacing.lg),
                      buildOriginSignalSection(
                        _controller,
                        signalId == null ? null : () => context.push('/dashboard/signal/$signalId', extra: widget.trade),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
