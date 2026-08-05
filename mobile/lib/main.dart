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
      home: const OnboardingScreen(),
    );
  }
}

class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  void _continue(BuildContext context) {
    Navigator.of(context).pushReplacement(
      PageRouteBuilder<void>(
        pageBuilder: (context, animation, secondaryAnimation) =>
            const AppShell(),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return FadeTransition(
            opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
            child: child,
          );
        },
        transitionDuration: const Duration(milliseconds: 420),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF07161F),
      body: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(
            'assets/images/onboarding-background.jpeg',
            fit: BoxFit.cover,
            alignment: Alignment.topCenter,
          ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0x52020B11),
                  Color(0x05020B11),
                  Color(0x20020B11),
                  Color(0xD9061118),
                ],
                stops: [0, 0.28, 0.62, 1],
              ),
            ),
          ),
          SafeArea(
            minimum: const EdgeInsets.fromLTRB(28, 24, 28, 30),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final compact = constraints.maxHeight < 700;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Spacer(flex: 5),
                    Text(
                      'Everything your\nteam needs, together.',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: compact ? 34 : 38,
                        height: 1.22,
                        fontWeight: FontWeight.w500,
                        letterSpacing: -1.15,
                        shadows: const [
                          Shadow(
                            color: Color(0x52000000),
                            blurRadius: 18,
                            offset: Offset(0, 3),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Work, approvals, and conversations —\norganized around your business.',
                      style: GoogleFonts.poppins(
                        color: Colors.white.withValues(alpha: 0.78),
                        fontSize: compact ? 14 : 15,
                        height: 1.5,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                    SizedBox(height: compact ? 34 : 42),
                    _OnboardingButton(onPressed: () => _continue(context)),
                    const SizedBox(height: 24),
                    Align(
                      alignment: Alignment.center,
                      child: TextButton(
                        onPressed: () {
                          Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (context) => const SignInScreen(),
                            ),
                          );
                        },
                        style: TextButton.styleFrom(
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                        ),
                        child: Text(
                          'I already have an account',
                          style: GoogleFonts.poppins(
                            color: Colors.white.withValues(alpha: 0.92),
                            fontSize: 14,
                            fontWeight: FontWeight.w400,
                            decoration: TextDecoration.underline,
                            decorationColor: Colors.white.withValues(
                              alpha: 0.92,
                            ),
                            decorationThickness: 1,
                          ),
                        ),
                      ),
                    ),
                    const Spacer(flex: 1),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _OnboardingButton extends StatelessWidget {
  const _OnboardingButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Get started',
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(32),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPressed,
          child: Container(
            height: 64,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(32),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.55),
                width: 7,
                strokeAlign: BorderSide.strokeAlignOutside,
              ),
            ),
            child: Text(
              'Get started',
              style: GoogleFonts.poppins(
                color: const Color(0xFF142B2C),
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();

  bool _showPasswordField = false;
  bool _obscurePassword = true;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _emailFocus.requestFocus(),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  bool get _hasValidEmail {
    return RegExp(
      r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
    ).hasMatch(_emailController.text.trim());
  }

  Future<bool> _accountExists(String email) async {
    await Future<void>.delayed(const Duration(milliseconds: 550));
    return true;
  }

  Future<void> _continue() async {
    FocusScope.of(context).unfocus();
    setState(() => _error = null);

    if (!_showPasswordField) {
      if (!_hasValidEmail) {
        setState(() => _error = 'Enter a valid work email to continue.');
        _emailFocus.requestFocus();
        return;
      }

      setState(() => _loading = true);
      final exists = await _accountExists(_emailController.text.trim());
      if (!mounted) return;
      setState(() {
        _loading = false;
        _showPasswordField = exists;
        _error = exists ? null : 'We could not find an account for this email.';
      });
      if (exists) {
        await Future<void>.delayed(const Duration(milliseconds: 180));
        _passwordFocus.requestFocus();
      }
      return;
    }

    if (_passwordController.text.isEmpty) {
      setState(() => _error = 'Enter your password to sign in.');
      _passwordFocus.requestFocus();
      return;
    }

    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(builder: (context) => const AppShell()),
      (route) => false,
    );
  }

  void _changeEmail() {
    setState(() {
      _showPasswordField = false;
      _passwordController.clear();
      _error = null;
    });
    _emailFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: const Color(0xFF061219),
      body: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(
            'assets/images/onboarding-background.jpeg',
            fit: BoxFit.cover,
            alignment: Alignment.topCenter,
            color: const Color(0xFF061219).withValues(alpha: 0.62),
            colorBlendMode: BlendMode.srcOver,
          ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xB8061219), Color(0xED061219)],
              ),
            ),
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                28,
                18,
                28,
                28 + MediaQuery.viewInsetsOf(context).bottom * 0.08,
              ),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight:
                      MediaQuery.sizeOf(context).height -
                      MediaQuery.paddingOf(context).vertical -
                      46,
                ),
                child: Column(
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: IconButton(
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.arrow_back_rounded),
                        color: Colors.white,
                        iconSize: 27,
                      ),
                    ),
                    const SizedBox(height: 66),
                    const Icon(
                      Icons.business_rounded,
                      color: Colors.white,
                      size: 72,
                    ),
                    const SizedBox(height: 28),
                    Text(
                      _showPasswordField
                          ? 'Welcome back'
                          : 'Sign in to your\norganisation',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 27,
                        fontWeight: FontWeight.w600,
                        letterSpacing: -0.7,
                      ),
                    ),
                    const SizedBox(height: 8),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 220),
                      child: Text(
                        _showPasswordField
                            ? 'Enter your password to continue'
                            : 'Enter your work email to continue',
                        key: ValueKey(_showPasswordField),
                        style: GoogleFonts.poppins(
                          color: Colors.white.withValues(alpha: 0.58),
                          fontSize: 13,
                        ),
                      ),
                    ),
                    const SizedBox(height: 42),
                    _AuthTextField(
                      controller: _emailController,
                      focusNode: _emailFocus,
                      label: 'Email address',
                      hint: 'you@company.com',
                      keyboardType: TextInputType.emailAddress,
                      readOnly: _showPasswordField,
                      suffix: _showPasswordField
                          ? TextButton(
                              onPressed: _changeEmail,
                              child: const Text('Change'),
                            )
                          : null,
                      onSubmitted: (_) => _continue(),
                    ),
                    AnimatedSize(
                      duration: const Duration(milliseconds: 280),
                      curve: Curves.easeOutCubic,
                      child: _showPasswordField
                          ? Padding(
                              padding: const EdgeInsets.only(top: 18),
                              child: _AuthTextField(
                                controller: _passwordController,
                                focusNode: _passwordFocus,
                                label: 'Password',
                                hint: 'Enter your password',
                                obscureText: _obscurePassword,
                                suffix: IconButton(
                                  onPressed: () => setState(
                                    () => _obscurePassword = !_obscurePassword,
                                  ),
                                  icon: Icon(
                                    _obscurePassword
                                        ? Icons.visibility_outlined
                                        : Icons.visibility_off_outlined,
                                  ),
                                  color: Colors.white.withValues(alpha: 0.6),
                                ),
                                onSubmitted: (_) => _continue(),
                              ),
                            )
                          : const SizedBox.shrink(),
                    ),
                    AnimatedSize(
                      duration: const Duration(milliseconds: 180),
                      child: _error == null
                          ? const SizedBox(height: 24)
                          : Padding(
                              padding: const EdgeInsets.only(
                                top: 12,
                                bottom: 8,
                              ),
                              child: Align(
                                alignment: Alignment.centerLeft,
                                child: Text(
                                  _error!,
                                  style: GoogleFonts.poppins(
                                    color: const Color(0xFFFFB4AB),
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                            ),
                    ),
                    SizedBox(
                      width: double.infinity,
                      height: 58,
                      child: FilledButton(
                        onPressed: _loading ? null : _continue,
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: const Color(0xFF142B2C),
                          disabledBackgroundColor: Colors.white.withValues(
                            alpha: 0.7,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(29),
                          ),
                        ),
                        child: _loading
                            ? const SizedBox.square(
                                dimension: 21,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Color(0xFF142B2C),
                                ),
                              )
                            : Text(
                                _showPasswordField ? 'Sign in' : 'Continue',
                                style: GoogleFonts.poppins(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                      ),
                    ),
                    if (_showPasswordField) ...[
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: () {},
                        child: Text(
                          'Forgot password?',
                          style: GoogleFonts.poppins(
                            color: Colors.white.withValues(alpha: 0.76),
                            fontSize: 13,
                            decoration: TextDecoration.underline,
                            decorationColor: Colors.white.withValues(
                              alpha: 0.76,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AuthTextField extends StatelessWidget {
  const _AuthTextField({
    required this.controller,
    required this.focusNode,
    required this.label,
    required this.hint,
    required this.onSubmitted,
    this.keyboardType,
    this.obscureText = false,
    this.readOnly = false,
    this.suffix,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final String label;
  final String hint;
  final ValueChanged<String> onSubmitted;
  final TextInputType? keyboardType;
  final bool obscureText;
  final bool readOnly;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      focusNode: focusNode,
      keyboardType: keyboardType,
      obscureText: obscureText,
      readOnly: readOnly,
      autofillHints: obscureText
          ? const [AutofillHints.password]
          : const [AutofillHints.email],
      textInputAction: obscureText
          ? TextInputAction.done
          : TextInputAction.next,
      style: GoogleFonts.poppins(color: Colors.white, fontSize: 15),
      cursorColor: Colors.white,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        suffixIcon: suffix,
        labelStyle: GoogleFonts.poppins(
          color: Colors.white.withValues(alpha: 0.6),
          fontSize: 13,
        ),
        hintStyle: GoogleFonts.poppins(
          color: Colors.white.withValues(alpha: 0.3),
          fontSize: 14,
        ),
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.07),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 20,
          vertical: 19,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(32),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.14)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(32),
          borderSide: BorderSide.none,
        ),
        disabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(32),
          borderSide: BorderSide.none,
        ),
      ),
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
