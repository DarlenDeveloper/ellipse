// Owner/admin-only per-employee attendance monitoring.
//
// Shows an individual employee's field-work routes on a Google Map (polyline +
// dwell markers) plus graphs (hours worked per day, field-work time). Data comes
// from the owner/admin-gated `attendanceEmployeeDetail` callable.

import 'dart:math' as math;

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:latlong2/latlong.dart';

const _dark = Color(0xFF1D2825);
const _fill = Color(0xFFF4F4F1);

class AttendanceEmployeeDetailScreen extends StatefulWidget {
  const AttendanceEmployeeDetailScreen({
    super.key,
    required this.employeeUid,
    required this.employeeName,
  });

  final String employeeUid;
  final String employeeName;

  @override
  State<AttendanceEmployeeDetailScreen> createState() =>
      _AttendanceEmployeeDetailScreenState();
}

class _AttendanceEmployeeDetailScreenState
    extends State<AttendanceEmployeeDetailScreen> {
  final _functions = FirebaseFunctions.instanceFor(region: 'us-central1');
  Map<String, dynamic>? _data;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await _functions
          .httpsCallable('attendanceEmployeeDetail')
          .call({'employeeUid': widget.employeeUid, 'days': 14});
      if (mounted) {
        setState(() {
          _data = Map<String, dynamic>.from(result.data as Map);
          _loading = false;
        });
      }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message ?? 'Could not load employee monitoring.';
          _loading = false;
        });
      }
    }
  }

  List<Map<String, dynamic>> _list(String key) =>
      (_data?[key] as List? ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

  int _millis(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is Map) {
      final seconds = value['_seconds'] ?? value['seconds'];
      if (seconds is num) return seconds.toInt() * 1000;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FB),
      body: _loading
          ? const _EmployeeDetailSkeleton()
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
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.employeeName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.poppins(
                                fontSize: 21,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const Text(
                              'Individual monitoring · Last 14 days',
                              style: TextStyle(
                                fontSize: 10,
                                color: Color(0xFF8991A0),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 22),
                  if (_error != null)
                    _errorCard(_error!)
                  else
                    ..._content(),
                ],
              ),
            ),
    );
  }

  Widget _errorCard(String text) => Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFFFE9E7),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            const Icon(Iconsax.warning_2, color: Color(0xFF9D2922), size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(text,
                  style: const TextStyle(color: Color(0xFF9D2922))),
            ),
            TextButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );

  List<Widget> _content() {
    final sessions = _list('sessions');
    final events = _list('events');
    final tracks = _list('tracks');

    final closed = sessions.where((s) => s['status'] == 'closed').toList();
    final totalSeconds = closed.fold<int>(
      0,
      (sum, s) => sum + ((s['worked_seconds'] as num?)?.toInt() ?? 0),
    );
    final fieldEvents =
        events.where((e) => e['type'] == 'return_from_field_work').toList();
    final fieldSeconds = fieldEvents.fold<int>(
      0,
      (sum, e) => sum + ((e['duration_seconds'] as num?)?.toInt() ?? 0),
    );
    final autoClosed = sessions.where((s) => s['auto_closed'] == true).length;
    final outOfOffice = sessions.where((s) => s['out_of_office'] == true).length;

    return [
      Row(
        children: [
          Expanded(
            child: _metric('${closed.length}', 'Days worked',
                Iconsax.calendar_tick, const Color(0xFF16A77A),
                outOfOffice > 0 ? '$outOfOffice out-of-office' : 'Last 14 days'),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _metric((totalSeconds / 3600).toStringAsFixed(1),
                'Total hours', Iconsax.clock, const Color(0xFF3566F6),
                '${closed.length} sessions'),
          ),
        ],
      ),
      const SizedBox(height: 12),
      Row(
        children: [
          Expanded(
            child: _metric('${fieldEvents.length}', 'Field trips',
                Iconsax.routing, const Color(0xFF8B5CF6),
                '${(fieldSeconds / 3600).toStringAsFixed(1)}h on site'),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _metric('$autoClosed', 'Auto clock-outs',
                Iconsax.timer_pause, const Color(0xFFF29B43),
                autoClosed > 0 ? 'Needs review' : 'All on time'),
          ),
        ],
      ),
      const SizedBox(height: 24),
      _sectionHeader('Field-work routes',
          '${tracks.where((t) => (t['points'] as List? ?? const []).length >= 2).length} recorded'),
      const SizedBox(height: 12),
      ..._routeCards(tracks),
      const SizedBox(height: 24),
      _analyticsCard(_dailyHours(closed)),
      const SizedBox(height: 24),
      _sectionHeader('Recent activity', '${events.length} events'),
      const SizedBox(height: 10),
      if (events.isEmpty) _empty('No attendance activity yet.'),
      ...events.take(20).map(_activityTile),
    ];
  }

  // ---- Route rendering --------------------------------------------------

  List<Widget> _routeCards(List<Map<String, dynamic>> tracks) {
    final withPoints = tracks.where((t) {
      final pts = (t['points'] as List? ?? const []);
      return pts.length >= 2;
    }).toList();

    if (withPoints.isEmpty) {
      return [
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: const BoxDecoration(
                  color: Color(0xFFF0F2EF),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Iconsax.map, color: Color(0xFF1D2825)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  'No routes recorded yet. Field-work routes appear here once '
                  'the employee starts a field trip with location tracking on.',
                  style: GoogleFonts.poppins(
                      fontSize: 12.5,
                      height: 1.45,
                      color: const Color(0xFF687080)),
                ),
              ),
            ],
          ),
        ),
      ];
    }

    return withPoints.map((track) {
      final points = (track['points'] as List)
          .map((p) => Map<String, dynamic>.from(p as Map))
          .toList();
      final dwell = (track['dwell'] as List? ?? const [])
          .map((d) => Map<String, dynamic>.from(d as Map))
          .toList();
      final latLngs = points
          .map((p) => LatLng((p['latitude'] as num).toDouble(),
              (p['longitude'] as num).toDouble()))
          .toList();

      final markers = <Marker>[
        _pinMarker(latLngs.first, const Color(0xFF16A77A), Iconsax.location),
        _pinMarker(latLngs.last, const Color(0xFFD64545), Iconsax.location_tick),
        for (final d in dwell)
          _dwellMarker(
            LatLng((d['latitude'] as num).toDouble(),
                (d['longitude'] as num).toDouble()),
            _durationLabel((d['seconds'] as num?)?.toInt() ?? 0),
          ),
      ];

      return Container(
        margin: const EdgeInsets.only(bottom: 16),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 240,
              child: FlutterMap(
                options: MapOptions(
                  initialCameraFit: CameraFit.bounds(
                    bounds: _bounds(latLngs),
                    padding: const EdgeInsets.all(36),
                  ),
                  interactionOptions: const InteractionOptions(
                    flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag,
                  ),
                ),
                children: [
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.ellipse.ellipse_companion',
                  ),
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: latLngs,
                        color: _dark,
                        strokeWidth: 4,
                      ),
                    ],
                  ),
                  MarkerLayer(markers: markers),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  const Icon(Iconsax.routing, size: 18, color: _dark),
                  const SizedBox(width: 8),
                  Text(
                    '${latLngs.length} points',
                    style: GoogleFonts.poppins(
                        fontSize: 12.5, fontWeight: FontWeight.w600),
                  ),
                  const Spacer(),
                  if (dwell.isNotEmpty)
                    Text(
                      '${dwell.length} stop${dwell.length == 1 ? '' : 's'}',
                      style: GoogleFonts.poppins(
                          fontSize: 12, color: const Color(0xFF687080)),
                    ),
                ],
              ),
            ),
          ],
        ),
      );
    }).toList();
  }

  Marker _pinMarker(LatLng point, Color color, IconData icon) => Marker(
        point: point,
        width: 34,
        height: 34,
        alignment: Alignment.topCenter,
        child: Icon(icon, color: color, size: 30),
      );

  Marker _dwellMarker(LatLng point, String label) => Marker(
        point: point,
        width: 64,
        height: 46,
        alignment: Alignment.topCenter,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Iconsax.clock, color: Color(0xFFB77900), size: 22),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: const Color(0xFFB77900),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                label,
                style: GoogleFonts.poppins(
                    fontSize: 9,
                    color: Colors.white,
                    fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );

  LatLngBounds _bounds(List<LatLng> points) {
    var minLat = points.first.latitude, maxLat = points.first.latitude;
    var minLng = points.first.longitude, maxLng = points.first.longitude;
    for (final p in points) {
      minLat = math.min(minLat, p.latitude);
      maxLat = math.max(maxLat, p.latitude);
      minLng = math.min(minLng, p.longitude);
      maxLng = math.max(maxLng, p.longitude);
    }
    // Guard against a zero-area bounds (single stationary cluster) which some
    // fit algorithms dislike.
    if ((maxLat - minLat).abs() < 0.0005) {
      minLat -= 0.0025;
      maxLat += 0.0025;
    }
    if ((maxLng - minLng).abs() < 0.0005) {
      minLng -= 0.0025;
      maxLng += 0.0025;
    }
    return LatLngBounds(LatLng(minLat, minLng), LatLng(maxLat, maxLng));
  }

  // ---- Charts -----------------------------------------------------------

  List<_Bar> _dailyHours(List<Map<String, dynamic>> closed) {
    final byDay = <String, double>{};
    for (final s in closed) {
      final key = '${s['date_key'] ?? ''}';
      if (key.isEmpty) continue;
      final hours = ((s['worked_seconds'] as num?)?.toInt() ?? 0) / 3600;
      byDay[key] = (byDay[key] ?? 0) + hours;
    }
    final keys = byDay.keys.toList()..sort();
    return keys
        .map((k) =>
            _Bar(label: k.length >= 5 ? k.substring(5) : k, value: byDay[k]!))
        .toList();
  }

  // ---- Small widgets (matching the team dashboard house style) ----------

  Widget _metric(
    String value,
    String label,
    IconData icon,
    Color color,
    String note,
  ) =>
      Container(
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
              offset: const Offset(0, 6),
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
      );

  Widget _sectionHeader(String title, String trailing) => Row(
        children: [
          Text(
            title,
            style:
                GoogleFonts.poppins(fontSize: 17, fontWeight: FontWeight.w700),
          ),
          const Spacer(),
          Text(
            trailing,
            style: const TextStyle(fontSize: 10, color: Color(0xFF8991A0)),
          ),
        ],
      );

  Widget _empty(String text) => Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.all(20),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(text, style: const TextStyle(color: Color(0xFF777772))),
      );

  Widget _analyticsCard(List<_Bar> bars) {
    final maxValue = bars.isEmpty
        ? 1.0
        : bars.map((b) => b.value).reduce(math.max).clamp(1.0, double.infinity);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionHeader('Hours worked', 'Per day'),
          const SizedBox(height: 22),
          if (bars.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text('No completed sessions yet.',
                    style: TextStyle(color: Color(0xFF9299A5))),
              ),
            )
          else
            SizedBox(
              height: 142,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (var i = 0; i < bars.length; i++)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 5),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Text(
                              bars[i].value.toStringAsFixed(1),
                              style: const TextStyle(
                                  fontSize: 9, color: Color(0xFF8991A0)),
                            ),
                            const SizedBox(height: 5),
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 450),
                              height: 16 + (82 * bars[i].value / maxValue),
                              decoration: BoxDecoration(
                                color: i == bars.length - 1
                                    ? const Color(0xFF3566F6)
                                    : const Color(0xFFDDE5FF),
                                borderRadius: const BorderRadius.vertical(
                                    top: Radius.circular(8)),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              bars[i].label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 9, color: Color(0xFF7C8493)),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _activityTile(Map<String, dynamic> event) {
    final type = '${event['type'] ?? ''}';
    final auto = event['auto'] == true;
    final outOfOffice = event['out_of_office'] == true;
    IconData icon;
    String title;
    switch (type) {
      case 'clock_in':
        icon = Iconsax.login;
        title = 'Clocked in';
        break;
      case 'clock_out':
        icon = Iconsax.logout;
        title = auto ? 'Auto clock-out (delay)' : 'Clocked out';
        break;
      case 'start_field_work':
        icon = Iconsax.routing;
        title = 'Started field work';
        break;
      case 'return_from_field_work':
        icon = Iconsax.routing_2;
        title = auto ? 'Field work auto-ended' : 'Returned from field work';
        break;
      default:
        icon = Iconsax.clock;
        title = type;
    }
    final subtitleParts = <String>[];
    if (event['client'] != null && '${event['client']}'.isNotEmpty) {
      subtitleParts.add('${event['client']}');
    }
    if (event['outcome'] != null && '${event['outcome']}'.isNotEmpty) {
      subtitleParts.add('${event['outcome']}');
    }
    if (outOfOffice) subtitleParts.add('Out of office');
    final ms = _millis(event['occurred_at']);
    final when = ms > 0
        ? DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true).toLocal()
        : null;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: auto
            ? Border.all(color: const Color(0xFFF0B429), width: 1.2)
            : null,
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: _fill,
            child: Icon(icon,
                size: 18, color: auto ? const Color(0xFFB77900) : _dark),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.poppins(
                      fontSize: 13.5, fontWeight: FontWeight.w600),
                ),
                if (subtitleParts.isNotEmpty)
                  Text(
                    subtitleParts.join(' · '),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.poppins(
                        fontSize: 11.5, color: const Color(0xFF687080)),
                  ),
              ],
            ),
          ),
          if (when != null)
            Text(
              _shortWhen(when),
              style: GoogleFonts.poppins(
                  fontSize: 11, color: const Color(0xFF9299A5)),
            ),
        ],
      ),
    );
  }

  String _shortWhen(DateTime d) {
    final hour = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final ampm = d.hour < 12 ? 'AM' : 'PM';
    return '${d.month}/${d.day} $hour:${d.minute.toString().padLeft(2, '0')} $ampm';
  }

  String _durationLabel(int seconds) {
    if (seconds < 60) return '${seconds}s';
    final minutes = seconds ~/ 60;
    if (minutes < 60) return '${minutes}m';
    final hours = minutes ~/ 60;
    final rem = minutes % 60;
    return rem == 0 ? '${hours}h' : '${hours}h ${rem}m';
  }
}

class _Bar {
  const _Bar({required this.label, required this.value});
  final String label;
  final double value;
}

/// Shimmering skeleton shown while the employee detail loads. Mirrors the
/// team dashboard skeleton: header row, metric grid, section + map + chart.
class _EmployeeDetailSkeleton extends StatefulWidget {
  const _EmployeeDetailSkeleton();
  @override
  State<_EmployeeDetailSkeleton> createState() =>
      _EmployeeDetailSkeletonState();
}

class _EmployeeDetailSkeletonState extends State<_EmployeeDetailSkeleton>
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
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final color = Color.lerp(
            const Color(0xFFE6E9EF),
            const Color(0xFFF2F4F7),
            _controller.value,
          )!;
          Widget block({
            double? width,
            double height = 18,
            double radius = 10,
          }) =>
              Container(
                width: width,
                height: height,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(radius),
                ),
              );
          Widget card({double height = 166, double radius = 28}) => Container(
                height: height,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(radius),
                ),
              );
          return ListView(
            padding: EdgeInsets.fromLTRB(
              20,
              MediaQuery.paddingOf(context).top + 8,
              20,
              38,
            ),
            children: [
              Row(
                children: [
                  block(width: 42, height: 42, radius: 14),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        block(width: 190, height: 21),
                        const SizedBox(height: 7),
                        block(width: 140, height: 10),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 26),
              Row(
                children: [
                  Expanded(child: card()),
                  const SizedBox(width: 12),
                  Expanded(child: card()),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: card()),
                  const SizedBox(width: 12),
                  Expanded(child: card()),
                ],
              ),
              const SizedBox(height: 26),
              block(width: 170, height: 17),
              const SizedBox(height: 14),
              card(height: 240, radius: 24),
              const SizedBox(height: 24),
              card(height: 190, radius: 24),
              const SizedBox(height: 24),
              block(width: 150, height: 17),
              const SizedBox(height: 14),
              card(height: 66, radius: 16),
              const SizedBox(height: 10),
              card(height: 66, radius: 16),
            ],
          );
        },
      );
}

