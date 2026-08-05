import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

void main() => runApp(const EllipseDeskApp());

class EllipseDeskApp extends StatelessWidget {
  const EllipseDeskApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'ELLIPSE DESK',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.black,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF6F6F4),
        textTheme: GoogleFonts.poppinsTextTheme(),
        useMaterial3: true,
      ),
      home: const AppShell(),
    );
  }
}

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _selectedIndex = 0;

  static const _destinations = [
    _NavDestination(label: 'Home', icon: Iconsax.home_1),
    _NavDestination(label: 'Approvals', icon: Iconsax.clipboard_tick),
    _NavDestination(label: 'Inbox', icon: Iconsax.direct_inbox),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Text(
            _destinations[_selectedIndex].label,
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: _BottomNavBar(
                destinations: _destinations,
                selectedIndex: _selectedIndex,
                onSelected: (index) => setState(() => _selectedIndex = index),
              ),
            ),
            const SizedBox(width: 12),
            _IvyButton(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Ivy is ready to help.')),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomNavBar extends StatelessWidget {
  const _BottomNavBar({
    required this.destinations,
    required this.selectedIndex,
    required this.onSelected,
  });

  final List<_NavDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 68,
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(34),
        border: Border.all(color: const Color(0xFFE9E9E6)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 24,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: List.generate(destinations.length, (index) {
          final destination = destinations[index];
          final selected = selectedIndex == index;

          return Expanded(
            child: Semantics(
              selected: selected,
              button: true,
              label: destination.label,
              child: InkWell(
                onTap: () => onSelected(index),
                borderRadius: BorderRadius.circular(28),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOut,
                  decoration: BoxDecoration(
                    color: selected
                        ? const Color(0xFFF0F0EE)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(28),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        destination.icon,
                        size: 24,
                        color: selected
                            ? Colors.black
                            : const Color(0xFFAAA9A5),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        destination.label,
                        maxLines: 1,
                        style: TextStyle(
                          color: selected
                              ? Colors.black
                              : const Color(0xFFAAA9A5),
                          fontSize: 11,
                          fontWeight: selected
                              ? FontWeight.w600
                              : FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _IvyButton extends StatelessWidget {
  const _IvyButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Open Ivy',
      child: Material(
        color: Colors.transparent,
        shape: const CircleBorder(),
        child: InkWell(
          onTap: onPressed,
          customBorder: const CircleBorder(),
          child: const SizedBox.square(
            dimension: 68,
            child: Center(child: IvyOrb(size: 62)),
          ),
        ),
      ),
    );
  }
}

class IvyOrb extends StatefulWidget {
  const IvyOrb({super.key, this.size = 58});

  final double size;

  @override
  State<IvyOrb> createState() => _IvyOrbState();
}

class _IvyOrbState extends State<IvyOrb> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 24),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = widget.size;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final phase = _controller.value;
        final wave = math.sin(phase * math.pi * 2);

        return Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const RadialGradient(
              center: Alignment(-0.35, -0.45),
              radius: 1.1,
              colors: [
                Color(0xFFFFFFFF),
                Color(0xFFEEF3FB),
                Color(0xFFDBE6F6),
                Color(0xFFCDD9EE),
              ],
              stops: [0, 0.42, 0.74, 1],
            ),
            border: Border.all(color: Colors.white.withValues(alpha: 0.65)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x477096BE),
                blurRadius: 16,
                offset: Offset(0, 6),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Transform.rotate(
            angle: phase * math.pi * 2,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  left: -size * 0.3,
                  top: -size * 0.3,
                  width: size * 1.6,
                  height: size * 1.6,
                  child: ImageFiltered(
                    imageFilter: ui.ImageFilter.blur(
                      sigmaX: size * 0.12,
                      sigmaY: size * 0.12,
                    ),
                    child: Transform.rotate(
                      angle: phase * (24 / 7) * math.pi * 2,
                      child: const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: RadialGradient(
                            radius: 0.62,
                            colors: [Color(0xF23884FF), Color(0x003884FF)],
                            stops: [0, 0.7],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: -size * 0.2,
                  top: -size * 0.2,
                  width: size * 1.4,
                  height: size * 1.4,
                  child: ImageFiltered(
                    imageFilter: ui.ImageFilter.blur(
                      sigmaX: size * 0.1,
                      sigmaY: size * 0.1,
                    ),
                    child: Transform.rotate(
                      angle: -phase * (24 / 9) * math.pi * 2,
                      child: const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: RadialGradient(
                            center: Alignment(0.35, -0.2),
                            radius: 0.58,
                            colors: [Color(0xD878BEFF), Color(0x0078BEFF)],
                            stops: [0, 0.65],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: -size * 0.1,
                  top: size * (0.52 - wave * 0.03),
                  width: size * 1.2,
                  height: size * 0.34,
                  child: ImageFiltered(
                    imageFilter: ui.ImageFilter.blur(
                      sigmaX: size * 0.04,
                      sigmaY: size * 0.04,
                    ),
                    child: Transform.rotate(
                      angle: (-8 + wave * 7) * math.pi / 180,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.all(Radius.circular(size)),
                          gradient: const LinearGradient(
                            colors: [
                              Color(0x005AA0FF),
                              Color(0xF2468CFF),
                              Color(0xE696CDFF),
                              Color(0x005AA0FF),
                            ],
                            stops: [0, 0.45, 0.6, 1],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: size * 0.05,
                  top: size * (0.56 - wave * 0.03),
                  width: size * 0.9,
                  height: size * 0.14,
                  child: Transform.rotate(
                    angle: (-8 + wave * 7) * math.pi / 180,
                    child: CustomPaint(painter: const _IvyWaveLinesPainter()),
                  ),
                ),
                Positioned(
                  left: size * (0.1 + wave * 0.02),
                  top: size * (0.04 + wave * 0.015),
                  width: size * 0.58,
                  height: size * 0.4,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.all(Radius.circular(size)),
                      gradient: RadialGradient(
                        colors: [
                          Colors.white.withValues(alpha: 0.9),
                          Colors.white.withValues(alpha: 0),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _IvyWaveLinesPainter extends CustomPainter {
  const _IvyWaveLinesPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..strokeWidth = 1
      ..strokeCap = StrokeCap.round;
    for (double x = 0; x <= size.width; x += 5) {
      final distance = ((x / size.width) - 0.55).abs() / 0.55;
      paint.color = Colors.white.withValues(
        alpha: (0.7 * (1 - distance)).clamp(0, 0.7),
      );
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _NavDestination {
  const _NavDestination({required this.label, required this.icon});

  final String label;
  final IconData icon;
}
