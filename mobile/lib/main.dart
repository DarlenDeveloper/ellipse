import 'dart:convert';
import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'firebase_options.dart';
import 'ivy_screen.dart';

String _emailBodyToText(String input) {
  var text = input.replaceAll(RegExp(r'\r\n?'), '\n');
  for (final tag in ['style', 'script', 'head']) {
    text = text.replaceAll(
      RegExp('<$tag[\\s\\S]*?</$tag>', caseSensitive: false),
      '',
    );
  }
  text = text.replaceAll(RegExp(r'<!--[\s\S]*?-->'), '');
  text = text.replaceAllMapped(
    RegExp(
      r'''<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)</a>''',
      caseSensitive: false,
    ),
    (match) {
      final href = (match.group(1) ?? '').replaceAll('&amp;', '&').trim();
      final label = (match.group(2) ?? '')
          .replaceAll(RegExp(r'<[^>]+>'), '')
          .trim();
      if (!RegExp(
        r'^(https?://|mailto:)',
        caseSensitive: false,
      ).hasMatch(href)) {
        return label;
      }
      return label.isNotEmpty && label != href ? '$label ($href)' : href;
    },
  );
  text = text.replaceAll(
    RegExp(
      r'<(br|/p|/div|/tr|/li|/h[1-6]|/table)\b[^>]*>',
      caseSensitive: false,
    ),
    '\n',
  );
  text = text.replaceAll(RegExp(r'<[^>]+>'), '');
  text = text.replaceAll(RegExp(r'[.#]?[\w-]+(?:::?[\w-]+)?\s*\{[^{}]*\}'), '');
  text = text
      .replaceAll(RegExp('&nbsp;', caseSensitive: false), ' ')
      .replaceAll(RegExp('&amp;', caseSensitive: false), '&')
      .replaceAll(RegExp('&lt;', caseSensitive: false), '<')
      .replaceAll(RegExp('&gt;', caseSensitive: false), '>')
      .replaceAll(RegExp('&quot;', caseSensitive: false), '"')
      .replaceAll(RegExp(r'&#39;|&apos;', caseSensitive: false), "'");
  text = text.replaceAllMapped(RegExp(r'&#(\d+);'), (match) {
    final code = int.tryParse(match.group(1) ?? '');
    return code == null ? '' : String.fromCharCode(code);
  });
  return text
      .replaceAll(RegExp(r'[\u200B-\u200D\u2060\uFEFF]'), '')
      .replaceAll(RegExp(r'[ \t]+\n'), '\n')
      .replaceAll(RegExp(r'\n[ \t]+'), '\n')
      .replaceAll(RegExp(r'[ \t]{2,}'), ' ')
      .replaceAll(RegExp(r'\n{3,}'), '\n\n')
      .trim();
}

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
  int? _pendingApprovalCount;
  int _unreadChatCount = 0;
  int _unreadInboxCount = 0;
  late final List<Widget> _pages;

  static const _destinations = [
    _NavDestination(label: 'Home', icon: Iconsax.home_1),
    _NavDestination(label: 'Approvals', icon: Iconsax.clipboard_tick),
    _NavDestination(label: 'Chat', icon: Iconsax.messages_3),
    _NavDestination(label: 'Inbox', icon: Iconsax.direct_inbox),
  ];

  @override
  void initState() {
    super.initState();
    _pages = [
      _HomeDashboard(onPendingCountChanged: _setPendingApprovalCount),
      _ApprovalsScreen(onPendingCountChanged: _setPendingApprovalCount),
      _ChatScreen(onUnreadCountChanged: _setUnreadChatCount),
      _InboxScreen(onUnreadCountChanged: _setUnreadInboxCount),
    ];
  }

  void _setPendingApprovalCount(int value) {
    if (mounted && _pendingApprovalCount != value) {
      setState(() => _pendingApprovalCount = value);
    }
  }

  void _setUnreadChatCount(int value) {
    if (mounted && _unreadChatCount != value) {
      setState(() => _unreadChatCount = value);
    }
  }

  void _setUnreadInboxCount(int value) {
    if (mounted && _unreadInboxCount != value) {
      setState(() => _unreadInboxCount = value);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      body: IndexedStack(index: _selectedIndex, children: _pages),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: _BottomNavBar(
                destinations: _destinations,
                selectedIndex: _selectedIndex,
                approvalBadge: _pendingApprovalCount,
                chatBadge: _unreadChatCount,
                inboxBadge: _unreadInboxCount,
                onSelected: (index) => setState(() => _selectedIndex = index),
              ),
            ),
            const SizedBox(width: 12),
            _IvyButton(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) => const IvyScreen(),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatScreen extends StatefulWidget {
  const _ChatScreen({required this.onUnreadCountChanged});

  final ValueChanged<int> onUnreadCountChanged;

  @override
  State<_ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<_ChatScreen> {
  static const _cacheDuration = Duration(minutes: 2);
  final _searchController = TextEditingController();
  final List<StreamSubscription<QuerySnapshot<Map<String, dynamic>>>>
  _subscriptions = [];
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>?
  _groupSubscription;

  List<Map<String, dynamic>> _directChats = [];
  List<Map<String, dynamic>> _members = [];
  Map<String, dynamic>? _groupChat;
  Map<String, int> _readAt = {};
  String _tab = 'All';
  String _search = '';
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() => _search = _searchController.text.trim().toLowerCase());
    });
    _openChatList();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _groupSubscription?.cancel();
    for (final subscription in _subscriptions) {
      subscription.cancel();
    }
    super.dispose();
  }

  Future<void> _openChatList() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    await _restoreCache(user.uid);
    try {
      final profile = await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .get();
      final enterpriseId = profile.data()?['enterprise_id'] as String?;
      if (enterpriseId == null) throw StateError('No organisation found.');

      _subscriptions.add(
        FirebaseFirestore.instance
            .collection('users')
            .where('enterprise_id', isEqualTo: enterpriseId)
            .snapshots()
            .listen(
              (snapshot) {
                if (!mounted) return;
                final members = snapshot.docs
                    .map((doc) => {'id': doc.id, ...doc.data()})
                    .where(
                      (member) =>
                          member['id'] != user.uid &&
                          (member['status'] ?? 'active') == 'active',
                    )
                    .toList();
                members.sort(
                  (a, b) => _memberName(a).compareTo(_memberName(b)),
                );
                setState(() {
                  _members = members;
                  _loading = false;
                });
                _saveCache(user.uid);
              },
              onError: (Object _) {
                if (mounted) {
                  setState(
                    () => _error = 'Organisation members could not be loaded.',
                  );
                }
              },
            ),
      );

      final groupResult = await FirebaseFunctions.instanceFor(
        region: 'us-central1',
      ).httpsCallable('ensureTeamChat').call<Map<String, dynamic>>({});
      final groupId = groupResult.data['chatId'] as String;
      _groupSubscription = FirebaseFirestore.instance
          .collection('internal_chats')
          .doc(groupId)
          .snapshots()
          .listen((snapshot) {
            if (!mounted || !snapshot.exists) return;
            setState(() {
              _groupChat = {'id': snapshot.id, ...snapshot.data()!};
              _loading = false;
            });
            _updateUnreadBadge();
            _saveCache(user.uid);
          });

      _subscriptions.add(
        FirebaseFirestore.instance
            .collection('internal_chats')
            .where('enterprise_id', isEqualTo: enterpriseId)
            .where('participant_uids', arrayContains: user.uid)
            .limit(30)
            .snapshots()
            .listen(
              (snapshot) {
                if (!mounted) return;
                final chats = snapshot.docs
                    .map((doc) => {'id': doc.id, ...doc.data()})
                    .where(
                      (chat) =>
                          chat['enterprise_id'] == enterpriseId &&
                          chat['type'] == 'direct',
                    )
                    .toList();
                chats.sort(
                  (a, b) => _millis(
                    b['last_message_at'],
                  ).compareTo(_millis(a['last_message_at'])),
                );
                setState(() {
                  _directChats = chats;
                  _loading = false;
                });
                _updateUnreadBadge();
                _saveCache(user.uid);
              },
              onError: (Object _) {
                if (mounted) {
                  setState(
                    () => _error = 'Direct conversations could not be loaded.',
                  );
                }
              },
            ),
      );

      _subscriptions.add(
        FirebaseFirestore.instance
            .collection('internal_chat_reads')
            .where('user_id', isEqualTo: user.uid)
            .where('enterprise_id', isEqualTo: enterpriseId)
            .limit(60)
            .snapshots()
            .listen(
              (snapshot) {
                if (!mounted) return;
                final reads = <String, int>{};
                for (final doc in snapshot.docs) {
                  final data = doc.data();
                  if (data['enterprise_id'] == enterpriseId) {
                    reads['${data['chat_id']}'] = _millis(data['read_at']);
                  }
                }
                setState(() => _readAt = reads);
                _updateUnreadBadge();
                _saveCache(user.uid);
              },
              onError: (Object _) {
                if (mounted) {
                  setState(
                    () => _error = 'Unread chat status could not be loaded.',
                  );
                }
              },
            ),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Team chat could not be opened.';
      });
    }
  }

  int _millis(dynamic value) {
    if (value is Timestamp) return value.millisecondsSinceEpoch;
    if (value is num) return value.toInt();
    return 0;
  }

  bool _isUnread(Map<String, dynamic> chat) {
    final user = FirebaseAuth.instance.currentUser;
    return _millis(chat['last_message_at']) > (_readAt[chat['id']] ?? 0) &&
        chat['last_sender_uid'] != user?.uid;
  }

  void _updateUnreadBadge() {
    final chats = [?_groupChat, ..._directChats];
    widget.onUnreadCountChanged(chats.where(_isUnread).length);
  }

  Future<void> _restoreCache(String uid) async {
    final preferences = await SharedPreferences.getInstance();
    final encoded = preferences.getString('ellipse_chat_list_$uid');
    if (encoded == null) return;
    try {
      final cached = Map<String, dynamic>.from(jsonDecode(encoded) as Map);
      if (DateTime.now().millisecondsSinceEpoch - (cached['savedAt'] as int) >=
          _cacheDuration.inMilliseconds) {
        await preferences.remove('ellipse_chat_list_$uid');
        return;
      }
      if (!mounted) return;
      setState(() {
        _groupChat = cached['group'] == null
            ? null
            : Map<String, dynamic>.from(cached['group'] as Map);
        _directChats = ((cached['direct'] as List?) ?? const [])
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
        _members = ((cached['members'] as List?) ?? const [])
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
        _readAt = Map<String, dynamic>.from(
          cached['reads'] as Map? ?? const {},
        ).map((key, value) => MapEntry(key, (value as num).toInt()));
        _loading = false;
      });
      _updateUnreadBadge();
    } catch (_) {
      await preferences.remove('ellipse_chat_list_$uid');
    }
  }

  Future<void> _saveCache(String uid) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      'ellipse_chat_list_$uid',
      jsonEncode({
        'savedAt': DateTime.now().millisecondsSinceEpoch,
        'group': _jsonSafe(_groupChat),
        'direct': _jsonSafe(_directChats),
        'members': _jsonSafe(_members),
        'reads': _readAt,
      }),
    );
  }

  dynamic _jsonSafe(dynamic value) {
    if (value is Timestamp) return value.millisecondsSinceEpoch;
    if (value is Map) {
      return value.map((key, item) => MapEntry('$key', _jsonSafe(item)));
    }
    if (value is Iterable) return value.map(_jsonSafe).toList();
    return value;
  }

  String _chatName(Map<String, dynamic> chat) {
    if (chat['type'] == 'group') return '${chat['name'] ?? 'Team Chat'}';
    if (chat['member_name'] != null) return '${chat['member_name']}';
    final uid = FirebaseAuth.instance.currentUser?.uid;
    final names = Map<String, dynamic>.from(
      chat['participant_names'] as Map? ?? const {},
    );
    final emails = Map<String, dynamic>.from(
      chat['participant_emails'] as Map? ?? const {},
    );
    final otherUid = (chat['participant_uids'] as List?)
        ?.map((value) => '$value')
        .where((value) => value != uid)
        .firstOrNull;
    return '${names[otherUid] ?? emails[otherUid] ?? 'Organisation member'}';
  }

  String _memberName(Map<String, dynamic> member) {
    return '${member['display_name'] ?? member['email'] ?? 'Member'}';
  }

  Map<String, dynamic>? _chatForMember(String uid) {
    return _directChats.cast<Map<String, dynamic>?>().firstWhere(
      (chat) => (chat?['participant_uids'] as List?)?.contains(uid) == true,
      orElse: () => null,
    );
  }

  String _time(dynamic value) {
    final milliseconds = _millis(value);
    if (milliseconds == 0) return '';
    final date = DateTime.fromMillisecondsSinceEpoch(milliseconds).toLocal();
    final now = DateTime.now();
    if (date.year == now.year &&
        date.month == now.month &&
        date.day == now.day) {
      final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
      return '$hour:${date.minute.toString().padLeft(2, '0')}';
    }
    final yesterday = now.subtract(const Duration(days: 1));
    if (date.year == yesterday.year &&
        date.month == yesterday.month &&
        date.day == yesterday.day) {
      return 'Yesterday';
    }
    return '${date.day}/${date.month}/${date.year.toString().substring(2)}';
  }

  List<Map<String, dynamic>> get _visibleChats {
    final memberRows = _members.map((member) {
      final existing = _chatForMember(member['id'] as String);
      return existing ??
          <String, dynamic>{
            'id': 'member_${member['id']}',
            'type': 'direct',
            'member_uid': member['id'],
            'member_name': _memberName(member),
            'member_email': member['email'],
          };
    });
    var chats = [?_groupChat, ...memberRows];
    if (_tab == 'Unread') chats = chats.where(_isUnread).toList();
    if (_tab == 'Groups') {
      chats = chats.where((chat) => chat['type'] == 'group').toList();
    }
    if (_search.isNotEmpty) {
      chats = chats
          .where(
            (chat) =>
                _chatName(chat).toLowerCase().contains(_search) ||
                '${chat['last_message'] ?? ''}'.toLowerCase().contains(_search),
          )
          .toList();
    }
    return chats;
  }

  Future<void> _openConversation(Map<String, dynamic> chat) async {
    var chatId = chat['id'] as String;
    if (chat['member_uid'] != null) {
      try {
        final result =
            await FirebaseFunctions.instanceFor(region: 'us-central1')
                .httpsCallable('startInternalChat')
                .call<Map<String, dynamic>>({'targetUid': chat['member_uid']});
        chatId = result.data['chatId'] as String;
      } catch (_) {
        if (mounted) {
          setState(() => _error = 'This conversation could not be opened.');
        }
        return;
      }
    }
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => _ConversationScreen(
          chatId: chatId,
          name: _chatName(chat),
          group: chat['type'] == 'group',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final chats = _visibleChats;
    final recent = chats
        .where(
          (chat) => chat['type'] == 'group' || chat['last_message_at'] != null,
        )
        .toList();
    final people = chats
        .where(
          (chat) => chat['type'] != 'group' && chat['last_message_at'] == null,
        )
        .toList();
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFF3F8FF), Color(0xFFF9FAFA), Color(0xFFF9F9F7)],
          stops: [0, .3, 1],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: CustomScrollView(
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(22, 24, 22, 118),
              sliver: SliverList.list(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Chat',
                          style: GoogleFonts.poppins(
                            fontSize: 29,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.9,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  TextField(
                    controller: _searchController,
                    style: GoogleFonts.poppins(fontSize: 13),
                    decoration: InputDecoration(
                      hintText: 'Search conversations',
                      prefixIcon: const Icon(Iconsax.search_normal_1, size: 19),
                      filled: true,
                      fillColor: Colors.white.withValues(alpha: .84),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(27),
                        borderSide: BorderSide.none,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(27),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE8F0FA),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Row(
                      children: ['All', 'Unread', 'Groups'].map((tab) {
                        final selected = tab == _tab;
                        return Expanded(
                          child: InkWell(
                            onTap: () => setState(() => _tab = tab),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 11),
                              decoration: BoxDecoration(
                                color: selected
                                    ? Colors.white
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(20),
                                boxShadow: selected
                                    ? const [
                                        BoxShadow(
                                          color: Color(0x10000000),
                                          blurRadius: 10,
                                          offset: Offset(0, 3),
                                        ),
                                      ]
                                    : null,
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                tab,
                                style: GoogleFonts.poppins(
                                  color: selected
                                      ? const Color(0xFF1D2825)
                                      : const Color(0xFF999994),
                                  fontSize: 11,
                                  fontWeight: selected
                                      ? FontWeight.w600
                                      : FontWeight.w500,
                                ),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    _DashboardError(message: _error!, onRetry: _openChatList),
                  ],
                  const SizedBox(height: 10),
                  if (_loading)
                    const _DashboardListSkeleton(rows: 7)
                  else if (chats.isEmpty)
                    const _DashboardEmpty(label: 'No conversations here yet.')
                  else ...[
                    if (recent.isNotEmpty) ...[
                      const _ChatSectionLabel(label: 'Recent conversations'),
                      ...recent.map(
                        (chat) => _ChatListRow(
                          name: _chatName(chat),
                          preview:
                              '${chat['last_message'] ?? chat['member_email'] ?? (chat['type'] == 'group' ? 'Organisation team chat' : 'Start a conversation')}',
                          time: _time(chat['last_message_at']),
                          unread: _isUnread(chat),
                          group: chat['type'] == 'group',
                          onTap: () => _openConversation(chat),
                        ),
                      ),
                    ],
                    if (people.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      const _ChatSectionLabel(label: 'Start a chat'),
                      ...people.map(
                        (chat) => _ChatListRow(
                          name: _chatName(chat),
                          preview:
                              '${chat['member_email'] ?? 'Organisation member'}',
                          time: '',
                          unread: false,
                          group: false,
                          onTap: () => _openConversation(chat),
                        ),
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatSectionLabel extends StatelessWidget {
  const _ChatSectionLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 14, 4, 6),
    child: Text(
      label,
      style: GoogleFonts.poppins(
        color: const Color(0xFF718199),
        fontSize: 10,
        fontWeight: FontWeight.w600,
        letterSpacing: .3,
      ),
    ),
  );
}

class _ChatListRow extends StatelessWidget {
  const _ChatListRow({
    required this.name,
    required this.preview,
    required this.time,
    required this.unread,
    required this.group,
    required this.onTap,
  });

  final String name;
  final String preview;
  final String time;
  final bool unread;
  final bool group;
  final VoidCallback onTap;

  Color get _avatarColor {
    const colors = [
      Color(0xFFDDEBFF),
      Color(0xFFD9F2F5),
      Color(0xFFE7E2FF),
      Color(0xFFDDEFE8),
      Color(0xFFEFE4FF),
    ];
    return colors[(name.codeUnitAt(0) + name.length) % colors.length];
  }

  String get _initials {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 11),
        child: Row(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: group ? const Color(0xFF1D2825) : _avatarColor,
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: group
                      ? const Icon(
                          Iconsax.people,
                          color: Colors.white,
                          size: 23,
                        )
                      : Text(
                          _initials,
                          style: GoogleFonts.poppins(
                            color: const Color(0xFF29415F),
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                ),
                if (group)
                  Positioned(
                    right: -2,
                    bottom: -2,
                    child: Container(
                      width: 17,
                      height: 17,
                      decoration: BoxDecoration(
                        color: const Color(0xFF77A987),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: const Color(0xFFF6F6F4),
                          width: 2,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      fontWeight: unread ? FontWeight.w700 : FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    preview,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.poppins(
                      color: unread
                          ? const Color(0xFF555752)
                          : const Color(0xFF999994),
                      fontSize: 10.5,
                      fontWeight: unread ? FontWeight.w500 : FontWeight.w400,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  time,
                  style: GoogleFonts.poppins(
                    color: const Color(0xFFAAA9A5),
                    fontSize: 9.5,
                  ),
                ),
                const SizedBox(height: 8),
                if (unread)
                  Container(
                    width: 18,
                    height: 18,
                    decoration: const BoxDecoration(
                      color: Color(0xFFE34B42),
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: const Text(
                      '•',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        height: 0.9,
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
}

class _ConversationScreen extends StatefulWidget {
  const _ConversationScreen({
    required this.chatId,
    required this.name,
    required this.group,
  });

  final String chatId;
  final String name;
  final bool group;

  @override
  State<_ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends State<_ConversationScreen> {
  static const _cacheDuration = Duration(minutes: 2);
  final _draftController = TextEditingController();
  final _scrollController = ScrollController();
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _subscription;
  List<Map<String, dynamic>> _messages = [];
  String? _error;
  bool _loading = true;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _openConversation();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _draftController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _openConversation() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    await _restoreMessages(user.uid);
    unawaited(_markRead());
    _subscription = FirebaseFirestore.instance
        .collection('internal_chats')
        .doc(widget.chatId)
        .collection('messages')
        .orderBy('created_at', descending: true)
        .limit(50)
        .snapshots()
        .listen(
          (snapshot) {
            if (!mounted) return;
            final messages = snapshot.docs
                .map((doc) => {'id': doc.id, ...doc.data()})
                .toList()
                .reversed
                .toList();
            setState(() {
              _messages = messages;
              _loading = false;
              _error = null;
            });
            _saveMessages(user.uid);
            _scrollToBottom();
          },
          onError: (Object _) {
            if (mounted) {
              setState(() {
                _loading = false;
                _error = 'Messages could not be loaded.';
              });
            }
          },
        );
  }

  Future<void> _markRead() async {
    try {
      await FirebaseFunctions.instanceFor(region: 'us-central1')
          .httpsCallable('markInternalChatRead')
          .call<void>({'chatId': widget.chatId});
    } catch (_) {
      // The message view can remain usable if a read receipt fails.
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _restoreMessages(String uid) async {
    final preferences = await SharedPreferences.getInstance();
    final key = 'ellipse_chat_messages_${uid}_${widget.chatId}';
    final encoded = preferences.getString(key);
    if (encoded == null) return;
    try {
      final cached = Map<String, dynamic>.from(jsonDecode(encoded) as Map);
      if (DateTime.now().millisecondsSinceEpoch - (cached['savedAt'] as int) >=
          _cacheDuration.inMilliseconds) {
        await preferences.remove(key);
        return;
      }
      if (!mounted) return;
      setState(() {
        _messages = ((cached['messages'] as List?) ?? const [])
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
        _loading = false;
      });
      _scrollToBottom();
    } catch (_) {
      await preferences.remove(key);
    }
  }

  Future<void> _saveMessages(String uid) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      'ellipse_chat_messages_${uid}_${widget.chatId}',
      jsonEncode({
        'savedAt': DateTime.now().millisecondsSinceEpoch,
        'messages': _jsonSafe(_messages),
      }),
    );
  }

  dynamic _jsonSafe(dynamic value) {
    if (value is Timestamp) return value.millisecondsSinceEpoch;
    if (value is Map) {
      return value.map((key, item) => MapEntry('$key', _jsonSafe(item)));
    }
    if (value is Iterable) return value.map(_jsonSafe).toList();
    return value;
  }

  Future<void> _send() async {
    final text = _draftController.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    _draftController.clear();
    try {
      await FirebaseFunctions.instanceFor(region: 'us-central1')
          .httpsCallable('sendInternalMessage')
          .call<void>({'chatId': widget.chatId, 'text': text});
    } catch (_) {
      _draftController.text = text;
      if (mounted) setState(() => _error = 'Message could not be sent.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  int _millis(dynamic value) {
    if (value is Timestamp) return value.millisecondsSinceEpoch;
    if (value is num) return value.toInt();
    return 0;
  }

  String _time(dynamic value) {
    final milliseconds = _millis(value);
    if (milliseconds == 0) return '';
    final date = DateTime.fromMillisecondsSinceEpoch(milliseconds).toLocal();
    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
    return '$hour:${date.minute.toString().padLeft(2, '0')} ${date.hour >= 12 ? 'PM' : 'AM'}';
  }

  @override
  Widget build(BuildContext context) {
    final currentUid = FirebaseAuth.instance.currentUser?.uid;
    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: const Color(0xFFF9F9F7),
      body: SafeArea(
        child: Column(
          children: [
            Container(
              height: 70,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              color: Colors.white.withValues(alpha: 0.94),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(
                      Icons.arrow_back_ios_new_rounded,
                      size: 20,
                    ),
                  ),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          widget.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          widget.group
                              ? 'Organisation team'
                              : 'Organisation member',
                          style: GoogleFonts.poppins(
                            color: const Color(0xFFAAA9A5),
                            fontSize: 9.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () {},
                    icon: const Icon(Iconsax.search_normal_1, size: 21),
                  ),
                ],
              ),
            ),
            if (_error != null)
              Container(
                width: double.infinity,
                color: const Color(0xFFFFE8E5),
                padding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 8,
                ),
                child: Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.poppins(
                    color: const Color(0xFFB63830),
                    fontSize: 10.5,
                  ),
                ),
              ),
            Expanded(
              child: _loading
                  ? const Center(
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Color(0xFF1D2825),
                      ),
                    )
                  : _messages.isEmpty
                  ? _ConversationEmpty(name: widget.name, group: widget.group)
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.fromLTRB(18, 24, 18, 20),
                      itemCount: _messages.length,
                      itemBuilder: (context, index) {
                        final message = _messages[index];
                        final mine = message['sender_uid'] == currentUid;
                        final previousSender = index > 0
                            ? _messages[index - 1]['sender_uid']
                            : null;
                        return _MessageBubble(
                          text: '${message['text'] ?? ''}',
                          sender: '${message['sender_name'] ?? 'Member'}',
                          time: _time(message['created_at']),
                          mine: mine,
                          showSender:
                              !mine && previousSender != message['sender_uid'],
                          group: widget.group,
                        );
                      },
                    ),
            ),
            Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  IconButton(
                    onPressed: () {},
                    icon: const Icon(Iconsax.export_1, size: 22),
                    color: const Color(0xFF555752),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _draftController,
                      minLines: 1,
                      maxLines: 5,
                      maxLength: 5000,
                      textInputAction: TextInputAction.newline,
                      style: GoogleFonts.poppins(fontSize: 13),
                      decoration: InputDecoration(
                        counterText: '',
                        hintText: 'Message ${widget.name}',
                        filled: true,
                        fillColor: const Color(0xFFF5F5F2),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(25),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 17,
                          vertical: 13,
                        ),
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    style: IconButton.styleFrom(
                      backgroundColor: const Color(0xFF1D2825),
                      disabledBackgroundColor: const Color(0xFFBFC0BB),
                    ),
                    icon: _sending
                        ? const SizedBox.square(
                            dimension: 17,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Iconsax.arrow_up_1, size: 20),
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

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.text,
    required this.sender,
    required this.time,
    required this.mine,
    required this.showSender,
    required this.group,
  });

  final String text;
  final String sender;
  final String time;
  final bool mine;
  final bool showSender;
  final bool group;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment: mine
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!mine) ...[
            Container(
              width: 30,
              height: 30,
              margin: const EdgeInsets.only(right: 8),
              decoration: const BoxDecoration(
                color: Color(0xFFE4D9F4),
                shape: BoxShape.circle,
              ),
              child: Icon(
                group ? Iconsax.people : Iconsax.user,
                size: 15,
                color: const Color(0xFF3E3749),
              ),
            ),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment: mine
                  ? CrossAxisAlignment.end
                  : CrossAxisAlignment.start,
              children: [
                if (showSender)
                  Padding(
                    padding: const EdgeInsets.only(left: 10, bottom: 4),
                    child: Text(
                      sender,
                      style: GoogleFonts.poppins(
                        color: const Color(0xFF999994),
                        fontSize: 9.5,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                Container(
                  constraints: const BoxConstraints(maxWidth: 290),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 15,
                    vertical: 11,
                  ),
                  decoration: BoxDecoration(
                    color: mine ? const Color(0xFF1D2825) : Colors.white,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(20),
                      topRight: const Radius.circular(20),
                      bottomLeft: Radius.circular(mine ? 20 : 5),
                      bottomRight: Radius.circular(mine ? 5 : 20),
                    ),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x08000000),
                        blurRadius: 8,
                        offset: Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Text(
                    text,
                    style: GoogleFonts.poppins(
                      color: mine ? Colors.white : const Color(0xFF343632),
                      fontSize: 12,
                      height: 1.5,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  time,
                  style: GoogleFonts.poppins(
                    color: const Color(0xFFAAA9A5),
                    fontSize: 8.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ConversationEmpty extends StatelessWidget {
  const _ConversationEmpty({required this.name, required this.group});

  final String name;
  final bool group;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 62,
              height: 62,
              decoration: const BoxDecoration(
                color: Color(0xFFE4D9F4),
                shape: BoxShape.circle,
              ),
              child: Icon(group ? Iconsax.people : Iconsax.user, size: 27),
            ),
            const SizedBox(height: 16),
            Text(
              'Start the conversation',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Messages with $name stay inside your organisation.',
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                color: const Color(0xFF999994),
                fontSize: 11,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InboxScreen extends StatefulWidget {
  const _InboxScreen({required this.onUnreadCountChanged});

  final ValueChanged<int> onUnreadCountChanged;

  @override
  State<_InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<_InboxScreen> {
  static const _cacheDuration = Duration(minutes: 2);
  final _searchController = TextEditingController();
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _readsSubscription;
  List<Map<String, dynamic>> _conversations = [];
  List<Map<String, dynamic>?> _pageCursors = [null];
  Map<String, dynamic>? _nextCursor;
  Map<String, int> _readAt = {};
  String _period = 'today';
  String _scope = 'all';
  String _role = 'employee';
  String _search = '';
  String? _enterpriseId;
  String? _error;
  int _page = 1;
  bool _hasNext = false;
  bool _loading = true;
  bool _syncing = false;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() => _search = _searchController.text.trim().toLowerCase());
    });
    _initialise();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _readsSubscription?.cancel();
    super.dispose();
  }

  Future<void> _initialise() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    try {
      final profile = await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .get();
      final data = profile.data();
      final enterpriseId = data?['enterprise_id'] as String?;
      if (enterpriseId == null) throw StateError('No organisation found.');
      _enterpriseId = enterpriseId;
      _role = '${data?['role'] ?? 'employee'}';
      if (_role != 'owner') _scope = _role == 'admin' ? 'org' : 'all';
      _listenToReads(user.uid, enterpriseId);
      await _loadPage();
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Inbox could not be opened.';
        });
      }
    }
  }

  void _listenToReads(String uid, String enterpriseId) {
    _readsSubscription = FirebaseFirestore.instance
        .collection('conversation_reads')
        .where('user_id', isEqualTo: uid)
        .where('enterprise_id', isEqualTo: enterpriseId)
        .limit(60)
        .snapshots()
        .listen((snapshot) {
          if (!mounted) return;
          final reads = <String, int>{};
          for (final doc in snapshot.docs) {
            final data = doc.data();
            reads['${data['conversation_id']}'] = _millis(data['read_at']);
          }
          setState(() => _readAt = reads);
          _updateUnreadBadge();
        }, onError: (_) {});
  }

  Future<void> _loadPage({bool force = false}) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null || _enterpriseId == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final cursor = _pageCursors[_page - 1];
      final cursorId = cursor?['id'] ?? 'start';
      final cacheKey =
          'ellipse_inbox_${user.uid}_${_scope}_${_period}_${_page}_$cursorId';
      final preferences = await SharedPreferences.getInstance();
      if (!force) {
        final encoded = preferences.getString(cacheKey);
        if (encoded != null) {
          final cached = Map<String, dynamic>.from(jsonDecode(encoded) as Map);
          if (DateTime.now().millisecondsSinceEpoch -
                  (cached['savedAt'] as int) <
              _cacheDuration.inMilliseconds) {
            _applyPayload(Map<String, dynamic>.from(cached['payload'] as Map));
            return;
          }
          await preferences.remove(cacheKey);
        }
      }
      final result = await FirebaseFunctions.instanceFor(region: 'us-central1')
          .httpsCallable('listInboxConversations')
          .call<Map<String, dynamic>>({
            'period': _period,
            'scope': _scope,
            'cursor': cursor,
          });
      if (!mounted) return;
      _applyPayload(result.data);
      await preferences.setString(
        cacheKey,
        jsonEncode({
          'savedAt': DateTime.now().millisecondsSinceEpoch,
          'payload': result.data,
        }),
      );
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Conversations could not be loaded.';
        });
      }
    }
  }

  void _applyPayload(Map<String, dynamic> payload) {
    if (!mounted) return;
    setState(() {
      _conversations = ((payload['conversations'] as List?) ?? const [])
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();
      _hasNext = payload['hasNext'] == true;
      _nextCursor = payload['nextCursor'] == null
          ? null
          : Map<String, dynamic>.from(payload['nextCursor'] as Map);
      _scope = '${payload['scope'] ?? _scope}';
      _loading = false;
    });
    _updateUnreadBadge();
  }

  void _updateUnreadBadge() {
    widget.onUnreadCountChanged(_conversations.where(_unread).length);
  }

  void _changePeriod(String value) {
    if (_period == value) return;
    setState(() {
      _period = value;
      _resetPagination();
    });
    _loadPage();
  }

  void _changeScope(String value) {
    if (_scope == value) return;
    setState(() {
      _scope = value;
      _resetPagination();
    });
    _loadPage();
  }

  void _resetPagination() {
    _page = 1;
    _pageCursors = [null];
    _nextCursor = null;
    _hasNext = false;
  }

  void _nextPage() {
    if (!_hasNext || _nextCursor == null || _loading) return;
    setState(() {
      if (_pageCursors.length == _page) {
        _pageCursors.add(_nextCursor);
      } else {
        _pageCursors[_page] = _nextCursor;
      }
      _page++;
    });
    _loadPage();
  }

  void _previousPage() {
    if (_page == 1 || _loading) return;
    setState(() => _page--);
    _loadPage();
  }

  Future<void> _sync() async {
    if (_enterpriseId == null || _syncing) return;
    setState(() => _syncing = true);
    final functions = FirebaseFunctions.instanceFor(region: 'us-central1');
    try {
      await Future.wait([
        functions.httpsCallable('syncGmail').call<void>({
          'enterpriseId': _enterpriseId,
          'scope': _scope == 'personal' ? 'personal' : 'org',
        }),
        functions.httpsCallable('syncSmtp').call<void>({
          'enterpriseId': _enterpriseId,
        }),
        functions.httpsCallable('syncOutlook').call<void>({
          'enterpriseId': _enterpriseId,
        }),
      ]);
    } catch (_) {
      // Some channel types may not be connected; refresh those that succeeded.
    }
    if (!mounted) return;
    setState(() => _syncing = false);
    await _loadPage(force: true);
  }

  int _millis(dynamic value) {
    if (value is Timestamp) return value.millisecondsSinceEpoch;
    if (value is num) return value.toInt();
    return 0;
  }

  bool _unread(Map<String, dynamic> conversation) {
    return (_readAt[conversation['id']] ?? 0) <
        _millis(conversation['last_message_at']);
  }

  String _asset(String channel) {
    if (channel == 'whatsapp') return 'assets/images/integration-whatsapp.png';
    if (channel == 'microsoft365') {
      return 'assets/images/integration-outlook.png';
    }
    if (channel == 'smtp') return 'assets/images/integration-smtp.png';
    if (channel == 'zoho') return 'assets/images/integration-zoho.png';
    return 'assets/images/integration-gmail.png';
  }

  String _time(dynamic value) {
    final milliseconds = _millis(value);
    if (milliseconds == 0) return '';
    final date = DateTime.fromMillisecondsSinceEpoch(milliseconds).toLocal();
    final now = DateTime.now();
    if (date.year == now.year &&
        date.month == now.month &&
        date.day == now.day) {
      final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
      return '$hour:${date.minute.toString().padLeft(2, '0')}';
    }
    return '${date.day}/${date.month}';
  }

  List<Map<String, dynamic>> get _visibleConversations {
    if (_search.isEmpty) return _conversations;
    return _conversations.where((conversation) {
      return [
        conversation['subject'],
        conversation['customer_ref'],
        conversation['channel'],
      ].join(' ').toLowerCase().contains(_search);
    }).toList();
  }

  Future<void> _openConversation(Map<String, dynamic> conversation) async {
    final id = conversation['id'] as String;
    setState(() {
      _readAt[id] = _millis(conversation['last_message_at']);
    });
    _updateUnreadBadge();
    FirebaseFunctions.instanceFor(region: 'us-central1')
        .httpsCallable('markConversationRead')
        .call<void>({'conversationId': id})
        .ignore();
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => _InboxReadingScreen(
          conversation: conversation,
          enterpriseId: _enterpriseId!,
          asset: _asset('${conversation['channel'] ?? ''}'),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final conversations = _visibleConversations;
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () => _loadPage(force: true),
        color: const Color(0xFF1D2825),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(22, 24, 22, 118),
              sliver: SliverList.list(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Inbox',
                          style: GoogleFonts.poppins(
                            fontSize: 29,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.9,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: _syncing ? null : _sync,
                        icon: AnimatedRotation(
                          turns: _syncing ? 1 : 0,
                          duration: const Duration(milliseconds: 700),
                          child: const Icon(Iconsax.refresh_circle, size: 25),
                        ),
                        tooltip: 'Sync connected channels',
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  TextField(
                    controller: _searchController,
                    style: GoogleFonts.poppins(fontSize: 13),
                    decoration: InputDecoration(
                      hintText: 'Search this page',
                      prefixIcon: const Icon(Iconsax.search_normal_1, size: 19),
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(27),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  if (_role == 'owner') ...[
                    const SizedBox(height: 14),
                    Row(
                      children:
                          {
                            'all': 'All',
                            'org': 'Organisation',
                            'personal': 'Personal',
                          }.entries.map((entry) {
                            final selected = _scope == entry.key;
                            return Expanded(
                              child: Padding(
                                padding: const EdgeInsets.only(right: 6),
                                child: ChoiceChip(
                                  label: Text(entry.value),
                                  selected: selected,
                                  onSelected: (_) => _changeScope(entry.key),
                                  showCheckmark: false,
                                  selectedColor: const Color(0xFF1D2825),
                                  backgroundColor: const Color(0xFFEEEDEA),
                                  side: BorderSide.none,
                                  shape: const StadiumBorder(),
                                  labelStyle: GoogleFonts.poppins(
                                    color: selected
                                        ? Colors.white
                                        : const Color(0xFF777873),
                                    fontSize: 9.5,
                                  ),
                                ),
                              ),
                            );
                          }).toList(),
                    ),
                  ],
                  const SizedBox(height: 12),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children:
                          {
                            'today': 'Today',
                            'week': 'This week',
                            'month': 'This month',
                            'all': 'All time',
                          }.entries.map((entry) {
                            final selected = _period == entry.key;
                            return Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: ChoiceChip(
                                label: Text(entry.value),
                                selected: selected,
                                onSelected: (_) => _changePeriod(entry.key),
                                showCheckmark: false,
                                selectedColor: const Color(0xFF1D2825),
                                backgroundColor: const Color(0xFFEEEDEA),
                                side: BorderSide.none,
                                shape: const StadiumBorder(),
                                labelStyle: GoogleFonts.poppins(
                                  color: selected
                                      ? Colors.white
                                      : const Color(0xFF777873),
                                  fontSize: 10,
                                ),
                              ),
                            );
                          }).toList(),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    _DashboardError(message: _error!, onRetry: _loadPage),
                  ],
                  const SizedBox(height: 12),
                  if (_loading)
                    const _DashboardListSkeleton(rows: 6)
                  else if (conversations.isEmpty)
                    const _DashboardEmpty(
                      label: 'No conversations in this view.',
                    )
                  else
                    ...List.generate(conversations.length, (index) {
                      final conversation = conversations[index];
                      return _InboxConversationRow(
                        asset: _asset('${conversation['channel'] ?? ''}'),
                        customer:
                            '${conversation['customer_ref'] ?? 'Unknown sender'}',
                        subject: '${conversation['subject'] ?? '(no subject)'}',
                        time: _time(conversation['last_message_at']),
                        unread: _unread(conversation),
                        isLast: index == conversations.length - 1,
                        onTap: () => _openConversation(conversation),
                      );
                    }),
                  if (!_loading && (_page > 1 || _hasNext)) ...[
                    const SizedBox(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        IconButton.filledTonal(
                          onPressed: _page > 1 ? _previousPage : null,
                          icon: const Icon(Icons.arrow_back_rounded),
                        ),
                        Text(
                          'Page $_page · up to 12 messages',
                          style: GoogleFonts.poppins(
                            color: const Color(0xFF999994),
                            fontSize: 10.5,
                          ),
                        ),
                        IconButton.filled(
                          onPressed: _hasNext ? _nextPage : null,
                          style: IconButton.styleFrom(
                            backgroundColor: const Color(0xFF1D2825),
                          ),
                          icon: const Icon(Icons.arrow_forward_rounded),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InboxConversationRow extends StatelessWidget {
  const _InboxConversationRow({
    required this.asset,
    required this.customer,
    required this.subject,
    required this.time,
    required this.unread,
    required this.isLast,
    required this.onTap,
  });

  final String asset;
  final String customer;
  final String subject;
  final String time;
  final bool unread;
  final bool isLast;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 15),
        decoration: BoxDecoration(
          border: isLast
              ? null
              : const Border(bottom: BorderSide(color: Color(0xFFE9E9E5))),
        ),
        child: Row(
          children: [
            SizedBox.square(
              dimension: 42,
              child: Center(child: Image.asset(asset, width: 30, height: 30)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          customer,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: unread
                                ? FontWeight.w700
                                : FontWeight.w500,
                          ),
                        ),
                      ),
                      Text(
                        time,
                        style: GoogleFonts.poppins(
                          color: const Color(0xFFAAA9A5),
                          fontSize: 9.5,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          subject,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                            color: unread
                                ? const Color(0xFF454743)
                                : const Color(0xFF999994),
                            fontSize: 10.5,
                            fontWeight: unread
                                ? FontWeight.w600
                                : FontWeight.w400,
                          ),
                        ),
                      ),
                      if (unread)
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: Color(0xFF527CA8),
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
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

class _InboxReadingScreen extends StatefulWidget {
  const _InboxReadingScreen({
    required this.conversation,
    required this.enterpriseId,
    required this.asset,
  });

  final Map<String, dynamic> conversation;
  final String enterpriseId;
  final String asset;

  @override
  State<_InboxReadingScreen> createState() => _InboxReadingScreenState();
}

class _InboxReadingScreenState extends State<_InboxReadingScreen> {
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _subscription;
  List<Map<String, dynamic>> _messages = [];
  String? _error;
  bool _loading = true;
  bool _actionLoading = false;

  @override
  void initState() {
    super.initState();
    _listen();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  void _listen() {
    _subscription = FirebaseFirestore.instance
        .collection('messages')
        .where('enterprise_id', isEqualTo: widget.enterpriseId)
        .where('conversation_id', isEqualTo: widget.conversation['id'])
        .limit(50)
        .snapshots()
        .listen(
          (snapshot) {
            if (!mounted) return;
            final messages = snapshot.docs
                .map((doc) => {'id': doc.id, ...doc.data()})
                .toList();
            messages.sort(
              (a, b) =>
                  _millis(a['timestamp']).compareTo(_millis(b['timestamp'])),
            );
            setState(() {
              _messages = messages;
              _loading = false;
            });
          },
          onError: (_) {
            if (mounted) {
              setState(() {
                _loading = false;
                _error = 'This conversation could not be loaded.';
              });
            }
          },
        );
  }

  int _millis(dynamic value) {
    if (value is Timestamp) return value.millisecondsSinceEpoch;
    if (value is num) return value.toInt();
    return 0;
  }

  String _date(dynamic value) {
    final date = DateTime.fromMillisecondsSinceEpoch(_millis(value)).toLocal();
    return '${date.day}/${date.month} · ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }

  String _conversationContext() {
    final transcript = _messages.reversed.take(12).toList().reversed.map((
      message,
    ) {
      final sender = message['sender_type'] == 'us'
          ? 'Our team'
          : '${message['from'] ?? message['from_email'] ?? 'Customer'}';
      final body = _emailBodyToText(
        '${message['body'] ?? message['snippet'] ?? ''}',
      );
      return '$sender: ${body.length > 1800 ? body.substring(0, 1800) : body}';
    });
    return [
      'Conversation title: ${widget.conversation['subject'] ?? ''}',
      'Customer: ${widget.conversation['customer_ref'] ?? ''}',
      'Channel: ${widget.conversation['channel'] ?? 'unknown'}',
      'Recent transcript:',
      ...transcript,
    ].join('\n');
  }

  Future<void> _selectAction(String action) async {
    if (action == 'ask') {
      final question = await _askIvyQuestion();
      if (question == null || question.trim().isEmpty) return;
      await _runAiAction(action, question: question.trim());
      return;
    }
    await _runAiAction(action);
  }

  Future<String?> _askIvyQuestion() {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text(
          'Ask Ivy',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        content: TextField(
          controller: controller,
          autofocus: true,
          minLines: 2,
          maxLines: 5,
          decoration: InputDecoration(
            hintText: 'What do you want to know about this conversation?',
            filled: true,
            fillColor: const Color(0xFFF4F4F1),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide.none,
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Ask'),
          ),
        ],
      ),
    ).whenComplete(controller.dispose);
  }

  Future<void> _runAiAction(String action, {String? question}) async {
    setState(() => _actionLoading = true);
    try {
      String title;
      String result;
      if (action == 'tasks') {
        final response =
            await FirebaseFunctions.instanceFor(region: 'us-central1')
                .httpsCallable('extractConversationTasks')
                .call<Map<String, dynamic>>({
                  'conversationId': widget.conversation['id'],
                });
        final tasks = (response.data['tasks'] as List? ?? const []);
        title = 'Suggested tasks';
        result = tasks.isEmpty
            ? 'No concrete tasks were found in this conversation.'
            : tasks
                  .map((item) {
                    final task = Map<String, dynamic>.from(item as Map);
                    final description = '${task['description'] ?? ''}'.trim();
                    return '• ${task['title'] ?? 'Task'}${description.isEmpty ? '' : '\n  $description'}';
                  })
                  .join('\n\n');
      } else {
        final instruction = action == 'brief'
            ? 'Create a concise personalized AI brief for me. Use headings: Why this matters to me, What changed, My actions, Risks or deadlines, Suggested next step. Do not invent facts.'
            : action == 'draft'
            ? 'Draft a ready-to-send reply in the appropriate tone for this channel. Return only the reply text, with no commentary or markdown heading.'
            : 'Answer my question about this conversation using only grounded workspace and transcript context. Question: ${question ?? ''}';
        final response =
            await FirebaseFunctions.instanceFor(
              region: 'us-central1',
            ).httpsCallable('askAgent').call<Map<String, dynamic>>({
              'enterpriseId': widget.enterpriseId,
              'agentId': 'ivy',
              'message': '$instruction\n\n${_conversationContext()}',
              'history': const [],
            });
        title = action == 'brief'
            ? 'Personalized AI Brief'
            : action == 'draft'
            ? 'Suggested reply'
            : 'Ivy';
        result = '${response.data['reply'] ?? 'Ivy did not return a response.'}'
            .trim();
      }
      if (!mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (context) =>
            _InboxActionResultSheet(title: title, result: result),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Ivy could not analyze this conversation.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _actionLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9F9F7),
      body: SafeArea(
        child: Column(
          children: [
            Container(
              height: 70,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              color: Colors.white,
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(
                      Icons.arrow_back_ios_new_rounded,
                      size: 20,
                    ),
                  ),
                  Image.asset(widget.asset, width: 30, height: 30),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${widget.conversation['customer_ref'] ?? 'Conversation'}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          '${widget.conversation['subject'] ?? ''}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                            color: const Color(0xFF999994),
                            fontSize: 9.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_actionLoading)
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 14),
                      child: SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Color(0xFF1D2825),
                        ),
                      ),
                    )
                  else
                    PopupMenuButton<String>(
                      tooltip: 'Conversation options',
                      icon: const Icon(Icons.more_horiz_rounded, size: 28),
                      color: Colors.white,
                      elevation: 10,
                      position: PopupMenuPosition.under,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                      ),
                      onSelected: _selectAction,
                      itemBuilder: (context) => [
                        _inboxActionMenuItem(
                          'brief',
                          'AI Brief',
                          Iconsax.document_text,
                        ),
                        _inboxActionMenuItem(
                          'draft',
                          'Draft reply',
                          Iconsax.send_2,
                        ),
                        _inboxActionMenuItem(
                          'tasks',
                          'Create tasks',
                          Iconsax.task_square,
                        ),
                        _inboxActionMenuItem(
                          'ask',
                          'Ask Ivy',
                          Iconsax.message_question,
                        ),
                      ],
                    ),
                ],
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            Expanded(
              child: _loading
                  ? const Center(
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(18, 22, 18, 30),
                      itemCount: _messages.length,
                      itemBuilder: (context, index) {
                        final message = _messages[index];
                        final mine = message['sender_type'] == 'us';
                        final body = _emailBodyToText(
                          '${message['body'] ?? message['snippet'] ?? ''}',
                        );
                        return Align(
                          alignment: mine
                              ? Alignment.centerRight
                              : Alignment.centerLeft,
                          child: Container(
                            constraints: const BoxConstraints(maxWidth: 330),
                            margin: const EdgeInsets.only(bottom: 14),
                            padding: const EdgeInsets.all(15),
                            decoration: BoxDecoration(
                              color: mine
                                  ? const Color(0xFF1D2825)
                                  : Colors.white,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (!mine)
                                  Text(
                                    '${message['from'] ?? message['from_email'] ?? 'Customer'}',
                                    style: GoogleFonts.poppins(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                const SizedBox(height: 5),
                                _LinkifiedEmailText(text: body, mine: mine),
                                const SizedBox(height: 8),
                                Text(
                                  _date(message['timestamp']),
                                  style: GoogleFonts.poppins(
                                    color: mine
                                        ? Colors.white.withValues(alpha: 0.55)
                                        : const Color(0xFFAAA9A5),
                                    fontSize: 8.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

PopupMenuItem<String> _inboxActionMenuItem(
  String value,
  String label,
  IconData icon,
) {
  return PopupMenuItem<String>(
    value: value,
    height: 48,
    child: Row(
      children: [
        Icon(icon, size: 19, color: const Color(0xFF454743)),
        const SizedBox(width: 12),
        Text(
          label,
          style: GoogleFonts.poppins(
            color: const Color(0xFF252622),
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    ),
  );
}

class _InboxActionResultSheet extends StatelessWidget {
  const _InboxActionResultSheet({required this.title, required this.result});

  final String title;
  final String result;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.78,
      ),
      padding: const EdgeInsets.fromLTRB(22, 10, 22, 24),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 42,
              height: 5,
              decoration: BoxDecoration(
                color: const Color(0xFFD5D5D1),
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                const Icon(Iconsax.magic_star, color: Color(0xFF55457A)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    title,
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Flexible(
              child: SingleChildScrollView(
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    result,
                    style: GoogleFonts.poppins(
                      color: const Color(0xFF454743),
                      fontSize: 12,
                      height: 1.6,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LinkifiedEmailText extends StatefulWidget {
  const _LinkifiedEmailText({required this.text, required this.mine});

  final String text;
  final bool mine;

  @override
  State<_LinkifiedEmailText> createState() => _LinkifiedEmailTextState();
}

class _LinkifiedEmailTextState extends State<_LinkifiedEmailText> {
  final List<TapGestureRecognizer> _recognizers = [];

  @override
  void dispose() {
    for (final recognizer in _recognizers) {
      recognizer.dispose();
    }
    super.dispose();
  }

  List<InlineSpan> _spans() {
    for (final recognizer in _recognizers) {
      recognizer.dispose();
    }
    _recognizers.clear();

    final spans = <InlineSpan>[];
    final linkPattern = RegExp(r'(?:https?://|mailto:)[^\s)]+');
    var cursor = 0;
    for (final match in linkPattern.allMatches(widget.text)) {
      if (match.start > cursor) {
        spans.add(TextSpan(text: widget.text.substring(cursor, match.start)));
      }
      final matched = match.group(0) ?? '';
      final clean = matched.replaceFirst(RegExp(r'[.,;:]+$'), '');
      final display = clean.length > 52
          ? '${clean.substring(0, 38)}…${clean.substring(clean.length - 10)}'
          : clean;
      final punctuation = matched.substring(clean.length);
      final recognizer = TapGestureRecognizer()
        ..onTap = () async {
          final uri = Uri.tryParse(clean);
          if (uri != null) {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          }
        };
      _recognizers.add(recognizer);
      spans.add(
        TextSpan(
          text: display,
          style: TextStyle(
            color: widget.mine
                ? const Color(0xFFB9D8FF)
                : const Color(0xFF426FA8),
            decoration: TextDecoration.underline,
            decorationColor: widget.mine
                ? const Color(0xFFB9D8FF)
                : const Color(0xFF426FA8),
          ),
          recognizer: recognizer,
        ),
      );
      if (punctuation.isNotEmpty) spans.add(TextSpan(text: punctuation));
      cursor = match.end;
    }
    if (cursor < widget.text.length) {
      spans.add(TextSpan(text: widget.text.substring(cursor)));
    }
    return spans;
  }

  @override
  Widget build(BuildContext context) {
    return SelectableText.rich(
      TextSpan(children: _spans()),
      style: GoogleFonts.poppins(
        color: widget.mine ? Colors.white : const Color(0xFF454743),
        fontSize: 11.5,
        height: 1.55,
      ),
    );
  }
}

class _ApprovalsScreen extends StatefulWidget {
  const _ApprovalsScreen({required this.onPendingCountChanged});

  final ValueChanged<int> onPendingCountChanged;

  @override
  State<_ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends State<_ApprovalsScreen> {
  static const _cacheDuration = Duration(minutes: 2);
  static const _filters = [
    'All',
    'Pending',
    'Approved',
    'Executed',
    'Rejected',
  ];

  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>?> _pageCursors = [null];
  Map<String, dynamic>? _nextCursor;
  String _filter = 'All';
  String _search = '';
  String? _error;
  String? _busyId;
  int _page = 1;
  int? _pendingTotal;
  bool _hasNext = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadPage();
    _searchController.addListener(() {
      setState(() => _search = _searchController.text.trim().toLowerCase());
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadPage({bool force = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final cursor = _pageCursors[_page - 1];
      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid == null) throw StateError('Not signed in.');
      final cursorId = cursor?['id'] ?? 'start';
      final cacheKey = 'ellipse_approvals_${uid}_${_filter}_${_page}_$cursorId';
      final preferences = await SharedPreferences.getInstance();
      if (!force) {
        final encoded = preferences.getString(cacheKey);
        if (encoded != null) {
          final cached = Map<String, dynamic>.from(jsonDecode(encoded) as Map);
          final savedAt = cached['savedAt'] as int? ?? 0;
          if (DateTime.now().millisecondsSinceEpoch - savedAt <
              _cacheDuration.inMilliseconds) {
            _applyApprovalPayload(
              Map<String, dynamic>.from(cached['payload'] as Map),
            );
            return;
          }
          await preferences.remove(cacheKey);
        }
      }
      final result = await FirebaseFunctions.instanceFor(region: 'us-central1')
          .httpsCallable('listApprovals')
          .call<Map<String, dynamic>>({
            'filter': _filter.toLowerCase(),
            'cursor': cursor,
          });
      if (!mounted) return;
      _applyApprovalPayload(result.data);
      await preferences.setString(
        cacheKey,
        jsonEncode({
          'savedAt': DateTime.now().millisecondsSinceEpoch,
          'payload': result.data,
        }),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Approvals could not be loaded. Please try again.';
      });
    }
  }

  void _applyApprovalPayload(Map<String, dynamic> data) {
    if (!mounted) return;
    setState(() {
      _items = ((data['items'] as List?) ?? const [])
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();
      _hasNext = data['hasNext'] == true;
      _nextCursor = data['nextCursor'] == null
          ? null
          : Map<String, dynamic>.from(data['nextCursor'] as Map);
      _pendingTotal = (data['pendingTotal'] as num?)?.toInt();
      _loading = false;
    });
    widget.onPendingCountChanged(_pendingTotal ?? 0);
  }

  Future<void> _clearApprovalCache() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    final preferences = await SharedPreferences.getInstance();
    final prefix = 'ellipse_approvals_${uid}_';
    await Future.wait(
      preferences
          .getKeys()
          .where((key) => key.startsWith(prefix))
          .map(preferences.remove),
    );
  }

  void _changeFilter(String filter) {
    if (filter == _filter) return;
    setState(() {
      _filter = filter;
      _page = 1;
      _pageCursors = [null];
      _nextCursor = null;
      _hasNext = false;
    });
    _loadPage();
  }

  void _nextPage() {
    if (!_hasNext || _nextCursor == null) return;
    setState(() {
      if (_pageCursors.length == _page) {
        _pageCursors.add(_nextCursor);
      } else {
        _pageCursors[_page] = _nextCursor;
      }
      _page++;
    });
    _loadPage();
  }

  void _previousPage() {
    if (_page == 1) return;
    setState(() => _page--);
    _loadPage();
  }

  Future<void> _decide(Map<String, dynamic> item, String status) async {
    final id = item['id'] as String;
    setState(() {
      _busyId = id;
      _error = null;
    });
    try {
      await FirebaseFirestore.instance
          .collection('pending_actions')
          .doc(id)
          .update({
            'status': status,
            'decided_at': FieldValue.serverTimestamp(),
            'decided_by_uid': FirebaseAuth.instance.currentUser?.uid,
          });
      await _clearApprovalCache();
      await _loadPage(force: true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'The decision could not be saved. Try again.');
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  List<Map<String, dynamic>> get _visibleItems {
    if (_search.isEmpty) return _items;
    return _items.where((item) {
      final text = [
        item['agent_id'],
        item['action_type'],
        item['target_system'],
        item['action_summary'],
        item['params'],
      ].join(' ').toLowerCase();
      return text.contains(_search);
    }).toList();
  }

  String _title(String? value) {
    final text = (value ?? 'Action').replaceAll('_', ' ');
    return '${text[0].toUpperCase()}${text.substring(1)}';
  }

  String _agent(String? value) {
    return (value ?? 'Agent')
        .replaceAll('-agent', '')
        .split('-')
        .where((word) => word.isNotEmpty)
        .map((word) => '${word[0].toUpperCase()}${word.substring(1)}')
        .join(' ');
  }

  String _asset(Map<String, dynamic> item) {
    final value = '${item['target_system'] ?? ''} ${item['agent_id'] ?? ''}'
        .toLowerCase();
    if (value.contains('zoho')) return 'assets/images/integration-zoho.png';
    if (value.contains('whatsapp')) {
      return 'assets/images/integration-whatsapp.png';
    }
    if (value.contains('microsoft') || value.contains('outlook')) {
      return 'assets/images/integration-outlook.png';
    }
    if (value.contains('smtp')) return 'assets/images/integration-smtp.png';
    if (value.contains('mercury')) {
      return 'assets/images/integration-mercury.png';
    }
    return 'assets/images/integration-gmail.png';
  }

  String _date(num? milliseconds) {
    if (milliseconds == null) return '';
    final date = DateTime.fromMillisecondsSinceEpoch(
      milliseconds.toInt(),
    ).toLocal();
    return '${date.day}/${date.month} · ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visibleItems;
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () => _loadPage(force: true),
        color: const Color(0xFF1D2825),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(22, 24, 22, 118),
              sliver: SliverList.list(
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Agent actions',
                              style: GoogleFonts.poppins(
                                color: const Color(0xFFAAA9A5),
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            Text(
                              'Approvals',
                              style: GoogleFonts.poppins(
                                fontSize: 29,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.9,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if ((_pendingTotal ?? 0) > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 7,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1D2825),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Text(
                            '${_pendingTotal ?? 0} pending',
                            style: GoogleFonts.poppins(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  TextField(
                    controller: _searchController,
                    style: GoogleFonts.poppins(fontSize: 13),
                    decoration: InputDecoration(
                      hintText: 'Search this page',
                      prefixIcon: const Icon(Iconsax.search_normal_1, size: 19),
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(26),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: _filters.map((filter) {
                        final selected = filter == _filter;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(filter),
                            selected: selected,
                            onSelected: (_) => _changeFilter(filter),
                            showCheckmark: false,
                            selectedColor: const Color(0xFF1D2825),
                            backgroundColor: const Color(0xFFEEEDEA),
                            side: BorderSide.none,
                            labelStyle: GoogleFonts.poppins(
                              color: selected
                                  ? Colors.white
                                  : const Color(0xFF666762),
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    _DashboardError(message: _error!, onRetry: _loadPage),
                  ],
                  const SizedBox(height: 20),
                  if (_loading)
                    const _DashboardListSkeleton(rows: 6)
                  else if (visible.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 70),
                      child: Column(
                        children: [
                          Icon(
                            Iconsax.clipboard_tick,
                            size: 38,
                            color: Color(0xFFAAA9A5),
                          ),
                          SizedBox(height: 12),
                          Text('No actions match this view.'),
                        ],
                      ),
                    )
                  else
                    ...List.generate(visible.length, (index) {
                      final item = visible[index];
                      return _MobileApprovalRow(
                        item: item,
                        asset: _asset(item),
                        title: _title(item['action_type'] as String?),
                        agent: _agent(item['agent_id'] as String?),
                        requested: _date(item['created_at'] as num?),
                        busy: _busyId == item['id'],
                        isLast: index == visible.length - 1,
                        onReview: () => _showReview(item),
                        onApprove: () => _decide(item, 'approved'),
                        onReject: () => _confirmReject(item),
                      );
                    }),
                  if (!_loading && (_page > 1 || _hasNext)) ...[
                    const SizedBox(height: 26),
                    Row(
                      children: [
                        Text(
                          'Page $_page · up to 12 approvals',
                          style: GoogleFonts.poppins(
                            color: const Color(0xFF999994),
                            fontSize: 11,
                          ),
                        ),
                        const Spacer(),
                        IconButton.filledTonal(
                          onPressed: _page > 1 ? _previousPage : null,
                          icon: const Icon(Icons.arrow_back_rounded, size: 18),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          onPressed: _hasNext ? _nextPage : null,
                          style: IconButton.styleFrom(
                            backgroundColor: const Color(0xFF1D2825),
                          ),
                          icon: const Icon(
                            Icons.arrow_forward_rounded,
                            size: 18,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showReview(Map<String, dynamic> item) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      isDismissible: true,
      enableDrag: true,
      useSafeArea: true,
      barrierColor: Colors.black.withValues(alpha: 0.56),
      backgroundColor: Colors.transparent,
      builder: (context) => _ApprovalReviewSheet(
        item: item,
        title: _title(item['action_type'] as String?),
        agent: _agent(item['agent_id'] as String?),
        asset: _asset(item),
        onSaved: () async {
          await _clearApprovalCache();
          await _loadPage(force: true);
        },
      ),
    );
  }

  Future<void> _confirmReject(Map<String, dynamic> item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reject this action?'),
        content: const Text('The agent will not execute this action.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
    if (confirmed == true) await _decide(item, 'rejected');
  }
}

class _MobileApprovalRow extends StatelessWidget {
  const _MobileApprovalRow({
    required this.item,
    required this.asset,
    required this.title,
    required this.agent,
    required this.requested,
    required this.busy,
    required this.isLast,
    required this.onReview,
    required this.onApprove,
    required this.onReject,
  });

  final Map<String, dynamic> item;
  final String asset;
  final String title;
  final String agent;
  final String requested;
  final bool busy;
  final bool isLast;
  final VoidCallback onReview;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final status = (item['status'] as String?) ?? 'pending';
    final pending = status == 'pending';
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 17),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : const Border(bottom: BorderSide(color: Color(0xFFE9E9E5))),
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox.square(
                dimension: 38,
                child: Center(child: Image.asset(asset, width: 29, height: 29)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '$agent · $requested',
                      style: GoogleFonts.poppins(
                        color: const Color(0xFF999994),
                        fontSize: 10.5,
                      ),
                    ),
                  ],
                ),
              ),
              _ApprovalStatus(status: status),
            ],
          ),
          const SizedBox(height: 13),
          Row(
            children: [
              TextButton.icon(
                onPressed: onReview,
                icon: const Icon(Iconsax.eye, size: 15),
                label: const Text('Review'),
              ),
              const Spacer(),
              if (pending) ...[
                IconButton(
                  onPressed: busy ? null : onReject,
                  icon: const Icon(Iconsax.close_circle, size: 20),
                  color: const Color(0xFF9A9A95),
                  tooltip: 'Reject',
                ),
                FilledButton.icon(
                  onPressed: busy ? null : onApprove,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF1D2825),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                    ),
                  ),
                  icon: busy
                      ? const SizedBox.square(
                          dimension: 13,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Iconsax.tick_circle, size: 16),
                  label: const Text('Approve'),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _ApprovalStatus extends StatelessWidget {
  const _ApprovalStatus({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (background, foreground) = switch (status) {
      'pending' => (const Color(0xFFFFF3D7), const Color(0xFF9B661C)),
      'approved' => (const Color(0xFFEAF1FF), const Color(0xFF3D65A5)),
      'executed' => (const Color(0xFFE5F5EA), const Color(0xFF377D50)),
      'rejected' => (const Color(0xFFFFE8E5), const Color(0xFFB63830)),
      _ => (const Color(0xFFFFE8E5), const Color(0xFFA33D34)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        '${status[0].toUpperCase()}${status.substring(1)}',
        style: GoogleFonts.poppins(
          color: foreground,
          fontSize: 9.5,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _ApprovalReviewSheet extends StatefulWidget {
  const _ApprovalReviewSheet({
    required this.item,
    required this.title,
    required this.agent,
    required this.asset,
    required this.onSaved,
  });

  final Map<String, dynamic> item;
  final String title;
  final String agent;
  final String asset;
  final Future<void> Function() onSaved;

  @override
  State<_ApprovalReviewSheet> createState() => _ApprovalReviewSheetState();
}

class _ApprovalReviewSheetState extends State<_ApprovalReviewSheet> {
  late final Map<String, dynamic> _params;
  late final TextEditingController _toController;
  late final TextEditingController _ccController;
  late final TextEditingController _subjectController;
  late final TextEditingController _bodyController;
  bool _saving = false;
  String? _error;

  bool get _editable {
    final action = widget.item['action_type'];
    return widget.item['status'] == 'pending' &&
        (action == 'send_email' || action == 'send_reply');
  }

  @override
  void initState() {
    super.initState();
    _params = Map<String, dynamic>.from(
      widget.item['params'] as Map? ?? const {},
    );
    _toController = TextEditingController(text: '${_params['to'] ?? ''}');
    _ccController = TextEditingController(text: '${_params['cc'] ?? ''}');
    _subjectController = TextEditingController(
      text: '${_params['subject'] ?? ''}',
    );
    _bodyController = TextEditingController(text: '${_params['body'] ?? ''}');
  }

  @override
  void dispose() {
    _toController.dispose();
    _ccController.dispose();
    _subjectController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_toController.text.trim().isEmpty ||
        _bodyController.text.trim().isEmpty) {
      setState(() => _error = 'Recipient and message are required.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final isReply = widget.item['action_type'] == 'send_reply';
      final updatedParams = {
        ..._params,
        'to': _toController.text.trim(),
        'cc': _ccController.text.trim().isEmpty
            ? null
            : _ccController.text.trim(),
        'subject': _subjectController.text.trim(),
        'body': _bodyController.text.trim(),
      };
      await FirebaseFirestore.instance
          .collection('pending_actions')
          .doc(widget.item['id'] as String)
          .update({
            'params': updatedParams,
            'action_summary':
                '${isReply ? 'Reply' : 'Email'} “${_subjectController.text.trim().isEmpty ? '(no subject)' : _subjectController.text.trim()}” to ${_toController.text.trim()} — edited before approval.',
            'updated_at': FieldValue.serverTimestamp(),
          });
      await widget.onSaved();
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'The edited draft could not be saved.');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.78,
      minChildSize: 0.45,
      maxChildSize: 0.94,
      builder: (context, controller) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
        ),
        child: ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(22, 12, 22, 32),
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFD3D3CF),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Image.asset(widget.asset, width: 34, height: 34),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.title,
                        style: GoogleFonts.poppins(
                          fontSize: 21,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        widget.agent,
                        style: GoogleFonts.poppins(
                          color: const Color(0xFF999994),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                _ApprovalStatus(
                  status: widget.item['status'] as String? ?? 'pending',
                ),
              ],
            ),
            if ((widget.item['action_summary'] as String?)?.isNotEmpty ==
                true) ...[
              const SizedBox(height: 22),
              Text(
                'Agent summary',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 7),
              Text(
                widget.item['action_summary'] as String,
                style: GoogleFonts.poppins(
                  color: const Color(0xFF666762),
                  fontSize: 12,
                  height: 1.55,
                ),
              ),
            ],
            const SizedBox(height: 24),
            Text(
              'Action details',
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 10),
            if (_error != null) ...[
              Text(
                _error!,
                style: GoogleFonts.poppins(
                  color: const Color(0xFFB63830),
                  fontSize: 11,
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (_editable) ...[
              _ApprovalEditField(
                label: 'To',
                controller: _toController,
                readOnly: widget.item['action_type'] == 'send_reply',
              ),
              _ApprovalEditField(label: 'CC', controller: _ccController),
              _ApprovalEditField(
                label: 'Subject',
                controller: _subjectController,
              ),
              _ApprovalEditField(
                label: 'Message',
                controller: _bodyController,
                maxLines: 8,
              ),
              const SizedBox(height: 10),
              SizedBox(
                height: 52,
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF1D2825),
                  ),
                  child: _saving
                      ? const SizedBox.square(
                          dimension: 19,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Save edited draft'),
                ),
              ),
            ] else if (_params.isEmpty)
              const Text('No additional action data.')
            else
              ..._params.entries.map(
                (entry) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 95,
                        child: Text(
                          entry.key.replaceAll('_', ' '),
                          style: GoogleFonts.poppins(
                            color: const Color(0xFF999994),
                            fontSize: 10.5,
                          ),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          entry.value.toString(),
                          style: GoogleFonts.poppins(
                            fontSize: 11.5,
                            height: 1.45,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ApprovalEditField extends StatelessWidget {
  const _ApprovalEditField({
    required this.label,
    required this.controller,
    this.readOnly = false,
    this.maxLines = 1,
  });

  final String label;
  final TextEditingController controller;
  final bool readOnly;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextField(
        controller: controller,
        readOnly: readOnly,
        maxLines: maxLines,
        style: GoogleFonts.poppins(fontSize: 12),
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: const Color(0xFFF4F4F1),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide.none,
          ),
        ),
      ),
    );
  }
}

class _ProfileScreen extends StatefulWidget {
  const _ProfileScreen();

  @override
  State<_ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<_ProfileScreen> {
  static const _notificationOptions = <String, (String, String)>{
    'newMessage': (
      'New inbox message',
      'Customer messages from connected channels.',
    ),
    'teamChat': ('Team chat', 'Direct and organisation chat messages.'),
    'agentApproval': ('Agent approvals', 'Actions waiting for your review.'),
    'actionResult': (
      'Action results',
      'When an approved action completes or fails.',
    ),
    'accessRequest': (
      'Integration access',
      'New requests and access decisions.',
    ),
    'integrationStatus': (
      'Integration status',
      'When a connected service needs attention.',
    ),
  };

  final _nameController = TextEditingController();
  Map<String, bool> _notifications = {
    for (final key in _notificationOptions.keys) key: true,
  };
  String _email = '';
  String _role = '';
  String _organisation = '';
  String? _error;
  bool _loading = true;
  bool _savingName = false;
  bool _passwordSent = false;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .get();
      final profile = snapshot.data() ?? const <String, dynamic>{};
      final enterpriseId = profile['enterprise_id'] as String?;
      String organisation = 'No organisation';
      if (enterpriseId != null) {
        final enterprise = await FirebaseFirestore.instance
            .collection('enterprises')
            .doc(enterpriseId)
            .get();
        organisation = '${enterprise.data()?['name'] ?? 'Organisation'}';
      }
      final storedPreferences = Map<String, dynamic>.from(
        profile['notification_preferences'] as Map? ?? const {},
      );
      if (!mounted) return;
      setState(() {
        _nameController.text =
            '${profile['display_name'] ?? user.displayName ?? ''}';
        _email = '${profile['email'] ?? user.email ?? ''}';
        _role = '${profile['role'] ?? 'employee'}';
        _organisation = organisation;
        _notifications = {
          for (final key in _notificationOptions.keys)
            key: storedPreferences[key] as bool? ?? true,
        };
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Your profile could not be loaded.';
        });
      }
    }
  }

  Future<void> _saveName() async {
    final user = FirebaseAuth.instance.currentUser;
    final name = _nameController.text.trim();
    if (user == null || name.isEmpty || _savingName) return;
    setState(() {
      _savingName = true;
      _error = null;
    });
    try {
      await FirebaseFirestore.instance.collection('users').doc(user.uid).set({
        'display_name': name,
        'updated_at': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      await user.updateDisplayName(name);
      final preferences = await SharedPreferences.getInstance();
      await preferences.remove('ellipse_dashboard_${user.uid}');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Profile updated.')));
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Your name could not be saved.');
    } finally {
      if (mounted) setState(() => _savingName = false);
    }
  }

  Future<void> _toggleNotification(String key, bool value) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    final previous = _notifications[key] ?? true;
    setState(() => _notifications[key] = value);
    try {
      await FirebaseFirestore.instance.collection('users').doc(user.uid).set({
        'notification_preferences': _notifications,
        'updated_at': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    } catch (_) {
      if (mounted) {
        setState(() {
          _notifications[key] = previous;
          _error = 'Notification preference could not be saved.';
        });
      }
    }
  }

  Future<void> _resetPassword() async {
    if (_email.isEmpty) return;
    try {
      await FirebaseAuth.instance.sendPasswordResetEmail(email: _email);
      if (mounted) setState(() => _passwordSent = true);
    } catch (_) {
      if (mounted) setState(() => _error = 'Reset email could not be sent.');
    }
  }

  Future<void> _signOut() async {
    await FirebaseAuth.instance.signOut();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(builder: (context) => const OnboardingScreen()),
      (route) => false,
    );
  }

  String get _roleLabel =>
      _role.isEmpty ? '' : '${_role[0].toUpperCase()}${_role.substring(1)}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F6F4),
      body: SafeArea(
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Color(0xFF1D2825),
                ),
              )
            : CustomScrollView(
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(22, 12, 22, 34),
                    sliver: SliverList.list(
                      children: [
                        Row(
                          children: [
                            IconButton(
                              onPressed: () => Navigator.pop(context),
                              icon: const Icon(
                                Icons.arrow_back_ios_new_rounded,
                                size: 20,
                              ),
                            ),
                            Expanded(
                              child: Text(
                                'Profile',
                                textAlign: TextAlign.center,
                                style: GoogleFonts.poppins(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            const SizedBox(width: 48),
                          ],
                        ),
                        const SizedBox(height: 26),
                        Center(
                          child: Container(
                            width: 88,
                            height: 88,
                            decoration: const BoxDecoration(
                              color: Color(0xFF1D2825),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Iconsax.user,
                              color: Colors.white,
                              size: 38,
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          _nameController.text.isEmpty
                              ? 'Ellipse member'
                              : _nameController.text,
                          textAlign: TextAlign.center,
                          style: GoogleFonts.poppins(
                            fontSize: 21,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _email,
                          textAlign: TextAlign.center,
                          style: GoogleFonts.poppins(
                            color: const Color(0xFF999994),
                            fontSize: 11,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            _ProfileChip(label: _roleLabel),
                            const SizedBox(width: 8),
                            Flexible(child: _ProfileChip(label: _organisation)),
                          ],
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 20),
                          _DashboardError(
                            message: _error!,
                            onRetry: _loadProfile,
                          ),
                        ],
                        const SizedBox(height: 30),
                        const _ProfileSectionTitle(
                          title: 'Personal information',
                        ),
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(22),
                          ),
                          child: Column(
                            children: [
                              TextField(
                                controller: _nameController,
                                textCapitalization: TextCapitalization.words,
                                decoration: InputDecoration(
                                  labelText: 'Display name',
                                  filled: true,
                                  fillColor: const Color(0xFFF4F4F1),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(18),
                                    borderSide: BorderSide.none,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              SizedBox(
                                width: double.infinity,
                                height: 48,
                                child: FilledButton(
                                  onPressed: _savingName ? null : _saveName,
                                  style: FilledButton.styleFrom(
                                    backgroundColor: const Color(0xFF1D2825),
                                  ),
                                  child: Text(
                                    _savingName ? 'Saving…' : 'Save changes',
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 28),
                        const _ProfileSectionTitle(title: 'Notifications'),
                        const SizedBox(height: 6),
                        ..._notificationOptions.entries.map((entry) {
                          final (title, description) = entry.value;
                          return _ProfileToggleRow(
                            title: title,
                            description: description,
                            value: _notifications[entry.key] ?? true,
                            onChanged: (value) =>
                                _toggleNotification(entry.key, value),
                          );
                        }),
                        const SizedBox(height: 28),
                        const _ProfileSectionTitle(title: 'Security'),
                        const SizedBox(height: 8),
                        ListTile(
                          onTap: _resetPassword,
                          tileColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(20),
                          ),
                          leading: const Icon(Iconsax.lock_1),
                          title: const Text('Reset password'),
                          subtitle: Text(
                            _passwordSent
                                ? 'Reset instructions sent to your email.'
                                : 'Send a secure reset link to $_email',
                          ),
                          trailing: const Icon(
                            Icons.arrow_forward_ios_rounded,
                            size: 15,
                          ),
                        ),
                        const SizedBox(height: 26),
                        SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: OutlinedButton.icon(
                            onPressed: _signOut,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFFB63830),
                              side: const BorderSide(color: Color(0xFFFFC9C4)),
                              shape: const StadiumBorder(),
                            ),
                            icon: const Icon(Iconsax.logout, size: 19),
                            label: const Text('Sign out'),
                          ),
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

class _ProfileSectionTitle extends StatelessWidget {
  const _ProfileSectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: GoogleFonts.poppins(fontSize: 15, fontWeight: FontWeight.w600),
    );
  }
}

class _ProfileChip extends StatelessWidget {
  const _ProfileChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFFECECE8),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: GoogleFonts.poppins(
          color: const Color(0xFF666762),
          fontSize: 9.5,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

class _ProfileToggleRow extends StatelessWidget {
  const _ProfileToggleRow({
    required this.title,
    required this.description,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final String description;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 13),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFFE9E9E5))),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.poppins(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  description,
                  style: GoogleFonts.poppins(
                    color: const Color(0xFF999994),
                    fontSize: 9.5,
                  ),
                ),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeTrackColor: const Color(0xFF1D2825),
          ),
        ],
      ),
    );
  }
}

class _HomeDashboard extends StatefulWidget {
  const _HomeDashboard({required this.onPendingCountChanged});

  final ValueChanged<int> onPendingCountChanged;

  @override
  State<_HomeDashboard> createState() => _HomeDashboardState();
}

class _HomeDashboardState extends State<_HomeDashboard> {
  static const _cacheDuration = Duration(minutes: 2);
  Map<String, dynamic>? _dashboard;
  String? _error;
  String _displayName = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard({bool force = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) throw StateError('You are not signed in.');
      final cacheKey = 'ellipse_dashboard_${user.uid}';
      final preferences = await SharedPreferences.getInstance();
      if (!force) {
        final encoded = preferences.getString(cacheKey);
        if (encoded != null) {
          final cached = Map<String, dynamic>.from(jsonDecode(encoded) as Map);
          final savedAt = cached['savedAt'] as int? ?? 0;
          if (DateTime.now().millisecondsSinceEpoch - savedAt <
              _cacheDuration.inMilliseconds) {
            _applyDashboardPayload(
              Map<String, dynamic>.from(cached['payload'] as Map),
              cached['displayName'] as String? ?? '',
              user,
            );
            return;
          }
          await preferences.remove(cacheKey);
        }
      }
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
      final displayName = (profile?['display_name'] as String?)?.trim() ?? '';
      _applyDashboardPayload(result.data, displayName, user);
      await preferences.setString(
        cacheKey,
        jsonEncode({
          'savedAt': DateTime.now().millisecondsSinceEpoch,
          'displayName': displayName,
          'payload': result.data,
        }),
      );
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

  void _applyDashboardPayload(
    Map<String, dynamic> payload,
    String displayName,
    User user,
  ) {
    if (!mounted) return;
    setState(() {
      _dashboard = payload;
      _displayName = displayName;
      if (_displayName.isEmpty) {
        _displayName = user.displayName?.trim() ?? '';
      }
      if (_displayName.isEmpty) {
        _displayName = user.email?.split('@').first ?? 'there';
      }
      _loading = false;
    });
    final counts = Map<String, dynamic>.from(
      payload['counts'] as Map? ?? const {},
    );
    widget.onPendingCountChanged((counts['pending'] as num?)?.toInt() ?? 0);
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
        onRefresh: () => _loadDashboard(force: true),
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
                      Semantics(
                        button: true,
                        label: 'Open profile',
                        child: InkWell(
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (context) => const _ProfileScreen(),
                            ),
                          ),
                          customBorder: const CircleBorder(),
                          child: Container(
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
                          accent: Color(0xFF438FF2),
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
                          accent: Color(0xFF42B3D1),
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
                          accent: Color(0xFF6E83ED),
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
                          accent: Color(0xFF9575D8),
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
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.lerp(Colors.white, accent, .22)!,
            Color.lerp(Colors.white, accent, .08)!,
          ],
        ),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white.withValues(alpha: .58)),
        boxShadow: [
          BoxShadow(
            color: accent.withValues(alpha: .09),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 21, color: const Color(0xFF17233A)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.poppins(
                    color: const Color(0xFF17233A),
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
                          color: const Color(0xFF17233A),
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
                        color: const Color(0xFF66758C),
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
      ..color = Colors.white.withValues(alpha: .62)
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
          ..color = index == 3 ? accent : Colors.white.withValues(alpha: .62)
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
    required this.approvalBadge,
    required this.chatBadge,
    required this.inboxBadge,
    required this.onSelected,
  });

  final List<_NavDestination> destinations;
  final int selectedIndex;
  final int? approvalBadge;
  final int chatBadge;
  final int inboxBadge;
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
          final badge = switch (index) {
            1 => approvalBadge ?? 0,
            2 => chatBadge,
            3 => inboxBadge,
            _ => 0,
          };

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
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Icon(
                            destination.icon,
                            size: 24,
                            color: selected
                                ? Colors.black
                                : const Color(0xFFAAA9A5),
                          ),
                          if (badge > 0)
                            Positioned(
                              right: -10,
                              top: -7,
                              child: Container(
                                constraints: const BoxConstraints(minWidth: 17),
                                height: 17,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 4,
                                ),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: Color(0xFFE34B42),
                                  borderRadius: BorderRadius.circular(9),
                                ),
                                child: Text(
                                  badge > 99 ? '99+' : '$badge',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 8,
                                    fontWeight: FontWeight.w700,
                                    height: 1,
                                  ),
                                ),
                              ),
                            ),
                        ],
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
