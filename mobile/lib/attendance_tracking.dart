// Field-work location tracking for Ellipse.
//
// Continuous, consent-gated route tracking that runs while an employee is on
// field work and stops automatically at their end-of-work time (privacy cutoff)
// or when they return. Points are buffered and flushed to the `attendancePing`
// callable every 2 minutes to keep Firestore writes (and battery) low.
//
// Implementation notes:
//  • Runs in a foreground service (flutter_background_service) so location keeps
//    flowing when the app is backgrounded / screen off. The persistent
//    notification doubles as the required "you are being tracked" disclosure.
//  • The privacy cutoff is enforced in TWO places: here (we stop the stream at
//    end-of-work) and server-side (attendancePing drops points past end-of-work).

import 'dart:async';
import 'dart:ui';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'firebase_options.dart';

const _kConsentKey = 'attendance_field_tracking_consent_v1';
const _kServiceNotificationId = 4412;

/// Result of a location-permission check.
enum LocationAccessResult {
  granted,
  servicesOff,
  denied,
  deniedForever,
  unsupported,
}

/// Checks location services + permission without prompting. Use to decide
/// whether to show UI before triggering a request.
Future<LocationAccessResult> checkLocationAccess() async {
  if (kIsWeb) return LocationAccessResult.unsupported;
  if (!await Geolocator.isLocationServiceEnabled()) {
    return LocationAccessResult.servicesOff;
  }
  final permission = await Geolocator.checkPermission();
  switch (permission) {
    case LocationPermission.always:
    case LocationPermission.whileInUse:
      return LocationAccessResult.granted;
    case LocationPermission.deniedForever:
      return LocationAccessResult.deniedForever;
    case LocationPermission.denied:
    case LocationPermission.unableToDetermine:
      return LocationAccessResult.denied;
  }
}

/// Ensures the app can access location, prompting the user as needed:
///  • services off  -> dialog with a button to open location settings
///  • denied        -> requests the OS permission
///  • deniedForever -> dialog with a button to open app settings
///
/// Returns true only when access is granted. Safe to call before clock-in or
/// before starting tracking. No-op returns false on web.
Future<bool> ensureLocationPermission(BuildContext context) async {
  if (kIsWeb) return false;

  if (!await Geolocator.isLocationServiceEnabled()) {
    if (!context.mounted) return false;
    final open = await _permissionDialog(
      context,
      title: 'Turn on location',
      message:
          'Location services are turned off on your device. Turn them on so '
          'Ellipse can record your attendance and field-work location.',
      actionLabel: 'Open location settings',
    );
    if (open == true) await Geolocator.openLocationSettings();
    return await Geolocator.isLocationServiceEnabled() &&
        await _hasPermission();
  }

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }

  if (permission == LocationPermission.deniedForever) {
    if (!context.mounted) return false;
    final open = await _permissionDialog(
      context,
      title: 'Location access needed',
      message:
          'Ellipse needs location access for attendance. You’ve blocked it, so '
          'please enable location for Ellipse in your device settings.',
      actionLabel: 'Open app settings',
    );
    if (open == true) await Geolocator.openAppSettings();
    return await _hasPermission();
  }

  return permission == LocationPermission.always ||
      permission == LocationPermission.whileInUse;
}

Future<bool> _hasPermission() async {
  final p = await Geolocator.checkPermission();
  return p == LocationPermission.always || p == LocationPermission.whileInUse;
}

Future<bool?> _permissionDialog(
  BuildContext context, {
  required String title,
  required String message,
  required String actionLabel,
}) {
  return showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      backgroundColor: Colors.white,
      shape:
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: const BoxDecoration(
                color: Color(0xFFF0F2EF), shape: BoxShape.circle),
            child: const Icon(Iconsax.location, color: Color(0xFF1D2825)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(title,
                style: GoogleFonts.poppins(
                    fontSize: 16, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
      content: Text(message,
          style: GoogleFonts.poppins(fontSize: 13, height: 1.5)),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: Text('Not now',
              style: GoogleFonts.poppins(color: const Color(0xFF687080))),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF1D2825),
            shape: const StadiumBorder(),
          ),
          onPressed: () => Navigator.pop(context, true),
          child: Text(actionLabel),
        ),
      ],
    ),
  );
}

/// Whether the employee has previously granted field-work tracking consent.
Future<bool> hasFieldTrackingConsent() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getBool(_kConsentKey) ?? false;
}

Future<void> _setFieldTrackingConsent(bool value) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(_kConsentKey, value);
}

/// One-time background-service configuration. Safe to call more than once.
/// No-op on web, where background services and foreground notifications are
/// unavailable — the UI still works, tracking simply doesn't run.
Future<void> configureFieldTrackingService() async {
  if (kIsWeb) return;
  final service = FlutterBackgroundService();
  await service.configure(
    androidConfiguration: AndroidConfiguration(
      onStart: onFieldTrackingStart,
      autoStart: false,
      isForegroundMode: true,
      notificationChannelId: 'ellipse_field_tracking',
      initialNotificationTitle: 'Ellipse field work',
      initialNotificationContent: 'Recording your field-work route',
      foregroundServiceNotificationId: _kServiceNotificationId,
      foregroundServiceTypes: [AndroidForegroundType.location],
    ),
    iosConfiguration: IosConfiguration(
      autoStart: false,
      onForeground: onFieldTrackingStart,
      onBackground: _onIosBackground,
    ),
  );
}

/// Requests location permission and, on grant, starts the background tracking
/// service. `scheduledEndMillis` is the privacy cutoff (UTC ms); tracking stops
/// at that instant even if the user never returns from field work.
///
/// Returns true when tracking started.
Future<bool> startFieldTracking({required int? scheduledEndMillis}) async {
  // Background location tracking is not supported on web.
  if (kIsWeb) return false;
  if (!await Geolocator.isLocationServiceEnabled()) return false;

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    return false;
  }

  final service = FlutterBackgroundService();
  if (await service.isRunning()) {
    service.invoke('stop');
    await Future<void>.delayed(const Duration(milliseconds: 300));
  }
  await service.startService();
  // Pass the cutoff to the isolate.
  service.invoke('configure', {
    'scheduledEndMillis': scheduledEndMillis,
  });
  return true;
}

/// Stops field-work tracking and flushes any buffered points.
Future<void> stopFieldTracking() async {
  if (kIsWeb) return;
  final service = FlutterBackgroundService();
  if (await service.isRunning()) {
    service.invoke('stop');
  }
}

/// Starts low-frequency (~30 min) location checks while the employee is simply
/// clocked in and working (not on field work). Powers the live team map with an
/// accurate recent position during working hours only. Stops automatically at
/// the scheduled end-of-work (`scheduledEndMillis`).
///
/// Reuses the same background service + consent as field tracking but runs in
/// 'working' mode: a single fresh fix every 30 minutes via `attendanceLocationPing`.
Future<bool> startWorkingTracking({required int? scheduledEndMillis}) async {
  if (kIsWeb) return false;
  if (!await Geolocator.isLocationServiceEnabled()) return false;

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    return false;
  }

  final service = FlutterBackgroundService();
  if (await service.isRunning()) {
    service.invoke('stop');
    await Future<void>.delayed(const Duration(milliseconds: 300));
  }
  await service.startService();
  service.invoke('configure', {
    'mode': 'working',
    'scheduledEndMillis': scheduledEndMillis,
  });
  return true;
}

/// Stops working-hours location checks.
Future<void> stopWorkingTracking() async {
  if (kIsWeb) return;
  final service = FlutterBackgroundService();
  if (await service.isRunning()) {
    service.invoke('stop');
  }
}

/// Whether the tracking service is currently running.
Future<bool> isFieldTrackingRunning() async {
  if (kIsWeb) return false;
  return FlutterBackgroundService().isRunning();
}

@pragma('vm:entry-point')
Future<bool> _onIosBackground(ServiceInstance service) async {
  return true;
}

/// Background isolate entry point. Collects positions and flushes them to the
/// backend every 2 minutes, honoring the end-of-work privacy cutoff.
@pragma('vm:entry-point')
Future<void> onFieldTrackingStart(ServiceInstance service) async {
  // Ensure Firebase is available in this isolate for the callable.
  DartPluginRegistrant.ensureInitialized();
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
    }
  } catch (_) {
    // If Firebase can't init we still collect; flush will retry.
  }

  final buffer = <Map<String, dynamic>>[];
  int? scheduledEndMillis;
  String mode = 'field';
  StreamSubscription<Position>? positionSub;
  Timer? flushTimer;
  Timer? workingTimer;
  Timer? cutoffTimer;
  bool started = false;

  Future<void> flush() async {
    if (buffer.isEmpty) return;
    final batch = List<Map<String, dynamic>>.from(buffer);
    buffer.clear();
    try {
      await FirebaseFunctions.instanceFor(region: 'us-central1')
          .httpsCallable('attendancePing')
          .call({'points': batch});
    } catch (_) {
      // Re-buffer on failure so a transient network drop doesn't lose points,
      // capped so the buffer can't grow without bound.
      if (buffer.length < 500) {
        buffer.insertAll(0, batch.take(500 - buffer.length));
      }
    }
  }

  Future<void> shutdown() async {
    await flush();
    await positionSub?.cancel();
    flushTimer?.cancel();
    workingTimer?.cancel();
    cutoffTimer?.cancel();
    await service.stopSelf();
  }

  bool pastCutoff() {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    return scheduledEndMillis != null && nowMs >= scheduledEndMillis!;
  }

  // --- Working mode: one fresh fix every 30 minutes -----------------------
  Future<void> workingPing() async {
    if (pastCutoff()) {
      await shutdown();
      return;
    }
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings:
            const LocationSettings(accuracy: LocationAccuracy.high),
      );
      await FirebaseFunctions.instanceFor(region: 'us-central1')
          .httpsCallable('attendanceLocationPing')
          .call({
        'location': {
          'latitude': pos.latitude,
          'longitude': pos.longitude,
          'accuracy': pos.accuracy,
        },
      });
    } catch (_) {
      // Ignore a single failed check; the next 30-min tick retries.
    }
    if (service is AndroidServiceInstance) {
      service.setForegroundNotificationInfo(
        title: 'Ellipse',
        content: 'Sharing your location during working hours',
      );
    }
  }

  // --- Field mode: distance-filtered stream + 2-min flush -----------------
  void startFieldMode() {
    positionSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 50,
      ),
    ).listen((position) {
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      if (pastCutoff()) {
        shutdown();
        return;
      }
      buffer.add({
        'latitude': position.latitude,
        'longitude': position.longitude,
        'accuracy': position.accuracy,
        'timestamp': nowMs,
      });
      if (service is AndroidServiceInstance) {
        service.setForegroundNotificationInfo(
          title: 'Ellipse field work',
          content: 'Recording your route · stops at end of work',
        );
      }
    });
    flushTimer = Timer.periodic(const Duration(minutes: 2), (_) => flush());
  }

  void startWorkingMode() {
    // Immediate first fix, then every 30 minutes.
    workingPing();
    workingTimer =
        Timer.periodic(const Duration(minutes: 30), (_) => workingPing());
  }

  service.on('configure').listen((event) {
    final end = event?['scheduledEndMillis'];
    if (end is int) scheduledEndMillis = end;
    final m = event?['mode'];
    if (m is String) mode = m;
    // Set up the appropriate collector once (configure may fire more than once).
    if (!started) {
      started = true;
      if (mode == 'working') {
        startWorkingMode();
      } else {
        startFieldMode();
      }
      // Safety cutoff timer: stop precisely at end-of-work in either mode.
      cutoffTimer = Timer.periodic(const Duration(seconds: 30), (t) {
        if (pastCutoff()) {
          t.cancel();
          shutdown();
        }
      });
    }
  });
  service.on('stop').listen((_) => shutdown());
}

/// Consent bottom sheet shown before field-work tracking begins for the first
/// time. Returns true when the employee consents. Matches the premium UI.
Future<bool> showFieldTrackingConsent(BuildContext context) async {
  final agreed = await showModalBottomSheet<bool>(
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
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: const BoxDecoration(
                  color: Color(0xFFF0F2EF),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Iconsax.routing_2, color: Color(0xFF1D2825)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  'Field-work location',
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
            'During your working hours, Ellipse shares your location with your '
            'organization so managers can see the team on a live map. While you '
            'are on field work, it also records your full route to verify client '
            'visits and time on site.',
            style: GoogleFonts.poppins(fontSize: 13, height: 1.5),
          ),
          const SizedBox(height: 12),
          _consentPoint(Iconsax.clock,
              'Location is checked about every 30 minutes while working, and continuously during field work. It stops automatically at your end-of-work time — never after hours.'),
          _consentPoint(Iconsax.notification,
              'A notification stays visible the whole time tracking is active.'),
          _consentPoint(Iconsax.eye,
              'Only your organization owner and admins can see your location and routes.'),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF1D2825),
                shape: const StadiumBorder(),
              ),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('I agree — start field work'),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(
                'Not now',
                style: GoogleFonts.poppins(color: const Color(0xFF687080)),
              ),
            ),
          ),
        ],
      ),
    ),
  );
  final consented = agreed ?? false;
  if (consented) await _setFieldTrackingConsent(true);
  return consented;
}

Widget _consentPoint(IconData icon, String text) => Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: const Color(0xFF1D2825)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.poppins(fontSize: 12.5, height: 1.45),
            ),
          ),
        ],
      ),
    );
