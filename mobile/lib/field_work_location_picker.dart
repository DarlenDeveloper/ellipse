import 'dart:async';
import 'dart:math' as math;

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

const _ink = Color(0xFF1D2825);
const _muted = Color(0xFF687080);
const _surface = Color(0xFFF4F4F1);
const _blue = Color(0xFF3566F6);

Future<Map<String, dynamic>?> showFieldWorkDetailsSheet(
  BuildContext context, {
  required List<Map<String, dynamic>> savedLocations,
}) {
  return showModalBottomSheet<Map<String, dynamic>>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
    ),
    builder: (_) => _FieldWorkDetailsSheet(savedLocations: savedLocations),
  );
}

class _FieldWorkDetailsSheet extends StatefulWidget {
  const _FieldWorkDetailsSheet({required this.savedLocations});

  final List<Map<String, dynamic>> savedLocations;

  @override
  State<_FieldWorkDetailsSheet> createState() =>
      _FieldWorkDetailsSheetState();
}

class _FieldWorkDetailsSheetState extends State<_FieldWorkDetailsSheet> {
  final _client = TextEditingController();
  final _reason = TextEditingController();
  final _search = TextEditingController();
  final _functions = FirebaseFunctions.instanceFor(region: 'us-central1');
  final _selected = <Map<String, dynamic>>[];
  final _saveForLater = <String>{};
  final _radiusByKey = <String, double>{};
  List<Map<String, dynamic>> _suggestions = [];
  Timer? _debounce;
  late String _sessionToken;
  bool _searching = false;
  bool _resolving = false;
  bool _saving = false;
  bool _adding = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _sessionToken = _newSessionToken();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _client.dispose();
    _reason.dispose();
    _search.dispose();
    super.dispose();
  }

  String _newSessionToken() =>
      '${DateTime.now().microsecondsSinceEpoch}-${math.Random().nextInt(1 << 32)}';

  String _key(Map<String, dynamic> location) =>
      '${location['id'] ?? location['place_id'] ?? '${location['latitude']},${location['longitude']}'}';

  bool _contains(Map<String, dynamic> location) {
    final key = _key(location);
    return _selected.any((item) => _key(item) == key);
  }

  void _addSaved(Map<String, dynamic> location) {
    if (_contains(location)) return;
    setState(() {
      _selected.add(Map<String, dynamic>.from(location));
      _radiusByKey[_key(location)] =
          (location['radius_m'] as num?)?.toDouble() ?? 150;
      _adding = false;
      _error = null;
    });
  }

  void _onQuery(String value) {
    _debounce?.cancel();
    final query = value.trim();
    if (query.length < 2) {
      setState(() {
        _suggestions = [];
        _searching = false;
      });
      return;
    }
    setState(() => _searching = true);
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      try {
        final result = await _functions.httpsCallable('placesAutocomplete').call({
          'input': query,
          'sessionToken': _sessionToken,
        });
        if (!mounted || _search.text.trim() != query) return;
        final data = Map<String, dynamic>.from(result.data as Map);
        setState(() {
          _suggestions = (data['suggestions'] as List? ?? const [])
              .map((item) => Map<String, dynamic>.from(item as Map))
              .toList();
          _searching = false;
          _error = null;
        });
      } on FirebaseFunctionsException catch (error) {
        if (!mounted) return;
        setState(() {
          _searching = false;
          _suggestions = [];
          _error = error.message ?? 'Location search is unavailable.';
        });
      }
    });
  }

  Future<void> _chooseSuggestion(Map<String, dynamic> suggestion) async {
    if (_resolving) return;
    setState(() {
      _resolving = true;
      _error = null;
    });
    try {
      final result = await _functions.httpsCallable('placeDetails').call({
        'placeId': suggestion['placeId'],
        'sessionToken': _sessionToken,
      });
      final data = Map<String, dynamic>.from(result.data as Map);
      final place = Map<String, dynamic>.from(data['place'] as Map);
      place['place_id'] = place.remove('placeId');
      place['radius_m'] = 150;
      if (!mounted) return;
      final key = _key(place);
      setState(() {
        if (!_contains(place)) _selected.add(place);
        _radiusByKey[key] = 150;
        _saveForLater.add(key);
        _suggestions = [];
        _search.clear();
        _adding = false;
        _resolving = false;
        _sessionToken = _newSessionToken();
      });
    } on FirebaseFunctionsException catch (error) {
      if (!mounted) return;
      setState(() {
        _resolving = false;
        _error = error.message ?? 'Could not open that location.';
      });
    }
  }

  Future<void> _continue() async {
    if (_reason.text.trim().isEmpty) {
      setState(() => _error = 'Add the purpose of this field work.');
      return;
    }
    if (_selected.isEmpty) {
      setState(() => _error = 'Choose at least one destination.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final locations = <Map<String, dynamic>>[];
      for (final original in _selected) {
        var location = Map<String, dynamic>.from(original);
        location['radius_m'] = _radiusByKey[_key(original)]?.round() ?? 150;
        if (location['id'] == null && _saveForLater.contains(_key(original))) {
          final response = await _functions
              .httpsCallable('saveFieldWorkLocation')
              .call({'location': location});
          final data = Map<String, dynamic>.from(response.data as Map);
          location = Map<String, dynamic>.from(data['location'] as Map);
        }
        locations.add(location);
      }
      if (!mounted) return;
      Navigator.pop(context, {
        'reason': _reason.text.trim(),
        'client': _client.text.trim(),
        'outcome': '',
        'field_locations': locations,
      });
    } on FirebaseFunctionsException catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error.message ?? 'Could not save the field-work locations.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return FractionallySizedBox(
      heightFactor: .94,
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 12, 20, 18 + bottom),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFD9DDD8),
                  borderRadius: BorderRadius.circular(20),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: const BoxDecoration(
                    color: Color(0xFFEFF3FF),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Iconsax.routing_2, color: _blue),
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Plan field work',
                          style: GoogleFonts.poppins(
                              fontSize: 20, fontWeight: FontWeight.w700)),
                      Text('Choose every destination before you leave',
                          style: GoogleFonts.poppins(
                              fontSize: 11.5, color: _muted)),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Expanded(
              child: ListView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                children: [
                  TextField(
                    controller: _client,
                    textCapitalization: TextCapitalization.words,
                    decoration: _input(
                      'Client or account (optional)',
                      Iconsax.profile_2user,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _reason,
                    textCapitalization: TextCapitalization.sentences,
                    maxLines: 2,
                    decoration: _input(
                      'Purpose or work to complete',
                      Iconsax.note_2,
                    ),
                  ),
                  const SizedBox(height: 22),
                  _sectionTitle('Destinations', '${_selected.length}/8'),
                  if (widget.savedLocations.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text('Saved places',
                        style: GoogleFonts.poppins(
                            fontSize: 11.5,
                            color: _muted,
                            fontWeight: FontWeight.w500)),
                    const SizedBox(height: 9),
                    SizedBox(
                      height: 42,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: widget.savedLocations.length,
                        separatorBuilder: (context, index) =>
                            const SizedBox(width: 8),
                        itemBuilder: (_, index) {
                          final location = widget.savedLocations[index];
                          final selected = _contains(location);
                          return ChoiceChip(
                            selected: selected,
                            onSelected: selected
                                ? null
                                : (_) => _addSaved(location),
                            avatar: Icon(
                              selected ? Iconsax.tick_circle : Iconsax.location,
                              size: 16,
                              color: selected ? Colors.white : _ink,
                            ),
                            label: Text('${location['label'] ?? 'Saved place'}'),
                            labelStyle: TextStyle(
                              color: selected ? Colors.white : _ink,
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                            ),
                            selectedColor: _ink,
                            backgroundColor: _surface,
                            side: BorderSide.none,
                            shape: const StadiumBorder(),
                          );
                        },
                      ),
                    ),
                  ],
                  if (_selected.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    ..._selected.asMap().entries.map(
                          (entry) => _selectedCard(entry.key, entry.value),
                        ),
                    SizedBox(
                      height: 44,
                      child: TextButton.icon(
                        onPressed: _selected.length >= 8
                            ? null
                            : () => setState(() => _adding = true),
                        icon: const Icon(Iconsax.add_circle, size: 19),
                        label: const Text('Add additional location'),
                        style: TextButton.styleFrom(
                          foregroundColor: _blue,
                          alignment: Alignment.centerLeft,
                          padding: EdgeInsets.zero,
                        ),
                      ),
                    ),
                  ],
                  if (_selected.isEmpty || _adding) ...[
                    const SizedBox(height: 10),
                    _searchBox(),
                    if (_searching || _resolving)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 18),
                        child: Center(
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    if (!_searching && !_resolving && _suggestions.isNotEmpty)
                      _suggestionList(),
                  ],
                  if (_selected.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(22),
                      child: SizedBox(
                        height: 190,
                        child: _DestinationMap(locations: _selected),
                      ),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(13),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFE9E7),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          const Icon(Iconsax.warning_2,
                              size: 18, color: Color(0xFF9D2922)),
                          const SizedBox(width: 9),
                          Expanded(
                            child: Text(_error!,
                                style: GoogleFonts.poppins(
                                    fontSize: 11.5,
                                    color: const Color(0xFF9D2922))),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                ],
              ),
            ),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: FilledButton.icon(
                onPressed: _saving ? null : _continue,
                style: FilledButton.styleFrom(
                  backgroundColor: _ink,
                  shape: const StadiumBorder(),
                ),
                icon: _saving
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Iconsax.location_tick, size: 20),
                label: Text(_saving
                    ? 'Saving your route…'
                    : 'Continue and capture location'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _input(String hint, IconData icon) => InputDecoration(
        hintText: hint,
        hintStyle: GoogleFonts.poppins(fontSize: 12.5, color: _muted),
        prefixIcon: Icon(icon, size: 19, color: _muted),
        filled: true,
        fillColor: _surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(17),
          borderSide: BorderSide.none,
        ),
      );

  Widget _sectionTitle(String title, String trailing) => Row(
        children: [
          Text(title,
              style: GoogleFonts.poppins(
                  fontSize: 15.5, fontWeight: FontWeight.w700)),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFEFF3FF),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(trailing,
                style: GoogleFonts.poppins(
                    fontSize: 10,
                    color: _blue,
                    fontWeight: FontWeight.w600)),
          ),
        ],
      );

  Widget _searchBox() => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFDDE1E8)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0A1D2825),
              blurRadius: 14,
              offset: Offset(0, 5),
            ),
          ],
        ),
        child: TextField(
          controller: _search,
          autofocus: _selected.isEmpty,
          onChanged: _onQuery,
          decoration: InputDecoration(
            hintText: _selected.isEmpty
                ? 'Search a destination, e.g. Cairo Bank'
                : 'Search another stop',
            hintStyle: GoogleFonts.poppins(fontSize: 12, color: _muted),
            prefixIcon:
                const Icon(Iconsax.search_normal_1, size: 19, color: _ink),
            suffixIcon: _search.text.isEmpty
                ? null
                : IconButton(
                    onPressed: () {
                      _search.clear();
                      _onQuery('');
                    },
                    icon: const Icon(Iconsax.close_circle, size: 18),
                  ),
            border: InputBorder.none,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
          ),
        ),
      );

  Widget _suggestionList() => Container(
        margin: const EdgeInsets.only(top: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFEAECF0)),
        ),
        child: Column(
          children: [
            for (var index = 0; index < _suggestions.length; index++) ...[
              InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () => _chooseSuggestion(_suggestions[index]),
                child: Padding(
                  padding: const EdgeInsets.all(13),
                  child: Row(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: const BoxDecoration(
                          color: _surface,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Iconsax.location,
                            size: 18, color: _ink),
                      ),
                      const SizedBox(width: 11),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${_suggestions[index]['mainText'] ?? ''}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.poppins(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w600)),
                            if ('${_suggestions[index]['secondaryText'] ?? ''}'
                                .isNotEmpty)
                              Text(
                                '${_suggestions[index]['secondaryText']}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.poppins(
                                    fontSize: 10.5, color: _muted),
                              ),
                          ],
                        ),
                      ),
                      const Icon(Iconsax.arrow_right_3,
                          size: 16, color: _muted),
                    ],
                  ),
                ),
              ),
              if (index != _suggestions.length - 1)
                const Divider(height: 1, indent: 62),
            ],
          ],
        ),
      );

  Widget _selectedCard(int index, Map<String, dynamic> location) {
    final key = _key(location);
    final saved = location['id'] != null;
    final radius = _radiusByKey[key] ?? 150;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(13, 13, 10, 10),
      decoration: BoxDecoration(
        color: index == 0 ? const Color(0xFFF0F4FF) : _surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: index == 0
              ? const Color(0xFFDCE5FF)
              : const Color(0xFFE8EAE6),
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: index == 0 ? _blue : _ink,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text('${index + 1}',
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${location['label'] ?? 'Destination'}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.poppins(
                            fontSize: 12.5, fontWeight: FontWeight.w600)),
                    Text('${location['address'] ?? ''}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.poppins(
                            fontSize: 10, color: _muted)),
                  ],
                ),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: () => setState(() {
                  _selected.removeAt(index);
                  _saveForLater.remove(key);
                  _radiusByKey.remove(key);
                  if (_selected.isEmpty) _adding = true;
                }),
                icon: const Icon(Iconsax.trash, size: 18, color: _muted),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Iconsax.radar_1, size: 16, color: _muted),
              const SizedBox(width: 7),
              Text('Arrival radius',
                  style: GoogleFonts.poppins(fontSize: 10.5, color: _muted)),
              Expanded(
                child: Slider(
                  value: radius.clamp(50, 500),
                  min: 50,
                  max: 500,
                  divisions: 9,
                  activeColor: index == 0 ? _blue : _ink,
                  onChanged: (value) =>
                      setState(() => _radiusByKey[key] = value),
                ),
              ),
              SizedBox(
                width: 42,
                child: Text('${radius.round()}m',
                    textAlign: TextAlign.end,
                    style: GoogleFonts.poppins(
                        fontSize: 10.5, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          if (!saved)
            SwitchListTile.adaptive(
              dense: true,
              contentPadding: EdgeInsets.zero,
              visualDensity: VisualDensity.compact,
              value: _saveForLater.contains(key),
              activeTrackColor: _blue,
              onChanged: (value) => setState(() {
                value ? _saveForLater.add(key) : _saveForLater.remove(key);
              }),
              title: Text('Save for future field work',
                  style: GoogleFonts.poppins(
                      fontSize: 10.5, fontWeight: FontWeight.w600)),
            ),
        ],
      ),
    );
  }
}

class _DestinationMap extends StatefulWidget {
  const _DestinationMap({required this.locations});

  final List<Map<String, dynamic>> locations;

  @override
  State<_DestinationMap> createState() => _DestinationMapState();
}

class _DestinationMapState extends State<_DestinationMap> {
  GoogleMapController? _controller;

  Set<Marker> get _markers => widget.locations.asMap().entries.map((entry) {
        final value = entry.value;
        return Marker(
          markerId: MarkerId('destination-${entry.key}'),
          position: LatLng(
            (value['latitude'] as num).toDouble(),
            (value['longitude'] as num).toDouble(),
          ),
          infoWindow: InfoWindow(title: '${value['label'] ?? 'Destination'}'),
          icon: BitmapDescriptor.defaultMarkerWithHue(
            entry.key == 0 ? BitmapDescriptor.hueAzure : BitmapDescriptor.hueViolet,
          ),
        );
      }).toSet();

  @override
  void didUpdateWidget(covariant _DestinationMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.locations.length != widget.locations.length) _fit();
  }

  Future<void> _fit() async {
    final controller = _controller;
    if (controller == null || widget.locations.isEmpty) return;
    if (widget.locations.length == 1) {
      final item = widget.locations.first;
      await controller.animateCamera(CameraUpdate.newLatLngZoom(
        LatLng((item['latitude'] as num).toDouble(),
            (item['longitude'] as num).toDouble()),
        15,
      ));
      return;
    }
    var minLat = 90.0, maxLat = -90.0, minLng = 180.0, maxLng = -180.0;
    for (final item in widget.locations) {
      final lat = (item['latitude'] as num).toDouble();
      final lng = (item['longitude'] as num).toDouble();
      minLat = math.min(minLat, lat);
      maxLat = math.max(maxLat, lat);
      minLng = math.min(minLng, lng);
      maxLng = math.max(maxLng, lng);
    }
    await controller.animateCamera(CameraUpdate.newLatLngBounds(
      LatLngBounds(
        southwest: LatLng(minLat, minLng),
        northeast: LatLng(maxLat, maxLng),
      ),
      42,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final first = widget.locations.first;
    return GoogleMap(
      initialCameraPosition: CameraPosition(
        target: LatLng(
          (first['latitude'] as num).toDouble(),
          (first['longitude'] as num).toDouble(),
        ),
        zoom: 14,
      ),
      markers: _markers,
      mapToolbarEnabled: false,
      zoomControlsEnabled: false,
      myLocationButtonEnabled: false,
      compassEnabled: false,
      onMapCreated: (controller) {
        _controller = controller;
        _fit();
      },
    );
  }
}
