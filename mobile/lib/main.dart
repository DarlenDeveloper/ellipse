import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const EllipseDeskApp());
}

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

    setState(() => _loading = true);
    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: _emailController.text.trim(),
        password: _passwordController.text,
      );
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(builder: (context) => const AppShell()),
        (route) => false,
      );
    } on FirebaseAuthException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = switch (error.code) {
          'invalid-credential' ||
          'wrong-password' ||
          'user-not-found' => 'The email or password is incorrect.',
          'too-many-requests' =>
            'Too many attempts. Please wait and try again.',
          'network-request-failed' => 'Check your connection and try again.',
          _ => 'Sign in could not be completed. Please try again.',
        };
      });
      _passwordFocus.requestFocus();
    }
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
                                        ? Iconsax.eye
                                        : Iconsax.eye_slash,
                                    size: 21,
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
    _NavDestination(label: 'Chat', icon: Iconsax.messages_3),
    _NavDestination(label: 'Inbox', icon: Iconsax.direct_inbox),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      body: _selectedIndex == 0
          ? const _HomeDashboard()
          : SafeArea(
              child: Center(
                child: Text(
                  _destinations[_selectedIndex].label,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
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

class _HomeDashboard extends StatefulWidget {
  const _HomeDashboard();

  @override
  State<_HomeDashboard> createState() => _HomeDashboardState();
}

class _HomeDashboardState extends State<_HomeDashboard> {
  Map<String, dynamic>? _dashboard;
  String? _error;
  String _displayName = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) throw StateError('You are not signed in.');
      final userSnapshot = await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .get();
      final profile = userSnapshot.data();
      final enterpriseId = profile?['enterprise_id'] as String?;
      if (enterpriseId == null || enterpriseId.isEmpty) {
        throw StateError('Your account is not connected to an organisation.');
      }
      final result = await FirebaseFunctions.instanceFor(region: 'us-central1')
          .httpsCallable('getDashboardData')
          .call<Map<String, dynamic>>({'enterpriseId': enterpriseId});
      if (!mounted) return;
      setState(() {
        _dashboard = result.data;
        _displayName = (profile?['display_name'] as String?)?.trim() ?? '';
        if (_displayName.isEmpty) {
          _displayName = user.displayName?.trim() ?? '';
        }
        if (_displayName.isEmpty) {
          _displayName = user.email?.split('@').first ?? 'there';
        }
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error is StateError
            ? error.message
            : 'Your workspace could not be loaded. Pull to try again.';
      });
    }
  }

  String get _greeting {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  Map<String, dynamic> get _counts =>
      Map<String, dynamic>.from(_dashboard?['counts'] as Map? ?? const {});

  List<Map<String, dynamic>> get _approvals =>
      ((_dashboard?['pendingApprovals'] as List?) ?? const [])
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();

  List<Map<String, dynamic>> get _threads =>
      ((_dashboard?['recentThreads'] as List?) ?? const [])
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();

  String _count(String key) {
    if (_loading) return '—';
    final value = _counts[key];
    return value is num ? value.toInt().toString() : '0';
  }

  String _actionLabel(String? value) {
    final words = (value ?? 'Action').replaceAll('_', ' ');
    return '${words[0].toUpperCase()}${words.substring(1)}';
  }

  String _agentLabel(String? value) {
    return (value ?? 'Agent')
        .replaceAll('-agent', '')
        .split('-')
        .map((word) => '${word[0].toUpperCase()}${word.substring(1)}')
        .join(' ');
  }

  String _integrationAsset(String? value) {
    final key = (value ?? '').toLowerCase();
    if (key.contains('zoho')) return 'assets/images/integration-zoho.png';
    if (key.contains('whatsapp')) {
      return 'assets/images/integration-whatsapp.png';
    }
    if (key.contains('microsoft') || key.contains('outlook')) {
      return 'assets/images/integration-outlook.png';
    }
    if (key.contains('smtp')) return 'assets/images/integration-smtp.png';
    if (key.contains('mercury')) {
      return 'assets/images/integration-mercury.png';
    }
    return 'assets/images/integration-gmail.png';
  }

  String _timeLabel(String? value) {
    final date = DateTime.tryParse(value ?? '')?.toLocal();
    if (date == null) return '';
    final now = DateTime.now();
    if (date.year == now.year &&
        date.month == now.month &&
        date.day == now.day) {
      final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
      return '$hour:${date.minute.toString().padLeft(2, '0')} ${date.hour >= 12 ? 'PM' : 'AM'}';
    }
    return '${date.day}/${date.month}';
  }

  String get _initials {
    final parts = _displayName.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return 'ED';
    return parts.take(2).map((part) => part[0].toUpperCase()).join();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: _loadDashboard,
        color: const Color(0xFF1D2825),
        edgeOffset: 12,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(22, 22, 22, 112),
              sliver: SliverList.list(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _greeting,
                              style: GoogleFonts.poppins(
                                color: const Color(0xFFAAA9A5),
                                fontSize: 17,
                                fontWeight: FontWeight.w500,
                                height: 1.2,
                              ),
                            ),
                            Text(
                              '${_displayName.isEmpty ? 'Welcome' : _displayName}!',
                              style: GoogleFonts.poppins(
                                color: const Color(0xFF111311),
                                fontSize: 24,
                                fontWeight: FontWeight.w700,
                                height: 1.22,
                                letterSpacing: -0.7,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        width: 54,
                        height: 54,
                        decoration: const BoxDecoration(
                          color: Color(0xFF1D2825),
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          _initials,
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 32),
                  Row(
                    children: [
                      Text(
                        'Workspace overview',
                        style: GoogleFonts.poppins(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          letterSpacing: -0.3,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: _MetricCard(
                          label: 'Messages',
                          value: _count('messages'),
                          caption: 'all time',
                          icon: Iconsax.message_2,
                          visual: _MetricVisual.ring,
                          accent: Color(0xFF4E8D72),
                          trend: '+12%',
                          loading: _loading,
                        ),
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: _MetricCard(
                          label: 'Open threads',
                          value: _count('threads'),
                          caption: 'active',
                          icon: Iconsax.routing,
                          visual: _MetricVisual.ringLow,
                          accent: Color(0xFF527CA8),
                          trend: '+8%',
                          loading: _loading,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: _MetricCard(
                          label: 'Pending',
                          value: _count('pending'),
                          caption: 'actions',
                          icon: Iconsax.clock,
                          visual: _MetricVisual.bars,
                          accent: Color(0xFFB47A35),
                          trend: 'Today',
                          loading: _loading,
                        ),
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: _MetricCard(
                          label: 'Active agents',
                          value: _count('agents'),
                          caption: 'connected',
                          icon: Iconsax.cpu,
                          visual: _MetricVisual.line,
                          accent: Color(0xFF8068A5),
                          trend: '+3',
                          loading: _loading,
                        ),
                      ),
                    ],
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 18),
                    _DashboardError(message: _error!, onRetry: _loadDashboard),
                  ],
                  const SizedBox(height: 30),
                  _SectionHeader(title: 'Pending approvals', onTap: () {}),
                  const SizedBox(height: 12),
                  if (_loading)
                    const _DashboardListSkeleton(rows: 3)
                  else if (_approvals.isEmpty)
                    const _DashboardEmpty(
                      label: 'No actions waiting for approval.',
                    )
                  else
                    _HomeListCard(
                      children: List.generate(_approvals.length, (index) {
                        final item = _approvals[index];
                        final agent = item['agent_id'] as String?;
                        final system = item['target_system'] as String?;
                        return _ApprovalRow(
                          asset: _integrationAsset(agent ?? system),
                          title: _actionLabel(item['action_type'] as String?),
                          subtitle:
                              '${_agentLabel(agent)} Agent · ${_timeLabel(item['created_at'] as String?)}',
                          isLast: index == _approvals.length - 1,
                        );
                      }),
                    ),
                  const SizedBox(height: 28),
                  _SectionHeader(title: 'Recent threads', onTap: () {}),
                  const SizedBox(height: 12),
                  if (!_loading && _threads.isEmpty)
                    const _DashboardEmpty(label: 'No recent customer threads.')
                  else if (_loading)
                    const _DashboardListSkeleton(rows: 2)
                  else
                    _HomeListCard(
                      children: List.generate(_threads.length, (index) {
                        final item = _threads[index];
                        final channel = item['channel'] as String?;
                        return _ThreadRow(
                          asset: _integrationAsset(channel),
                          title:
                              (item['subject'] as String?)?.trim().isNotEmpty ==
                                  true
                              ? item['subject'] as String
                              : '(no subject)',
                          subtitle:
                              '${item['customer_ref'] ?? 'Unknown customer'} · ${_agentLabel(channel)}',
                          time: _timeLabel(item['last_message_at'] as String?),
                          isLast: index == _threads.length - 1,
                        );
                      }),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashboardError extends StatelessWidget {
  const _DashboardError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFEDEA),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              message,
              style: GoogleFonts.poppins(
                color: const Color(0xFF8C2F27),
                fontSize: 11.5,
              ),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

class _DashboardEmpty extends StatelessWidget {
  const _DashboardEmpty({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          label,
          style: GoogleFonts.poppins(
            color: const Color(0xFF999994),
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}

class _DashboardListSkeleton extends StatelessWidget {
  const _DashboardListSkeleton({required this.rows});

  final int rows;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        rows,
        (index) => Container(
          padding: const EdgeInsets.symmetric(vertical: 15),
          decoration: BoxDecoration(
            border: index == rows - 1
                ? null
                : const Border(bottom: BorderSide(color: Color(0xFFF0F0ED))),
          ),
          child: const Row(
            children: [
              _SkeletonBlock(width: 32, height: 32, radius: 10),
              SizedBox(width: 18),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _SkeletonBlock(width: 132, height: 13, radius: 7),
                    SizedBox(height: 9),
                    _SkeletonBlock(width: 178, height: 10, radius: 6),
                  ],
                ),
              ),
              SizedBox(width: 12),
              _SkeletonBlock(width: 58, height: 28, radius: 14),
            ],
          ),
        ),
      ),
    );
  }
}

class _SkeletonBlock extends StatelessWidget {
  const _SkeletonBlock({
    required this.width,
    required this.height,
    required this.radius,
  });

  final double width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: const Color(0xFFE3E3DF),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

enum _MetricVisual { ring, ringLow, bars, line }

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.caption,
    required this.icon,
    required this.visual,
    required this.accent,
    required this.trend,
    required this.loading,
  });

  final String label;
  final String value;
  final String caption;
  final IconData icon;
  final _MetricVisual visual;
  final Color accent;
  final String trend;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 166,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFEEEDEA),
        borderRadius: BorderRadius.circular(28),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 21, color: const Color(0xFF171917)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    letterSpacing: -0.25,
                  ),
                ),
              ),
            ],
          ),
          const Spacer(),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (loading)
                      const _SkeletonBlock(width: 64, height: 28, radius: 7)
                    else
                      Text(
                        value,
                        style: GoogleFonts.poppins(
                          fontSize: 28,
                          height: 1,
                          fontWeight: FontWeight.w600,
                          letterSpacing: -1,
                        ),
                      ),
                    const SizedBox(height: 6),
                    Text(
                      caption,
                      style: GoogleFonts.poppins(
                        color: const Color(0xFF8A8A86),
                        fontSize: 12,
                        height: 1,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 7,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      loading ? '      ' : trend,
                      style: GoogleFonts.poppins(
                        color: accent,
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox.square(
                    dimension: 50,
                    child: TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0, end: loading ? 0.15 : 1),
                      duration: const Duration(milliseconds: 900),
                      curve: Curves.easeOutCubic,
                      builder: (context, progress, child) => CustomPaint(
                        painter: _MetricPainter(visual, accent, progress),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MetricPainter extends CustomPainter {
  const _MetricPainter(this.visual, this.accent, this.progress);

  final _MetricVisual visual;
  final Color accent;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final dark = Paint()
      ..color = accent
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    final light = Paint()
      ..color = const Color(0xFFD3D2CF)
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    if (visual == _MetricVisual.ring || visual == _MetricVisual.ringLow) {
      final rect = Rect.fromLTWH(5, 5, size.width - 10, size.height - 10);
      canvas.drawArc(rect, 0, math.pi * 2, false, light);
      canvas.drawArc(
        rect,
        -math.pi / 2,
        math.pi * (visual == _MetricVisual.ring ? 1.45 : 0.86) * progress,
        false,
        dark,
      );
      return;
    }

    if (visual == _MetricVisual.bars) {
      final heights = [22.0, 34.0, 43.0, 29.0, 48.0, 38.0];
      for (var index = 0; index < heights.length; index++) {
        final paint = Paint()
          ..color = index == 3
              ? const Color(0xFF171917)
              : const Color(0xFFD3D2CF)
          ..strokeWidth = 6
          ..strokeCap = StrokeCap.round;
        final x = 5.0 + index * 9;
        final animatedHeight = heights[index] * progress;
        canvas.drawLine(
          Offset(x, size.height - 3),
          Offset(x, size.height - animatedHeight),
          paint,
        );
      }
      return;
    }

    final path = Path()
      ..moveTo(2, 46)
      ..cubicTo(10, 44, 9, 27, 18, 29)
      ..cubicTo(27, 32, 27, 11, 36, 12)
      ..cubicTo(45, 13, 43, 29, 52, 25);
    final metrics = path.computeMetrics().toList();
    if (metrics.isNotEmpty) {
      final metric = metrics.first;
      canvas.drawPath(
        metric.extractPath(0, metric.length * progress),
        dark..strokeWidth = 3.4,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _MetricPainter oldDelegate) =>
      oldDelegate.visual != visual ||
      oldDelegate.accent != accent ||
      oldDelegate.progress != progress;
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.onTap});

  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.3,
            ),
          ),
        ),
        TextButton(
          onPressed: onTap,
          child: Text(
            'View all',
            style: GoogleFonts.poppins(
              color: const Color(0xFF858580),
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class _HomeListCard extends StatelessWidget {
  const _HomeListCard({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(children: children);
  }
}

class _ApprovalRow extends StatelessWidget {
  const _ApprovalRow({
    required this.asset,
    required this.title,
    required this.subtitle,
    this.isLast = false,
  });

  final String asset;
  final String title;
  final String subtitle;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 15),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : const Border(bottom: BorderSide(color: Color(0xFFF0F0ED))),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            child: Image.asset(
              asset,
              width: 32,
              height: 32,
              fit: BoxFit.contain,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: GoogleFonts.poppins(
                    color: const Color(0xFF999994),
                    fontSize: 10.5,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: const Color(0xFFF1F1EE),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              'Review',
              style: GoogleFonts.poppins(
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ThreadRow extends StatelessWidget {
  const _ThreadRow({
    required this.asset,
    required this.title,
    required this.subtitle,
    required this.time,
    this.isLast = false,
  });

  final String asset;
  final String title;
  final String subtitle;
  final String time;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 15),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : const Border(bottom: BorderSide(color: Color(0xFFF0F0ED))),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 42,
            height: 42,
            child: Center(
              child: Image.asset(
                asset,
                width: 30,
                height: 30,
                fit: BoxFit.contain,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.poppins(
                    color: const Color(0xFF999994),
                    fontSize: 10.5,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            time,
            style: GoogleFonts.poppins(
              color: const Color(0xFFA5A5A0),
              fontSize: 10,
            ),
          ),
        ],
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
