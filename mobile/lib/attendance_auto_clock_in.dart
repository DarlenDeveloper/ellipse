import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:native_geofence/native_geofence.dart';

import 'firebase_options.dart';

const _autoClockInGeofenceId = 'ellipse-office-auto-clock-in';

@pragma('vm:entry-point')
Future<void> autoClockInGeofenceTriggered(
  GeofenceCallbackParams params,
) async {
  if (params.event != GeofenceEvent.enter &&
      params.event != GeofenceEvent.dwell) {
    return;
  }
  final location = params.location;
  if (location == null) return;
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
    }
    await FirebaseFunctions.instanceFor(region: 'us-central1')
        .httpsCallable('attendanceAutoClockIn')
        .call({
      'location': {
        'latitude': location.latitude,
        'longitude': location.longitude,
        'accuracy': null,
      },
    });
  } on FirebaseFunctionsException catch (error) {
    // Entry callbacks can repeat after a reboot or dwell event. The backend
    // state machine makes an already-completed clock-in a safe no-op.
    if (error.code != 'failed-precondition') rethrow;
  }
}

Future<void> configureAutoClockInGeofence({
  required bool enabled,
  required Map<String, dynamic>? geofence,
}) async {
  if (kIsWeb) return;
  await NativeGeofenceManager.instance.initialize();
  try {
    await NativeGeofenceManager.instance
        .removeGeofenceById(_autoClockInGeofenceId);
  } on NativeGeofenceException {
    // It is valid for the geofence not to exist yet.
  }
  if (!enabled || geofence == null || geofence['enabled'] == false) return;

  final latitude = (geofence['latitude'] as num?)?.toDouble();
  final longitude = (geofence['longitude'] as num?)?.toDouble();
  final configuredRadius = (geofence['radius_m'] as num?)?.toDouble() ?? 150;
  if (latitude == null || longitude == null) return;

  final zone = Geofence(
    id: _autoClockInGeofenceId,
    location: Location(latitude: latitude, longitude: longitude),
    radiusMeters: configuredRadius.clamp(100, 5000),
    triggers: const {
      GeofenceEvent.enter,
      GeofenceEvent.dwell,
    },
    iosSettings: const IosGeofenceSettings(initialTrigger: true),
    androidSettings: const AndroidGeofenceSettings(
      initialTriggers: {GeofenceEvent.enter},
      expiration: Duration(days: 3650),
      loiteringDelay: Duration(minutes: 2),
      notificationResponsiveness: Duration(minutes: 1),
    ),
  );
  await NativeGeofenceManager.instance.createGeofence(
    zone,
    autoClockInGeofenceTriggered,
  );
}

Future<bool> requestAutoClockInPermission(BuildContext context) async {
  if (kIsWeb) return false;
  final accepted = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (context) => SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 24, 22, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: const BoxDecoration(
                    color: Color(0xFFEFF3FF),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Iconsax.radar_1,
                      color: Color(0xFF3566F6)),
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Text(
                    'Automatic clock-in',
                    style: GoogleFonts.poppins(
                      fontSize: 19,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              'Ellipse can clock you in when your phone enters the office '
              'radius. Your phone uses the operating system’s low-power region '
              'monitoring — not continuous route tracking.',
              style: GoogleFonts.poppins(fontSize: 13, height: 1.5),
            ),
            const SizedBox(height: 14),
            _privacyPoint(Iconsax.shield_tick,
                'Only office entry is checked, and the server verifies the radius again.'),
            _privacyPoint(Iconsax.calendar_tick,
                'Automatic clock-in only works on enabled work days near your scheduled start time.'),
            _privacyPoint(Iconsax.setting_2,
                'You can turn it off at any time from Attendance.'),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                onPressed: () => Navigator.pop(context, true),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF1D2825),
                  shape: const StadiumBorder(),
                ),
                child: const Text('Allow automatic clock-in'),
              ),
            ),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Not now'),
              ),
            ),
          ],
        ),
      ),
    ),
  );
  if (accepted != true || !context.mounted) return false;
  if (!await Geolocator.isLocationServiceEnabled()) {
    await Geolocator.openLocationSettings();
    return false;
  }

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.always) return true;
  if (!context.mounted) return false;

  final openSettings = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      icon: const Icon(Iconsax.location,
          color: Color(0xFF1D2825), size: 30),
      title: Text('Allow location always',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
      content: Text(
        'Choose “Always allow” for Ellipse in device settings so the office '
        'entry can be detected while the app is closed.',
        textAlign: TextAlign.center,
        style: GoogleFonts.poppins(fontSize: 13, height: 1.5),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Open settings'),
        ),
      ],
    ),
  );
  if (openSettings == true) await Geolocator.openAppSettings();
  return await Geolocator.checkPermission() == LocationPermission.always;
}

Widget _privacyPoint(IconData icon, String text) => Padding(
      padding: const EdgeInsets.only(top: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: const Color(0xFF3566F6)),
          const SizedBox(width: 11),
          Expanded(
            child: Text(text,
                style: GoogleFonts.poppins(fontSize: 12, height: 1.45)),
          ),
        ],
      ),
    );
