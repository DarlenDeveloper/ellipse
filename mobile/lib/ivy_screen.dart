import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class IvyScreen extends StatefulWidget {
  const IvyScreen({super.key});

  @override
  State<IvyScreen> createState() => _IvyScreenState();
}

class _IvyScreenState extends State<IvyScreen> {
  static const _connectionAgents = <String, (String, String)>{
    'google-workspace': ('Gmail Agent', 'assets/images/integration-gmail.png'),
    'zoho': ('Zoho Agent', 'assets/images/integration-zoho.png'),
    'smtp': ('SMTP Agent', 'assets/images/integration-smtp.png'),
    'whatsapp': ('WhatsApp Agent', 'assets/images/integration-whatsapp.png'),
    'microsoft365': (
      'Microsoft 365 Agent',
      'assets/images/integration-outlook.png',
    ),
    'mercury': ('Mercury Store Agent', 'assets/images/integration-mercury.png'),
  };
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _historySubscription;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>?
  _connectionsSubscription;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>?
  _customAgentsSubscription;
  List<Map<String, dynamic>> _messages = [];
  List<Map<String, dynamic>> _chats = [];
  List<_AgentChoice> _agents = const [
    _AgentChoice(id: 'ivy', name: 'Ivy · all agents'),
  ];
  List<String> _connectionTypes = [];
  List<_AgentChoice> _customAgents = [];
  String _agentId = 'ivy';
  String? _enterpriseId;
  String? _chatId;
  String? _error;
  bool _thinking = false;

  @override
  void initState() {
    super.initState();
    _initialise();
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    _historySubscription?.cancel();
    _connectionsSubscription?.cancel();
    _customAgentsSubscription?.cancel();
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
      final enterpriseId = profile.data()?['enterprise_id'] as String?;
      if (enterpriseId == null) throw StateError('No organisation found.');
      _enterpriseId = enterpriseId;
      _listenToAgents(enterpriseId);
      _listenToHistory(user.uid, enterpriseId);
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Ivy could not open your workspace.';
        });
      }
    }
  }

  void _listenToAgents(String enterpriseId) {
    _connectionsSubscription = FirebaseFirestore.instance
        .collection('connections')
        .where('enterprise_id', isEqualTo: enterpriseId)
        .snapshots()
        .listen((snapshot) {
          _connectionTypes = snapshot.docs
              .map((doc) => '${doc.data()['type'] ?? ''}')
              .where((type) => _connectionAgents.containsKey(type))
              .toSet()
              .toList();
          _rebuildAgents();
        }, onError: (_) {});
    _customAgentsSubscription = FirebaseFirestore.instance
        .collection('custom_agents')
        .where('enterprise_id', isEqualTo: enterpriseId)
        .snapshots()
        .listen((snapshot) {
          _customAgents = snapshot.docs
              .map(
                (doc) => _AgentChoice(
                  id: doc.id,
                  name: '${doc.data()['name'] ?? 'Custom Agent'}',
                ),
              )
              .toList();
          _rebuildAgents();
        }, onError: (_) {});
  }

  void _rebuildAgents() {
    if (!mounted) return;
    setState(() {
      _agents = [
        const _AgentChoice(id: 'ivy', name: 'Ivy · all agents'),
        ..._connectionTypes.map((type) {
          final data = _connectionAgents[type]!;
          return _AgentChoice(id: type, name: data.$1, asset: data.$2);
        }),
        ..._customAgents,
      ];
      if (!_agents.any((agent) => agent.id == _agentId)) _agentId = 'ivy';
    });
  }

  void _listenToHistory(String uid, String enterpriseId) {
    _historySubscription = FirebaseFirestore.instance
        .collection('ivy_chats')
        .where('user_id', isEqualTo: uid)
        .orderBy('updated_at', descending: true)
        .limit(30)
        .snapshots()
        .listen((snapshot) {
          if (!mounted) return;
          setState(() {
            _chats = snapshot.docs
                .map((doc) => {'id': doc.id, ...doc.data()})
                .where((chat) => chat['enterprise_id'] == enterpriseId)
                .toList();
          });
        }, onError: (_) {});
  }

  _AgentChoice get _activeAgent =>
      _agents.where((agent) => agent.id == _agentId).firstOrNull ??
      _agents.first;

  String get _firstName {
    final user = FirebaseAuth.instance.currentUser;
    return (user?.displayName ?? user?.email?.split('@').first ?? 'there')
        .split(' ')
        .first;
  }

  String get _greeting {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  Future<void> _send([String? suggested]) async {
    final text = (suggested ?? _inputController.text).trim();
    final user = FirebaseAuth.instance.currentUser;
    if (text.isEmpty || _thinking || user == null || _enterpriseId == null) {
      return;
    }
    final history = _messages
        .map(
          (message) => {
            'role': message['role'],
            'text': message['text'],
            if (message['actions'] != null) 'actions': message['actions'],
          },
        )
        .toList();
    final withUser = [
      ..._messages,
      <String, dynamic>{'role': 'user', 'text': text},
    ];
    setState(() {
      _messages = withUser;
      _thinking = true;
      _error = null;
      _inputController.clear();
    });
    _scrollDown();
    String? chatId = _chatId;
    try {
      if (chatId == null) {
        final created = await FirebaseFirestore.instance
            .collection('ivy_chats')
            .add({
              'enterprise_id': _enterpriseId,
              'user_id': user.uid,
              'agent_id': _agentId,
              'title': text.length > 60 ? text.substring(0, 60) : text,
              'messages': withUser,
              'created_at': FieldValue.serverTimestamp(),
              'updated_at': FieldValue.serverTimestamp(),
            });
        chatId = created.id;
        _chatId = chatId;
      }
      final response =
          await FirebaseFunctions.instanceFor(
            region: 'us-central1',
          ).httpsCallable('askAgent').call<Map<String, dynamic>>({
            'enterpriseId': _enterpriseId,
            'agentId': _agentId,
            'message': text,
            'history': history,
          });
      final ivyMessage = <String, dynamic>{
        'role': 'ivy',
        'text': '${response.data['reply'] ?? 'Ivy did not return a response.'}',
        if (response.data['files'] != null) 'files': response.data['files'],
        if (response.data['actions'] != null)
          'actions': response.data['actions'],
      };
      final complete = [...withUser, ivyMessage];
      if (!mounted) return;
      setState(() => _messages = complete);
      await FirebaseFirestore.instance
          .collection('ivy_chats')
          .doc(chatId)
          .update({
            'messages': complete,
            'agent_id': _agentId,
            'updated_at': FieldValue.serverTimestamp(),
          });
    } catch (_) {
      if (mounted) {
        setState(
          () =>
              _error = 'Ivy could not complete that request. Please try again.',
        );
      }
    } finally {
      if (mounted) {
        setState(() => _thinking = false);
        _scrollDown();
      }
    }
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _newChat() {
    setState(() {
      _messages = [];
      _chatId = null;
      _error = null;
      _inputController.clear();
    });
  }

  void _loadChat(Map<String, dynamic> chat) {
    setState(() {
      _chatId = '${chat['id']}';
      _agentId = '${chat['agent_id'] ?? 'ivy'}';
      _messages = (chat['messages'] as List? ?? const [])
          .map((message) => Map<String, dynamic>.from(message as Map))
          .toList();
      _error = null;
    });
    Navigator.pop(context);
    _scrollDown();
  }

  Future<void> _chooseAgent() async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => _AgentPicker(agents: _agents, selected: _agentId),
    );
    if (selected != null && mounted) setState(() => _agentId = selected);
  }

  void _showHistory() {
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Close chat history',
      barrierColor: Colors.black54,
      transitionDuration: const Duration(milliseconds: 260),
      pageBuilder: (context, animation, secondaryAnimation) => Align(
        alignment: Alignment.centerLeft,
        child: _IvyHistory(
          chats: _chats,
          agents: _agents,
          activeId: _chatId,
          onOpen: _loadChat,
        ),
      ),
      transitionBuilder: (context, animation, secondaryAnimation, child) {
        return SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(-1, 0),
            end: Offset.zero,
          ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOut)),
          child: child,
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: const Color(0xFF01030A),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            stops: [0, .48, .78, 1],
            colors: [
              Color(0xFF01030A),
              Color(0xFF020711),
              Color(0xFF072D56),
              Color(0xFF429EFF),
            ],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              _IvyHeader(
                agent: _activeAgent,
                onBack: () => Navigator.pop(context),
                onAgent: _chooseAgent,
                onNew: _newChat,
                onHistory: _showHistory,
              ),
              if (_messages.isEmpty)
                Expanded(child: _emptyState())
              else
                Expanded(
                  child: ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
                    itemCount: _messages.length + (_thinking ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == _messages.length) {
                        return const _ThinkingBubble();
                      }
                      return _IvyMessage(message: _messages[index]);
                    },
                  ),
                ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 4,
                  ),
                  child: Text(
                    _error!,
                    style: GoogleFonts.poppins(
                      color: const Color(0xFFB63830),
                      fontSize: 10,
                    ),
                  ),
                ),
              SafeArea(
                top: false,
                minimum: const EdgeInsets.only(bottom: 16),
                child: _IvyComposer(
                  controller: _inputController,
                  thinking: _thinking,
                  agentName: _activeAgent.name,
                  onSend: _send,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _emptyState() {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(22, 54, 22, 20),
      child: Column(
        children: [
          const _PremiumIvyOrb(size: 138),
          const SizedBox(height: 62),
          Text(
            '$_greeting $_firstName',
            style: GoogleFonts.poppins(
              color: Colors.white54,
              fontSize: 18,
              fontWeight: FontWeight.w400,
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'How can I help\nyou today?',
            textAlign: TextAlign.center,
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 36,
              fontWeight: FontWeight.w500,
              height: 1.15,
              letterSpacing: -1.2,
            ),
          ),
        ],
      ),
    );
  }
}

class _AgentChoice {
  const _AgentChoice({required this.id, required this.name, this.asset});
  final String id;
  final String name;
  final String? asset;
}

class _IvyHeader extends StatelessWidget {
  const _IvyHeader({
    required this.agent,
    required this.onBack,
    required this.onAgent,
    required this.onNew,
    required this.onHistory,
  });
  final _AgentChoice agent;
  final VoidCallback onBack;
  final VoidCallback onAgent;
  final VoidCallback onNew;
  final VoidCallback onHistory;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 10, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: onBack,
            icon: const Icon(
              Icons.arrow_back_ios_new_rounded,
              size: 20,
              color: Colors.white,
            ),
          ),
          Expanded(
            child: InkWell(
              onTap: onAgent,
              borderRadius: BorderRadius.circular(24),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 42,
                    height: 38,
                    child: Center(child: _AgentAvatar(agent: agent, size: 34)),
                  ),
                  const SizedBox(width: 10),
                  Flexible(
                    child: Text(
                      agent.name,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(
                    Icons.keyboard_arrow_down_rounded,
                    size: 19,
                    color: Colors.white54,
                  ),
                ],
              ),
            ),
          ),
          IconButton(
            onPressed: onHistory,
            tooltip: 'Chat history',
            icon: const Icon(
              Iconsax.archive_book,
              size: 21,
              color: Colors.white,
            ),
          ),
          const SizedBox(width: 2),
          IconButton(
            onPressed: onNew,
            tooltip: 'New chat',
            icon: const Icon(
              Iconsax.message_add,
              size: 21,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

class _IvyComposer extends StatelessWidget {
  const _IvyComposer({
    required this.controller,
    required this.thinking,
    required this.agentName,
    required this.onSend,
  });
  final TextEditingController controller;
  final bool thinking;
  final String agentName;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 64),
      margin: const EdgeInsets.fromLTRB(24, 8, 24, 0),
      padding: const EdgeInsets.fromLTRB(20, 7, 7, 7),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .13),
        borderRadius: BorderRadius.circular(34),
        border: Border.all(color: Colors.white.withValues(alpha: .28)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF78B9FF).withValues(alpha: .32),
            blurRadius: 30,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              minLines: 1,
              maxLines: 5,
              textInputAction: TextInputAction.newline,
              decoration: InputDecoration(
                hintText: agentName.startsWith('Ivy')
                    ? 'Ask anything…'
                    : 'Ask $agentName…',
                hintStyle: const TextStyle(color: Colors.white70),
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
              style: GoogleFonts.poppins(color: Colors.white, fontSize: 13),
            ),
          ),
          SizedBox.square(
            dimension: 48,
            child: IconButton.filled(
              onPressed: thinking ? null : onSend,
              style: IconButton.styleFrom(
                backgroundColor: Colors.white.withValues(alpha: .16),
                disabledBackgroundColor: Colors.white.withValues(alpha: .08),
                padding: EdgeInsets.zero,
              ),
              icon: const Icon(Iconsax.send_2, size: 22, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}

class _IvyMessage extends StatelessWidget {
  const _IvyMessage({required this.message});
  final Map<String, dynamic> message;

  @override
  Widget build(BuildContext context) {
    final mine = message['role'] == 'user';
    final files = (message['files'] as List? ?? const []);
    final actions = (message['actions'] as List? ?? const []);
    return Padding(
      padding: const EdgeInsets.only(bottom: 15),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: mine
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,
        children: [
          if (!mine) ...[
            const _PremiumIvyOrb(size: 31),
            const SizedBox(width: 9),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment: mine
                  ? CrossAxisAlignment.end
                  : CrossAxisAlignment.start,
              children: [
                Container(
                  constraints: const BoxConstraints(maxWidth: 320),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 15,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    color: mine ? const Color(0xFF171A19) : Colors.white,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(20),
                      topRight: const Radius.circular(20),
                      bottomLeft: Radius.circular(mine ? 20 : 5),
                      bottomRight: Radius.circular(mine ? 5 : 20),
                    ),
                    boxShadow: mine
                        ? null
                        : const [
                            BoxShadow(color: Color(0x0A000000), blurRadius: 10),
                          ],
                  ),
                  child: SelectableText(
                    '${message['text'] ?? ''}',
                    style: GoogleFonts.poppins(
                      color: mine ? Colors.white : const Color(0xFF454743),
                      fontSize: 11.5,
                      height: 1.55,
                    ),
                  ),
                ),
                ...files.map(
                  (file) => _IvyFileCard(
                    file: Map<String, dynamic>.from(file as Map),
                  ),
                ),
                ...actions.map(
                  (action) => _ActionReceipt(
                    action: Map<String, dynamic>.from(action as Map),
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

class _IvyFileCard extends StatelessWidget {
  const _IvyFileCard({required this.file});
  final Map<String, dynamic> file;
  @override
  Widget build(BuildContext context) {
    final url = '${file['url'] ?? ''}';
    return Padding(
      padding: const EdgeInsets.only(top: 7),
      child: InkWell(
        onTap: url.isEmpty
            ? null
            : () async => launchUrl(
                Uri.parse(url),
                mode: LaunchMode.externalApplication,
              ),
        borderRadius: BorderRadius.circular(15),
        child: Container(
          padding: const EdgeInsets.all(11),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(15),
            border: Border.all(color: const Color(0xFFE7E7EA)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Iconsax.document_download,
                size: 20,
                color: Color(0xFF4B91F7),
              ),
              const SizedBox(width: 9),
              Flexible(
                child: Text(
                  '${file['name'] ?? file['fileName'] ?? 'Generated file'}',
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.poppins(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionReceipt extends StatelessWidget {
  const _ActionReceipt({required this.action});
  final Map<String, dynamic> action;
  @override
  Widget build(BuildContext context) {
    final result = '${action['result'] ?? ''}';
    final failed =
        result.contains('"error"') ||
        result.contains('"status":"blocked"') ||
        result.contains('"status":"off"');
    final pending = result.contains('"status":"pending"');
    final color = failed
        ? const Color(0xFFB63830)
        : pending
        ? const Color(0xFF9B6717)
        : const Color(0xFF28784C);
    final background = failed
        ? const Color(0xFFFFECE9)
        : pending
        ? const Color(0xFFFFF3D9)
        : const Color(0xFFE9F7EF);
    return Container(
      margin: const EdgeInsets.only(top: 7),
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(13),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            failed ? Iconsax.close_circle : Iconsax.tick_circle,
            size: 15,
            color: color,
          ),
          const SizedBox(width: 7),
          Flexible(
            child: Text(
              '${action['name'] ?? 'Action'}'.replaceAll('_', ' '),
              style: GoogleFonts.poppins(
                color: color,
                fontSize: 9.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ThinkingBubble extends StatelessWidget {
  const _ThinkingBubble();
  @override
  Widget build(BuildContext context) => const Row(
    children: [_PremiumIvyOrb(size: 31), SizedBox(width: 9), _TypingDots()],
  );
}

class _TypingDots extends StatelessWidget {
  const _TypingDots();
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
    ),
    child: const Text(
      '•••',
      style: TextStyle(color: Color(0xFF85858B), letterSpacing: 3),
    ),
  );
}

class _PremiumIvyOrb extends StatefulWidget {
  const _PremiumIvyOrb({required this.size});
  final double size;

  @override
  State<_PremiumIvyOrb> createState() => _PremiumIvyOrbState();
}

class _PremiumIvyOrbState extends State<_PremiumIvyOrb>
    with SingleTickerProviderStateMixin {
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
            border: Border.all(color: Colors.white.withValues(alpha: .65)),
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
                  left: -size * .3,
                  top: -size * .3,
                  width: size * 1.6,
                  height: size * 1.6,
                  child: ImageFiltered(
                    imageFilter: ui.ImageFilter.blur(
                      sigmaX: size * .12,
                      sigmaY: size * .12,
                    ),
                    child: Transform.rotate(
                      angle: phase * (24 / 7) * math.pi * 2,
                      child: const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: RadialGradient(
                            radius: .62,
                            colors: [Color(0xF23884FF), Color(0x003884FF)],
                            stops: [0, .7],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: -size * .2,
                  top: -size * .2,
                  width: size * 1.4,
                  height: size * 1.4,
                  child: ImageFiltered(
                    imageFilter: ui.ImageFilter.blur(
                      sigmaX: size * .1,
                      sigmaY: size * .1,
                    ),
                    child: Transform.rotate(
                      angle: -phase * (24 / 9) * math.pi * 2,
                      child: const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: RadialGradient(
                            center: Alignment(.35, -.2),
                            radius: .58,
                            colors: [Color(0xD878BEFF), Color(0x0078BEFF)],
                            stops: [0, .65],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: -size * .1,
                  top: size * (.52 - wave * .03),
                  width: size * 1.2,
                  height: size * .34,
                  child: ImageFiltered(
                    imageFilter: ui.ImageFilter.blur(
                      sigmaX: size * .04,
                      sigmaY: size * .04,
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
                            stops: [0, .45, .6, 1],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: size * .05,
                  top: size * (.56 - wave * .03),
                  width: size * .9,
                  height: size * .14,
                  child: Transform.rotate(
                    angle: (-8 + wave * 7) * math.pi / 180,
                    child: CustomPaint(painter: const _IvyWaveLinesPainter()),
                  ),
                ),
                Positioned(
                  left: size * (.1 + wave * .02),
                  top: size * (.04 + wave * .015),
                  width: size * .58,
                  height: size * .4,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.all(Radius.circular(size)),
                      gradient: RadialGradient(
                        colors: [
                          Colors.white.withValues(alpha: .9),
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
      final distance = ((x / size.width) - .55).abs() / .55;
      paint.color = Colors.white.withValues(
        alpha: (.7 * (1 - distance)).clamp(0, .7),
      );
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _AgentAvatar extends StatelessWidget {
  const _AgentAvatar({required this.agent, required this.size});
  final _AgentChoice agent;
  final double size;
  @override
  Widget build(BuildContext context) => agent.asset == null
      ? _PremiumIvyOrb(size: size)
      : SizedBox(
          width: size,
          height: size,
          child: Center(
            child: Image.asset(
              agent.asset!,
              width: size * .68,
              height: size * .68,
            ),
          ),
        );
}

class _AgentPicker extends StatelessWidget {
  const _AgentPicker({required this.agents, required this.selected});
  final List<_AgentChoice> agents;
  final String selected;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(20, 10, 20, 24),
    decoration: const BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    child: SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 5,
            decoration: BoxDecoration(
              color: const Color(0xFFD5D5D8),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(height: 18),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Talk to',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 8),
          ...agents.map(
            (agent) => ListTile(
              onTap: () => Navigator.pop(context, agent.id),
              leading: _AgentAvatar(agent: agent, size: 38),
              title: Text(
                agent.name,
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              trailing: agent.id == selected
                  ? const Icon(Iconsax.tick_circle, color: Color(0xFF4B91F7))
                  : null,
            ),
          ),
        ],
      ),
    ),
  );
}

class _IvyHistory extends StatelessWidget {
  const _IvyHistory({
    required this.chats,
    required this.agents,
    required this.activeId,
    required this.onOpen,
  });
  final List<Map<String, dynamic>> chats;
  final List<_AgentChoice> agents;
  final String? activeId;
  final ValueChanged<Map<String, dynamic>> onOpen;
  @override
  Widget build(BuildContext context) => Material(
    color: Colors.transparent,
    child: Container(
      width: MediaQuery.sizeOf(context).width * .84,
      height: MediaQuery.sizeOf(context).height,
      padding: const EdgeInsets.fromLTRB(14, 18, 14, 20),
      decoration: const BoxDecoration(
        color: Color(0xFF171717),
        borderRadius: BorderRadius.horizontal(right: Radius.circular(24)),
      ),
      child: SafeArea(
        child: Column(
          children: [
            Row(
              children: [
                const _PremiumIvyOrb(size: 38),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Ivy',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded, color: Colors.white70),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Chats',
                style: GoogleFonts.poppins(
                  color: Colors.white54,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: chats.isEmpty
                  ? Center(
                      child: Text(
                        'No previous chats yet.',
                        style: GoogleFonts.poppins(
                          color: Colors.white54,
                          fontSize: 11,
                        ),
                      ),
                    )
                  : ListView.separated(
                      itemCount: chats.length,
                      separatorBuilder: (context, index) =>
                          const SizedBox(height: 3),
                      itemBuilder: (context, index) {
                        final chat = chats[index];
                        final agentId = '${chat['agent_id'] ?? 'ivy'}';
                        final agent =
                            agents
                                .where((item) => item.id == agentId)
                                .firstOrNull ??
                            const _AgentChoice(id: 'ivy', name: 'Ivy');
                        return ListTile(
                          onTap: () => onOpen(chat),
                          tileColor: chat['id'] == activeId
                              ? Colors.white10
                              : Colors.transparent,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          leading: _AgentAvatar(agent: agent, size: 32),
                          title: Text(
                            '${chat['title'] ?? 'Untitled chat'}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.poppins(
                              color: Colors.white,
                              fontSize: 11.5,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          subtitle: Text(
                            agent.name,
                            style: GoogleFonts.poppins(
                              fontSize: 9,
                              color: Colors.white38,
                            ),
                          ),
                          trailing: chat['id'] == activeId
                              ? const Icon(
                                  Iconsax.tick_circle,
                                  size: 18,
                                  color: Color(0xFF72B7FF),
                                )
                              : null,
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    ),
  );
}
