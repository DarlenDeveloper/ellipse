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
  StreamSubscription<Position>? positionSub;
  Timer? flushTimer;

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
    await service.stopSelf();
  }

  service.on('configure').listen((event) {
    final end = event?['scheduledEndMillis'];
    if (end is int) scheduledEndMillis = end;
  });
  service.on('stop').listen((_) => shutdown());

  // Distance-filtered stream: a new fix at most every ~50m of movement, which
  // combined with the 2-minute flush keeps writes and battery low.
  positionSub = Geolocator.getPositionStream(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 50,
    ),
  ).listen((position) {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    // Privacy cutoff: stop entirely once end-of-work passes.
    if (scheduledEndMillis != null && nowMs >= scheduledEndMillis!) {
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

  // Flush every 2 minutes.
  flushTimer = Timer.periodic(const Duration(minutes: 2), (_) => flush());

  // Safety cutoff timer: if we have an end time, stop precisely at it even with
  // no movement events arriving.
  Timer.periodic(const Duration(seconds: 30), (t) {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    if (scheduledEndMillis != null && nowMs >= scheduledEndMillis!) {
      t.cancel();
      shutdown();
    }
  });
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
            'While you are on field work, Ellipse records your route so your '
            'organization can verify client visits and time spent on site.',
            style: GoogleFonts.poppins(fontSize: 13, height: 1.5),
          ),
          const SizedBox(height: 12),
          _consentPoint(Iconsax.clock,
              'Tracking runs only during field work and stops automatically at your end-of-work time.'),
          _consentPoint(Iconsax.notification,
              'A notification stays visible the whole time tracking is active.'),
          _consentPoint(Iconsax.eye,
              'Only your organization owner and admins can view your routes.'),
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
