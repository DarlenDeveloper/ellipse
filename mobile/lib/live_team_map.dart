// Live team-locations map for owners/admins.
//
// Shows where the team is *right now*, gated to working hours. Uses only data
// the system already collects with consent:
//   • attendance_current.status        -> working / field_work / clocked_out
//   • attendance_current.last_location  -> last known point (set on clock/field
//     actions; for field_work it is refreshed by the 2-min tracking pings)
//
// It deliberately does NOT add new phone tracking. Employees who are simply
// "working" (not on field work) only expose their last clock-action location,
// which is shown as approximate. Off-duty and location-off employees appear in
// the status list, not on the map.

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:latlong2/latlong.dart';

const _dark = Color(0xFF1D2825);
const _fill = Color(0xFFF4F4F1);

const _cField = Color(0xFF8B5CF6); // on field work (live)
const _cWorking = Color(0xFF3566F6); // working (last known)
const _cOff = Color(0xFF9299A5); // off duty
const _cNoLoc = Color(0xFFF29B43); // location off / unknown

class LiveTeamMapScreen extends StatefulWidget {
  const LiveTeamMapScreen({
    super.key,
    required this.current,
    required this.settings,
  });

  /// The attendance_current roster (from the dashboard callable).
  final List<Map<String, dynamic>> current;

  /// attendance_settings (weekly schedule) used for the working-hours gate.
  final Map<String, dynamic>? settings;

  @override
  State<LiveTeamMapScreen> createState() => _LiveTeamMapScreenState();
}

class _LiveTeamMapScreenState extends State<LiveTeamMapScreen> {
  final _searchController = TextEditingController();
  final _mapController = MapController();
  String _query = '';

  List<Map<String, dynamic>> get current => widget.current;
  Map<String, dynamic>? get settings => widget.settings;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // ---- Working-hours gate (EAT / Africa/Kampala, fixed UTC+3) ------------

  static const _dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  /// Whether "now" falls inside today's scheduled working hours.
  bool get _withinWorkingHours {
    final days = (settings?['days'] as Map?)?.cast<String, dynamic>();
    // No schedule configured -> default to a standard weekday window so the
    // feature still works, but treat weekends as off.
    final nowEat = DateTime.now().toUtc().add(const Duration(hours: 3));
    final key = _dayNames[nowEat.weekday % 7];
    final day = (days?[key] as Map?)?.cast<String, dynamic>();
    if (day == null) {
      // Fallback: Mon–Fri 08:00–17:00.
      final isWeekday = nowEat.weekday >= DateTime.monday &&
          nowEat.weekday <= DateTime.friday;
      final mins = nowEat.hour * 60 + nowEat.minute;
      return isWeekday && mins >= 8 * 60 && mins < 17 * 60;
    }
    if (day['enabled'] == false) return false;
    final start = _minutes(day['start'] as String? ?? '08:00');
    final end = _minutes(day['end'] as String? ?? '17:00');
    final mins = nowEat.hour * 60 + nowEat.minute;
    return mins >= start && mins < end;
  }

  static int _minutes(String hhmm) {
    final parts = hhmm.split(':');
    if (parts.length != 2) return 0;
    return (int.tryParse(parts[0]) ?? 0) * 60 + (int.tryParse(parts[1]) ?? 0);
  }

  // ---- Roster classification --------------------------------------------

  LatLng? _location(Map<String, dynamic> e) {
    final loc = e['last_location'];
    if (loc is Map) {
      final lat = (loc['latitude'] as num?)?.toDouble();
      final lng = (loc['longitude'] as num?)?.toDouble();
      if (lat != null && lng != null) return LatLng(lat, lng);
    }
    return null;
  }

  String _name(Map<String, dynamic> e) =>
      '${e['employee_name'] ?? e['name'] ?? 'Employee'}';

  @override
  Widget build(BuildContext context) {
    final onDuty = current
        .where((e) =>
            e['status'] == 'working' || e['status'] == 'field_work')
        .toList();

    // Map-plottable are on-duty employees with a known location; everyone
    // else (off duty, location off) surfaces through search.
    final onField =
        onDuty.where((e) => e['status'] == 'field_work').toList();
    final working =
        onDuty.where((e) => e['status'] == 'working').toList();

    final plottable = <_TeamPoint>[
      for (final e in onField)
        if (_location(e) != null)
          _TeamPoint(
              name: _name(e),
              point: _location(e)!,
              live: true,
              color: _cField),
      for (final e in working)
        if (_location(e) != null)
          _TeamPoint(
              name: _name(e),
              point: _location(e)!,
              live: false,
              color: _cWorking),
    ];

    final open = _withinWorkingHours;

    // Search results across the whole on-duty + off-duty roster.
    final q = _query.trim().toLowerCase();
    final results = q.isEmpty
        ? const <_SearchHit>[]
        : [
            for (final e in current)
              if (_name(e).toLowerCase().contains(q))
                _SearchHit(
                  name: _name(e),
                  status: e['status'] as String? ?? 'clocked_out',
                  point: _location(e),
                ),
          ];

    return Scaffold(
      backgroundColor: _fill,
      body: !open
          ? SafeArea(child: _buildTopFloating(context, _OutOfHours(current: current)))
          : Stack(
              children: [
                // Full-screen map (or empty state) behind everything.
                Positioned.fill(
                  child: plottable.isEmpty
                      ? _NoLocations(hasOnDuty: onDuty.isNotEmpty)
                      : _TeamMap(
                          points: plottable, controller: _mapController),
                ),

                // Floating top: back button + search bar (transparent bg).
                SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            _circleBtn(
                              Iconsax.arrow_left_2,
                              () => Navigator.of(context).pop(),
                            ),
                            const SizedBox(width: 10),
                            Expanded(child: _searchBar()),
                          ],
                        ),
                        if (results.isNotEmpty || q.isNotEmpty)
                          _searchResults(results),
                      ],
                    ),
                  ),
                ),

                // Floating legend, bottom-left.
                SafeArea(
                  child: Align(
                    alignment: Alignment.bottomLeft,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 0, 14, 16),
                      child: _legendCard(onField.length, working.length),
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  // A minimal top bar used for the out-of-hours state (keeps the back button).
  Widget _buildTopFloating(BuildContext context, Widget child) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
            child: Row(
              children: [
                _circleBtn(Iconsax.arrow_left_2,
                    () => Navigator.of(context).pop()),
                const SizedBox(width: 10),
                Text('Live team map',
                    style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: _dark)),
              ],
            ),
          ),
          Expanded(child: child),
        ],
      );

  Widget _circleBtn(IconData icon, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                  color: _dark.withValues(alpha: .12),
                  blurRadius: 10,
                  offset: const Offset(0, 4)),
            ],
          ),
          child: Icon(icon, color: _dark, size: 20),
        ),
      );

  Widget _searchBar() => Container(
        height: 46,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
                color: _dark.withValues(alpha: .12),
                blurRadius: 10,
                offset: const Offset(0, 4)),
          ],
        ),
        child: Row(
          children: [
            const Icon(Iconsax.search_normal_1, size: 18, color: _dark),
            const SizedBox(width: 10),
            Expanded(
              child: TextField(
                controller: _searchController,
                onChanged: (v) => setState(() => _query = v),
                textInputAction: TextInputAction.search,
                style: GoogleFonts.poppins(fontSize: 13.5),
                decoration: InputDecoration(
                  isDense: true,
                  border: InputBorder.none,
                  hintText: 'Search team member',
                  hintStyle: GoogleFonts.poppins(
                      fontSize: 13.5, color: const Color(0xFF9299A5)),
                ),
              ),
            ),
            if (_query.isNotEmpty)
              GestureDetector(
                onTap: () {
                  _searchController.clear();
                  setState(() => _query = '');
                },
                child: const Icon(Iconsax.close_circle,
                    size: 18, color: Color(0xFF9299A5)),
              ),
          ],
        ),
      );

  Widget _searchResults(List<_SearchHit> hits) => Container(
        margin: const EdgeInsets.only(top: 8),
        constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.42),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
                color: _dark.withValues(alpha: .12),
                blurRadius: 14,
                offset: const Offset(0, 6)),
          ],
        ),
        child: hits.isEmpty
            ? Padding(
                padding: const EdgeInsets.all(18),
                child: Text('No team member matches “$_query”.',
                    style: GoogleFonts.poppins(
                        fontSize: 12.5, color: const Color(0xFF687080))),
              )
            : ListView.separated(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(vertical: 6),
                itemCount: hits.length,
                separatorBuilder: (context, index) => const Divider(
                    height: 1, indent: 60, color: Color(0xFFEFF1EE)),
                itemBuilder: (context, i) => _resultRow(hits[i]),
              ),
      );

  Widget _resultRow(_SearchHit hit) {
    // Determine display state. On duty but no point => location off.
    final Color color;
    final String label;
    final IconData icon;
    final bool locatable = hit.point != null;
    if (hit.status == 'field_work') {
      color = _cField;
      label = locatable ? 'On field work · live' : 'On field · location off';
      icon = locatable ? Iconsax.routing : Iconsax.location_slash;
    } else if (hit.status == 'working') {
      color = locatable ? _cWorking : _cNoLoc;
      label = locatable ? 'Working · last known location' : 'Working · location off';
      icon = locatable ? Iconsax.user : Iconsax.location_slash;
    } else {
      color = _cOff;
      label = 'Off duty';
      icon = Iconsax.moon;
    }

    return InkWell(
      onTap: locatable
          ? () {
              _mapController.move(hit.point!, 16);
              _searchController.clear();
              setState(() => _query = '');
            }
          : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                  color: color.withValues(alpha: .14), shape: BoxShape.circle),
              child: Icon(icon, size: 18, color: color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(hit.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.poppins(
                          fontSize: 13.5, fontWeight: FontWeight.w600)),
                  Text(label,
                      style: GoogleFonts.poppins(
                          fontSize: 10.5, color: const Color(0xFF687080))),
                ],
              ),
            ),
            if (locatable)
              const Icon(Iconsax.arrow_right_3,
                  size: 15, color: Color(0xFF9299A5)),
          ],
        ),
      ),
    );
  }

  Widget _legendCard(int fieldCount, int workingCount) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: .94),
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
                color: _dark.withValues(alpha: .08),
                blurRadius: 10,
                offset: const Offset(0, 4)),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _legendDot(_cField, 'Field (live)'),
                const SizedBox(width: 12),
                _legendDot(_cWorking, 'Working'),
              ],
            ),
          ],
        ),
      );

  Widget _legendDot(Color color, String label) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 9,
            height: 9,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 5),
          Text(label,
              style: GoogleFonts.poppins(
                  fontSize: 10.5, color: const Color(0xFF687080))),
        ],
      );
}

class _TeamPoint {
  const _TeamPoint({
    required this.name,
    required this.point,
    required this.live,
    required this.color,
  });
  final String name;
  final LatLng point;
  final bool live;
  final Color color;
}

class _SearchHit {
  const _SearchHit({
    required this.name,
    required this.status,
    required this.point,
  });
  final String name;
  final String status; // working | field_work | clocked_out
  final LatLng? point;
}

class _TeamMap extends StatelessWidget {
  const _TeamMap({required this.points, required this.controller});
  final List<_TeamPoint> points;
  final MapController controller;

  LatLngBounds _bounds() {
    var minLat = points.first.point.latitude, maxLat = minLat;
    var minLng = points.first.point.longitude, maxLng = minLng;
    for (final p in points) {
      if (p.point.latitude < minLat) minLat = p.point.latitude;
      if (p.point.latitude > maxLat) maxLat = p.point.latitude;
      if (p.point.longitude < minLng) minLng = p.point.longitude;
      if (p.point.longitude > maxLng) maxLng = p.point.longitude;
    }
    if ((maxLat - minLat).abs() < 0.01) {
      minLat -= 0.01;
      maxLat += 0.01;
    }
    if ((maxLng - minLng).abs() < 0.01) {
      minLng -= 0.01;
      maxLng += 0.01;
    }
    return LatLngBounds(LatLng(minLat, minLng), LatLng(maxLat, maxLng));
  }

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      mapController: controller,
      options: MapOptions(
        initialCameraFit: CameraFit.bounds(
          bounds: _bounds(),
          padding: const EdgeInsets.all(64),
        ),
        interactionOptions:
            const InteractionOptions(flags: InteractiveFlag.all),
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.ellipse.ellipse_companion',
        ),
        MarkerLayer(
          markers: [
            for (final p in points)
              Marker(
                point: p.point,
                width: 120,
                height: 62,
                alignment: Alignment.topCenter,
                child: _PersonPin(point: p),
              ),
          ],
        ),
      ],
    );
  }
}

class _PersonPin extends StatelessWidget {
  const _PersonPin({required this.point});
  final _TeamPoint point;

  @override
  Widget build(BuildContext context) {
    final first = point.name.split(' ').first;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                  color: point.color.withValues(alpha: .35), blurRadius: 6),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(point.live ? Iconsax.routing : Iconsax.user,
                  size: 12, color: point.color),
              const SizedBox(width: 4),
              Text(first,
                  style: GoogleFonts.poppins(
                      fontSize: 10.5, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
        Container(
          margin: const EdgeInsets.only(top: 2),
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            color: point.color,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2.5),
            boxShadow: [
              BoxShadow(
                  color: point.color.withValues(alpha: .5), blurRadius: 4),
            ],
          ),
        ),
      ],
    );
  }
}

/// Shown when the current time is outside the configured working hours.
class _OutOfHours extends StatelessWidget {
  const _OutOfHours({required this.current});
  final List<Map<String, dynamic>> current;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(
                  color: Color(0xFFEFF1EE), shape: BoxShape.circle),
              child: const Icon(Iconsax.moon, color: _dark, size: 28),
            ),
            const SizedBox(height: 18),
            Text('Outside working hours',
                style: GoogleFonts.poppins(
                    fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(
              'Live team locations are only shown during your organization’s '
              'scheduled working hours. Location tracking is off outside those '
              'hours to protect employee privacy.',
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                  fontSize: 12.5,
                  height: 1.5,
                  color: const Color(0xFF687080)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shown when within hours but nobody has a plottable location yet.
class _NoLocations extends StatelessWidget {
  const _NoLocations({required this.hasOnDuty});
  final bool hasOnDuty;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(
                  color: Color(0xFFEFF1EE), shape: BoxShape.circle),
              child: const Icon(Iconsax.map, color: _dark, size: 28),
            ),
            const SizedBox(height: 18),
            Text(hasOnDuty ? 'No live locations' : 'No one on duty',
                style: GoogleFonts.poppins(
                    fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(
              hasOnDuty
                  ? 'Team members are on duty but none are sharing a location '
                      'right now. Live location appears when someone is on field '
                      'work with tracking on.'
                  : 'No team members are clocked in at the moment.',
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                  fontSize: 12.5,
                  height: 1.5,
                  color: const Color(0xFF687080)),
            ),
          ],
        ),
      ),
    );
  }
}
