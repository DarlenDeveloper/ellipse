import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});
  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class AttendanceDashboardScreen extends StatefulWidget {
  const AttendanceDashboardScreen({super.key});
  @override
  State<AttendanceDashboardScreen> createState() =>
      _AttendanceDashboardScreenState();
}

class _AttendanceDashboardScreenState extends State<AttendanceDashboardScreen> {
  final _functions = FirebaseFunctions.instanceFor(region: 'us-central1');
  Map<String, dynamic>? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _data = null;
      _error = null;
    });
    try {
      final result = await _functions.httpsCallable('attendanceDashboard').call(
        {'days': 31},
      );
      if (mounted) {
        setState(() => _data = Map<String, dynamic>.from(result.data as Map));
      }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        setState(
          () => _error = e.code == 'internal'
              ? 'Attendance monitoring is not available yet.'
              : e.message ?? 'Could not load attendance monitoring.',
        );
      }
    }
  }

  List<Map<String, dynamic>> _items(String key) =>
      (_data?[key] as List? ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

  DateTime? _date(dynamic value) {
    if (value is Map) {
      final seconds = value['_seconds'] ?? value['seconds'];
      if (seconds is num) {
        return DateTime.fromMillisecondsSinceEpoch(
          seconds.toInt() * 1000,
          isUtc: true,
        ).toLocal();
      }
    }
    return null;
  }

  String _time(dynamic value) {
    final date = _date(value);
    if (date == null) return '--:--';
    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
    return '$hour:${date.minute.toString().padLeft(2, '0')} ${date.hour < 12 ? 'AM' : 'PM'}';
  }

  @override
  Widget build(BuildContext context) {
    final current = _items('current');
    final sessions = _items('sessions');
    final events = _items('events');
    final fieldReports = events
        .where((e) => e['type'] == 'return_from_field_work')
        .toList();
    final working = current.where((e) => e['status'] == 'working').length;
    final field = current.where((e) => e['status'] == 'field_work').length;
    final out = current.where((e) => e['status'] == 'clocked_out').length;
    final closed = sessions.where((e) => e['status'] == 'closed').toList();
    final totalSeconds = closed.fold<int>(
      0,
      (sum, item) => sum + ((item['worked_seconds'] as num?)?.toInt() ?? 0),
    );
    final averageHours = closed.isEmpty
        ? 0.0
        : totalSeconds / closed.length / 3600;
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FB),
      body: _data == null && _error == null
          ? const _AttendanceDashboardSkeleton()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: EdgeInsets.fromLTRB(
                  20,
                  MediaQuery.paddingOf(context).top + 8,
                  20,
                  38,
                ),
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
                      const SizedBox(width: 4),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Team attendance',
                            style: GoogleFonts.poppins(
                              fontSize: 21,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const Text(
                            'Workforce overview · Last 31 days',
                            style: TextStyle(
                              fontSize: 10,
                              color: Color(0xFF8991A0),
                            ),
                          ),
                        ],
                      ),
                      const Spacer(),
                      _iconButton(Iconsax.export_1),
                    ],
                  ),
                  const SizedBox(height: 22),
                  if (_error != null) _errorCard(_error!),
                  Row(
                    children: [
                      Expanded(
                        child: _metric(
                          '$working',
                          'Working now',
                          Iconsax.timer_start,
                          const Color(0xFF3566F6),
                          '+ Live',
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _metric(
                          '$field',
                          'On field work',
                          Iconsax.routing,
                          const Color(0xFF8B5CF6),
                          '${fieldReports.length} reports',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: _metric(
                          '${sessions.length}',
                          'Work days',
                          Iconsax.calendar_1,
                          const Color(0xFF16A77A),
                          '31-day total',
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _metric(
                          '${averageHours.toStringAsFixed(1)}h',
                          'Avg. workday',
                          Iconsax.clock,
                          const Color(0xFFF29B43),
                          '${closed.length} completed',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _analyticsCard(sessions),
                  const SizedBox(height: 24),
                  _statusCard(working, field, out, current.length),
                  const SizedBox(height: 24),
                  _sectionHeader('Live team', '${current.length} employees'),
                  const SizedBox(height: 10),
                  if (current.isEmpty)
                    _empty('No team attendance records yet.'),
                  ...current.map(_employeeRow),
                  const SizedBox(height: 22),
                  _sectionHeader(
                    'Field-work reports',
                    '${fieldReports.length} total',
                  ),
                  const SizedBox(height: 10),
                  if (fieldReports.isEmpty)
                    _empty('No field-work reports in the last 31 days.'),
                  ...fieldReports.take(12).map(_reportRow),
                ],
              ),
            ),
    );
  }

  Widget _iconButton(IconData icon) => Container(
    width: 42,
    height: 42,
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: const Color(0xFFE7EAF0)),
    ),
    child: Icon(icon, size: 20),
  );

  Widget _metric(
    String value,
    String label,
    IconData icon,
    Color color,
    String note,
  ) => Container(
    height: 166,
    padding: const EdgeInsets.all(17),
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Color.lerp(Colors.white, color, .20)!,
          Color.lerp(Colors.white, color, .07)!,
        ],
      ),
      borderRadius: BorderRadius.circular(28),
      border: Border.all(color: Colors.white.withValues(alpha: .65)),
      boxShadow: [
        BoxShadow(
          color: color.withValues(alpha: .08),
          blurRadius: 18,
          offset: Offset(0, 6),
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
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF17233A),
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
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    value,
                    style: const TextStyle(
                      fontSize: 27,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF17233A),
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    note,
                    style: TextStyle(
                      fontSize: 9,
                      color: color,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(
              width: 44,
              height: 42,
              child: CustomPaint(painter: _AttendanceMiniChart(color)),
            ),
          ],
        ),
      ],
    ),
  );

  Widget _analyticsCard(List<Map<String, dynamic>> sessions) {
    final now = DateTime.now();
    final counts = List<int>.filled(7, 0);
    for (final session in sessions) {
      final date = _date(session['started_at']);
      if (date != null) {
        final age = DateTime(
          now.year,
          now.month,
          now.day,
        ).difference(DateTime(date.year, date.month, date.day)).inDays;
        if (age >= 0 && age < 7) counts[6 - age]++;
      }
    }
    final maxValue = counts.fold<int>(1, (a, b) => a > b ? a : b);
    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionHeader('Weekly attendance', 'Last 7 days'),
          const SizedBox(height: 22),
          SizedBox(
            height: 142,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: List.generate(7, (index) {
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 5),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(
                          '${counts[index]}',
                          style: const TextStyle(
                            fontSize: 9,
                            color: Color(0xFF8991A0),
                          ),
                        ),
                        const SizedBox(height: 5),
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 450),
                          height: 16 + (82 * counts[index] / maxValue),
                          decoration: BoxDecoration(
                            color: index == 6
                                ? const Color(0xFF3566F6)
                                : const Color(0xFFDDE5FF),
                            borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(8),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          labels[index],
                          style: const TextStyle(
                            fontSize: 10,
                            color: Color(0xFF7C8493),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }

  Widget _statusCard(int working, int field, int out, int total) {
    final divisor = total == 0 ? 1 : total;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF192723),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Workforce distribution',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Live status across your organization',
            style: TextStyle(color: Colors.white54, fontSize: 10),
          ),
          const SizedBox(height: 20),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LayoutBuilder(
              builder: (context, constraints) => SizedBox(
                height: 12,
                child: Row(
                  children: [
                    Container(
                      width: constraints.maxWidth * working / divisor,
                      color: const Color(0xFF4E7BFF),
                    ),
                    Container(
                      width: constraints.maxWidth * field / divisor,
                      color: const Color(0xFFA78BFA),
                    ),
                    Expanded(child: Container(color: const Color(0xFF53615D))),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _legend('Working', working, const Color(0xFF4E7BFF)),
              const Spacer(),
              _legend('Field', field, const Color(0xFFA78BFA)),
              const Spacer(),
              _legend('Off duty', out, const Color(0xFF7B8884)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _legend(String label, int value, Color color) => Row(
    children: [
      Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
      const SizedBox(width: 6),
      Text(
        '$label  $value',
        style: const TextStyle(color: Colors.white70, fontSize: 10),
      ),
    ],
  );

  Widget _sectionHeader(String title, String trailing) => Row(
    children: [
      Text(
        title,
        style: GoogleFonts.poppins(fontSize: 17, fontWeight: FontWeight.w700),
      ),
      const Spacer(),
      Text(
        trailing,
        style: const TextStyle(fontSize: 10, color: Color(0xFF8991A0)),
      ),
    ],
  );

  Widget _employeeRow(Map<String, dynamic> item) {
    final status = '${item['status'] ?? 'clocked_out'}';
    final color = status == 'working'
        ? const Color(0xFF16A77A)
        : status == 'field_work'
        ? const Color(0xFF8B5CF6)
        : const Color(0xFF8991A0);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(19),
      ),
      child: Row(
        children: [
          Stack(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: const Color(0xFFEEF2F6),
                child: Text(
                  '${item['employee_name'] ?? 'E'}'
                      .substring(0, 1)
                      .toUpperCase(),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              Positioned(
                right: 0,
                bottom: 1,
                child: Container(
                  width: 11,
                  height: 11,
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
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
                  '${item['employee_name'] ?? 'Employee'}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  status.replaceAll('_', ' '),
                  style: TextStyle(fontSize: 10, color: color),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _time(item['last_action_at']),
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Text(
                'last update',
                style: TextStyle(fontSize: 9, color: Color(0xFF9AA1AD)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _reportRow(Map<String, dynamic> item) => Container(
    margin: const EdgeInsets.only(bottom: 10),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(19),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: const Color(0xFFF0EBFF),
            borderRadius: BorderRadius.circular(13),
          ),
          child: const Icon(
            Iconsax.routing,
            color: Color(0xFF8B5CF6),
            size: 20,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${item['employee_name'] ?? 'Employee'} · ${item['client'] ?? 'Field work'}',
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${item['outcome'] ?? item['reason'] ?? ''}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 10,
                  color: Color(0xFF7C8493),
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
  Widget _empty(String text) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 14),
    child: Text(text, style: const TextStyle(color: Color(0xFF777772))),
  );
  Widget _errorCard(String text) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: const Color(0xFFFFE9E7),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Text(text, style: const TextStyle(color: Color(0xFF9D2922))),
  );
}

class _AttendanceMiniChart extends CustomPainter {
  const _AttendanceMiniChart(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final muted = Paint()
      ..color = Colors.white.withValues(alpha: .7)
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    final accent = Paint()
      ..color = color
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    const heights = [16.0, 27.0, 20.0, 36.0];
    for (var index = 0; index < heights.length; index++) {
      final x = 5.0 + index * 11;
      canvas.drawLine(
        Offset(x, size.height - 3),
        Offset(x, size.height - heights[index]),
        index == heights.length - 1 ? accent : muted,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _AttendanceMiniChart oldDelegate) =>
      oldDelegate.color != color;
}

class _AttendanceDashboardSkeleton extends StatefulWidget {
  const _AttendanceDashboardSkeleton();
  @override
  State<_AttendanceDashboardSkeleton> createState() =>
      _AttendanceDashboardSkeletonState();
}

class _AttendanceDashboardSkeletonState
    extends State<_AttendanceDashboardSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final color = Color.lerp(
          const Color(0xFFE6E9EF),
          const Color(0xFFF2F4F7),
          _controller.value,
        )!;
        Widget block({double? width, double height = 18, double radius = 10}) =>
            Container(
              width: width,
              height: height,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(radius),
              ),
            );
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Row(
              children: [
                block(width: 42, height: 42, radius: 14),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      block(width: 180, height: 21),
                      const SizedBox(height: 7),
                      block(width: 130, height: 10),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 26),
            Row(
              children: [
                Expanded(child: block(height: 145, radius: 22)),
                const SizedBox(width: 12),
                Expanded(child: block(height: 145, radius: 22)),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: block(height: 145, radius: 22)),
                const SizedBox(width: 12),
                Expanded(child: block(height: 145, radius: 22)),
              ],
            ),
            const SizedBox(height: 24),
            block(height: 220, radius: 24),
            const SizedBox(height: 24),
            block(height: 145, radius: 24),
            const SizedBox(height: 24),
            block(width: 150, height: 20),
            const SizedBox(height: 12),
            ...List.generate(
              3,
              (_) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: block(height: 76, radius: 19),
              ),
            ),
          ],
        );
      },
    ),
  );
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  Map<String, dynamic>? _current;
  Map<String, dynamic>? _settings;
  List<Map<String, dynamic>> _sessions = [];
  List<Map<String, dynamic>> _fieldReports = [];
  String _role = 'employee';
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  Timer? _elapsedTimer;

  @override
  void initState() {
    super.initState();
    _load();
    _elapsedTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted && _status != 'clocked_out') setState(() {});
    });
  }

  @override
  void dispose() {
    _elapsedTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await FirebaseFunctions.instanceFor(
        region: 'us-central1',
      ).httpsCallable('attendanceStatus').call();
      final data = Map<String, dynamic>.from(result.data as Map);
      if (!mounted) return;
      setState(() {
        _current = data['current'] == null
            ? null
            : Map<String, dynamic>.from(data['current'] as Map);
        _settings = data['settings'] == null
            ? null
            : Map<String, dynamic>.from(data['settings'] as Map);
        _role = '${data['role'] ?? 'employee'}';
        _sessions = (data['recentSessions'] as List? ?? const [])
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
        _fieldReports = (data['recentFieldWork'] as List? ?? const [])
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
      });
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        setState(() => _error = _friendlyError(e));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<Position> _position() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw Exception('Turn on location services to continue.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      throw Exception(
        'Location permission is required for attendance actions.',
      );
    }
    if (permission == LocationPermission.deniedForever) {
      throw Exception(
        'Enable location access for Ellipse in your device settings.',
      );
    }
    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 20),
      ),
    );
  }

  String _friendlyError(FirebaseFunctionsException error) {
    if (error.code == 'internal') {
      return 'Attendance service is not available yet. Please try again shortly.';
    }
    return error.message ?? 'Attendance could not be loaded.';
  }

  Future<Map<String, String>?> _details(String action) async {
    if (action != 'start_field_work' &&
        action != 'return_from_field_work' &&
        action != 'clock_out') {
      return const {};
    }
    final reason = TextEditingController();
    final client = TextEditingController();
    final outcome = TextEditingController();
    final value = await showModalBottomSheet<Map<String, String>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          22,
          24,
          22,
          24 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              action == 'clock_out'
                  ? 'Clock out'
                  : action == 'return_from_field_work'
                  ? 'Complete field work'
                  : 'Start field work',
              style: GoogleFonts.poppins(
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 18),
            if (action == 'start_field_work') ...[
              TextField(
                controller: client,
                textCapitalization: TextCapitalization.words,
                decoration: _input('Client or destination (optional)'),
              ),
              const SizedBox(height: 12),
            ],
            if (action != 'return_from_field_work')
              TextField(
                controller: reason,
                textCapitalization: TextCapitalization.sentences,
                maxLines: 3,
                decoration: _input(
                  action == 'start_field_work'
                      ? 'Purpose or reason (required)'
                      : 'Closing note (optional)',
                ),
              ),
            if (action == 'return_from_field_work')
              TextField(
                controller: outcome,
                textCapitalization: TextCapitalization.sentences,
                maxLines: 4,
                decoration: _input('Outcome and work completed (required)'),
              ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF1D2825),
                ),
                onPressed: () {
                  if (action == 'start_field_work' &&
                      reason.text.trim().isEmpty) {
                    return;
                  }
                  if (action == 'return_from_field_work' &&
                      outcome.text.trim().isEmpty) {
                    return;
                  }
                  Navigator.pop(context, {
                    'reason': reason.text.trim(),
                    'client': client.text.trim(),
                    'outcome': outcome.text.trim(),
                  });
                },
                child: const Text('Continue and capture location'),
              ),
            ),
          ],
        ),
      ),
    );
    reason.dispose();
    client.dispose();
    outcome.dispose();
    return value;
  }

  InputDecoration _input(String label) => InputDecoration(
    labelText: label,
    filled: true,
    fillColor: const Color(0xFFF4F4F1),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: BorderSide.none,
    ),
  );

  Future<void> _act(String action) async {
    final details = await _details(action);
    if (details == null) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final position = await _position();
      await FirebaseFunctions.instanceFor(
        region: 'us-central1',
      ).httpsCallable('attendanceAction').call({
        'action': action,
        'reason': details['reason'],
        'client': details['client'],
        'outcome': details['outcome'],
        'location': {
          'latitude': position.latitude,
          'longitude': position.longitude,
          'accuracy': position.accuracy,
        },
      });
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(_actionLabel(action))));
      }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        setState(() => _error = _friendlyError(e));
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _actionLabel(String value) =>
      {
        'clock_in': 'Clocked in',
        'clock_out': 'Clocked out',
        'start_field_work': 'Field work started',
        'return_from_field_work': 'Welcome back from field work',
      }[value] ??
      value;
  String get _status => '${_current?['status'] ?? 'clocked_out'}';
  DateTime? _date(dynamic value) {
    if (value is Map) {
      final seconds = value['_seconds'] ?? value['seconds'];
      if (seconds is num) {
        return DateTime.fromMillisecondsSinceEpoch(
          seconds.toInt() * 1000,
          isUtc: true,
        ).toLocal();
      }
    }
    return null;
  }

  String _dateLabel(dynamic value) {
    final date = _date(value);
    if (date == null) return 'Recently';
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final minute = date.minute.toString().padLeft(2, '0');
    return '${date.day} ${months[date.month - 1]} · ${date.hour.toString().padLeft(2, '0')}:$minute';
  }

  String _duration(dynamic seconds) {
    final value = seconds is num ? seconds.toInt() : 0;
    final hours = value ~/ 3600;
    final minutes = (value % 3600) ~/ 60;
    return hours > 0 ? '${hours}h ${minutes}m' : '${minutes}m';
  }

  String get _elapsedToday {
    if (_status == 'clocked_out') return '--';
    final started = _date(_current?['clocked_in_at']);
    if (started == null) return '--';
    final seconds = DateTime.now().difference(started).inSeconds;
    return _duration(seconds < 0 ? 0 : seconds);
  }

  Map<String, dynamic>? get _todaySchedule {
    const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    final days = _settings?['days'];
    final day = days is Map ? days[keys[DateTime.now().weekday - 1]] : null;
    return day is Map ? Map<String, dynamic>.from(day) : null;
  }

  String _time(dynamic value) {
    final date = _date(value);
    if (date == null) return '--:--';
    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
    return '$hour:${date.minute.toString().padLeft(2, '0')}${date.hour < 12 ? 'am' : 'pm'}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: _loading
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  Container(
                    color: const Color(0xFFF7F8FA),
                    padding: EdgeInsets.fromLTRB(
                      24,
                      MediaQuery.paddingOf(context).top + 14,
                      24,
                      28,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            IconButton(
                              onPressed: () => Navigator.maybePop(context),
                              icon: const Icon(
                                Icons.arrow_back_ios_new_rounded,
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 2),
                            Text(
                              'Attendance',
                              style: GoogleFonts.poppins(
                                fontSize: 21,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const Spacer(),
                            const Icon(
                              Iconsax.notification,
                              size: 23,
                              color: Color(0xFF4D5565),
                            ),
                          ],
                        ),
                        const SizedBox(height: 26),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _status == 'field_work'
                                        ? 'Field work in progress'
                                        : _status == 'working'
                                        ? 'You are checked in'
                                        : 'Track check-ins and\nwork hours with ease',
                                    style: GoogleFonts.poppins(
                                      fontSize: 17,
                                      height: 1.35,
                                      color: const Color(0xFF505867),
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  const SizedBox(height: 20),
                                  _heroAction(),
                                ],
                              ),
                            ),
                            const SizedBox(width: 16),
                            SizedBox(
                              width: 128,
                              height: 128,
                              child: Image.asset(
                                'assets/images/attendance-clock.png',
                                fit: BoxFit.contain,
                                filterQuality: FilterQuality.high,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 36),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (_error != null)
                          Container(
                            margin: const EdgeInsets.only(bottom: 16),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFE9E7),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Text(
                              _error!,
                              style: const TextStyle(color: Color(0xFF9D2922)),
                            ),
                          ),
                        _scheduleCard(),
                        const SizedBox(height: 18),
                        if (_status == 'working') ...[
                          _button(
                            'Start field work',
                            Iconsax.routing,
                            'start_field_work',
                          ),
                          const SizedBox(height: 12),
                          _button(
                            'Clock out',
                            Iconsax.logout,
                            'clock_out',
                            outlined: true,
                          ),
                        ],
                        if (_status == 'field_work') ...[
                          _button(
                            'Back from field work',
                            Iconsax.location_tick,
                            'return_from_field_work',
                          ),
                          const SizedBox(height: 12),
                          _button(
                            'Clock out',
                            Iconsax.logout,
                            'clock_out',
                            outlined: true,
                          ),
                        ],
                        if (_status != 'clocked_out')
                          const SizedBox(height: 24),
                        if (_role == 'owner') ...[
                          _button(
                            'Owner attendance dashboard',
                            Iconsax.chart_2,
                            'dashboard',
                            outlined: true,
                          ),
                          const SizedBox(height: 24),
                        ],
                        Row(
                          children: [
                            Text(
                              'Attendance History',
                              style: GoogleFonts.poppins(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const Spacer(),
                            Text(
                              'Recent',
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                color: const Color(0xFF687080),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        if (_sessions.isEmpty)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 22),
                            child: Center(
                              child: Text(
                                'No attendance history yet.',
                                style: TextStyle(color: Color(0xFF9299A5)),
                              ),
                            ),
                          ),
                        if (_sessions.isNotEmpty) ...[
                          ..._sessions.take(8).map(_historyTile),
                        ],
                        if (_fieldReports.isNotEmpty) ...[
                          const SizedBox(height: 22),
                          Text(
                            'Field Work Reports',
                            style: GoogleFonts.poppins(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 12),
                          ..._fieldReports
                              .take(5)
                              .map(
                                (report) => _activityTile(
                                  Iconsax.routing,
                                  '${report['client'] ?? 'Field work'}',
                                  '${report['outcome'] ?? report['reason'] ?? ''}',
                                  _dateLabel(report['occurred_at']),
                                ),
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

  Widget _heroAction() {
    final action = _status == 'clocked_out'
        ? 'clock_in'
        : _status == 'field_work'
        ? 'return_from_field_work'
        : 'clock_out';
    final label = _status == 'clocked_out'
        ? 'Clock In'
        : _status == 'field_work'
        ? 'Complete Field Work'
        : 'Clock Out';
    return FilledButton.icon(
      onPressed: _submitting ? null : () => _act(action),
      icon: _submitting
          ? const SizedBox.square(
              dimension: 15,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            )
          : Icon(
              _status == 'clocked_out' ? Iconsax.timer_start : Iconsax.logout,
              size: 18,
            ),
      label: Text(label),
      style: FilledButton.styleFrom(
        backgroundColor: const Color(0xFF3566F6),
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        shape: const StadiumBorder(),
      ),
    );
  }

  Widget _scheduleCard() {
    final day = _todaySchedule;
    final start = day?['start'] ?? '--:--';
    final end = day?['end'] ?? '--:--';
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 19),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFFE5E7EC)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          _scheduleValue('Clock in Time', '$start'),
          _divider(),
          _scheduleValue('Hours Today', _elapsedToday),
          _divider(),
          _scheduleValue('Clock Out Time', '$end'),
        ],
      ),
    );
  }

  Widget _divider() =>
      Container(width: 1, height: 42, color: const Color(0xFFE5E7EC));
  Widget _scheduleValue(String label, String value) => Expanded(
    child: Column(
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 10, color: Color(0xFF737B89)),
        ),
        const SizedBox(height: 7),
        Text(
          value,
          style: const TextStyle(
            fontSize: 15,
            color: Color(0xFF505867),
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );

  Widget _historyTile(Map<String, dynamic> session) {
    final start = _date(session['started_at']);
    final end = _date(session['ended_at']);
    final scheduled = _todaySchedule?['start']?.toString().split(':');
    var late = false;
    if (start != null && scheduled != null && scheduled.length == 2) {
      late =
          start.hour * 60 + start.minute >
          (int.tryParse(scheduled[0]) ?? 0) * 60 +
              (int.tryParse(scheduled[1]) ?? 0) +
              5;
    }
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final date = start == null
        ? 'Work day'
        : '${start.day}th ${months[start.month - 1]}, ${start.year}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          const CircleAvatar(
            radius: 23,
            backgroundColor: Color(0xFFEEF2FF),
            child: Icon(
              Iconsax.timer_start,
              color: Color(0xFF3566F6),
              size: 21,
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(date, style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(
                  '${_time(session['started_at'])} - ${end == null ? 'In progress' : _time(session['ended_at'])}',
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF9AA1AD),
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _duration(session['worked_seconds']),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(
                  color: late
                      ? const Color(0xFFFFF1E6)
                      : const Color(0xFFE8F9F2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  late ? 'Late' : 'On time',
                  style: TextStyle(
                    fontSize: 10,
                    color: late
                        ? const Color(0xFFF28A38)
                        : const Color(0xFF20AF7A),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _button(
    String label,
    IconData icon,
    String action, {
    bool outlined = false,
  }) => SizedBox(
    width: double.infinity,
    height: 58,
    child: outlined
        ? OutlinedButton.icon(
            onPressed: _submitting
                ? null
                : () => action == 'dashboard'
                      ? Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => const AttendanceDashboardScreen(),
                          ),
                        )
                      : _act(action),
            icon: Icon(icon),
            label: Text(label),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF1D2825),
              side: const BorderSide(color: Color(0xFF1D2825)),
              shape: const StadiumBorder(),
            ),
          )
        : FilledButton.icon(
            onPressed: _submitting
                ? null
                : () => action == 'dashboard'
                      ? Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => const AttendanceDashboardScreen(),
                          ),
                        )
                      : _act(action),
            icon: _submitting
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Icon(icon),
            label: Text(label),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF1D2825),
              shape: const StadiumBorder(),
            ),
          ),
  );

  Widget _activityTile(
    IconData icon,
    String title,
    String subtitle,
    String meta,
  ) => Container(
    margin: const EdgeInsets.only(bottom: 10),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
    ),
    child: Row(
      children: [
        CircleAvatar(
          backgroundColor: const Color(0xFFF0F2EF),
          child: Icon(icon, size: 19, color: const Color(0xFF1D2825)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 3),
              Text(
                subtitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11, color: Color(0xFF777772)),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Text(
          meta,
          style: const TextStyle(fontSize: 10, color: Color(0xFF999994)),
        ),
      ],
    ),
  );
}
