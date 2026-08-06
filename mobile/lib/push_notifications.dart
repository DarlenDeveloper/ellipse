import 'dart:async';
import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'firebase_options.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
}

typedef PushTapHandler = void Function(Map<String, dynamic> data);

class PushNotifications {
  PushNotifications._();

  static final instance = PushNotifications._();

  static const _channel = AndroidNotificationChannel(
    'ellipse_important',
    'Important workspace updates',
    description: 'Messages, approvals, action results, and team updates.',
    importance: Importance.high,
  );

  final _local = FlutterLocalNotificationsPlugin();
  final _functions = FirebaseFunctions.instanceFor(region: 'us-central1');
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;
  StreamSubscription<String>? _tokenSubscription;
  PushTapHandler? _onTap;
  String? _registeredToken;
  bool _initialized = false;

  bool get _isMobile =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  Future<void> initialize({required PushTapHandler onTap}) async {
    _onTap = onTap;
    if (!_isMobile || _initialized) return;
    _initialized = true;

    await _local.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload == null || payload.isEmpty) return;
        try {
          _onTap?.call(Map<String, dynamic>.from(jsonDecode(payload) as Map));
        } catch (_) {}
      },
    );

    await _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(_channel);

    await FirebaseMessaging.instance
        .setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );

    _foregroundSubscription = FirebaseMessaging.onMessage.listen(
      _showForegroundNotification,
    );
    _openedSubscription = FirebaseMessaging.onMessageOpenedApp.listen(
      (message) => _onTap?.call(message.data),
    );
    _tokenSubscription = FirebaseMessaging.instance.onTokenRefresh.listen(
      _registerToken,
    );

    final initialMessage = await FirebaseMessaging.instance.getInitialMessage();
    if (initialMessage != null) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _onTap?.call(initialMessage.data),
      );
    }
    final localLaunch = await _local.getNotificationAppLaunchDetails();
    final localPayload = localLaunch?.notificationResponse?.payload;
    if (localLaunch?.didNotificationLaunchApp == true &&
        localPayload != null &&
        localPayload.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        try {
          _onTap?.call(
            Map<String, dynamic>.from(jsonDecode(localPayload) as Map),
          );
        } catch (_) {}
      });
    }
  }

  Future<bool> registerForSignedInUser({bool requestPermission = true}) async {
    if (!_isMobile || FirebaseAuth.instance.currentUser == null) return false;
    if (requestPermission) {
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied ||
          settings.authorizationStatus == AuthorizationStatus.notDetermined) {
        return false;
      }
    }

    if (defaultTargetPlatform == TargetPlatform.iOS) {
      String? apnsToken;
      for (var attempt = 0; attempt < 8 && apnsToken == null; attempt++) {
        apnsToken = await FirebaseMessaging.instance.getAPNSToken();
        if (apnsToken == null) {
          await Future<void>.delayed(const Duration(milliseconds: 500));
        }
      }
      if (apnsToken == null) return false;
    }

    final token = await FirebaseMessaging.instance.getToken();
    if (token == null || token.isEmpty) return false;
    await _registerToken(token);
    return true;
  }

  Future<void> _registerToken(String token) async {
    if (FirebaseAuth.instance.currentUser == null ||
        token == _registeredToken) {
      return;
    }
    try {
      await _functions.httpsCallable('registerPushToken').call<void>({
        'token': token,
        'platform': defaultTargetPlatform.name,
      });
      _registeredToken = token;
    } catch (_) {
      // Registration retries on the next launch or token refresh.
    }
  }

  Future<void> unregisterCurrentToken() async {
    if (!_isMobile || FirebaseAuth.instance.currentUser == null) return;
    final token =
        _registeredToken ?? await FirebaseMessaging.instance.getToken();
    if (token == null || token.isEmpty) return;
    try {
      await _functions.httpsCallable('unregisterPushToken').call<void>({
        'token': token,
      });
      _registeredToken = null;
    } catch (_) {}
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
    if (defaultTargetPlatform != TargetPlatform.android) return;
    final notification = message.notification;
    if (notification == null) return;
    await _local.show(
      id:
          message.messageId?.hashCode ??
          DateTime.now().millisecondsSinceEpoch.remainder(2147483647),
      title: notification.title ?? 'Ellipse Desk',
      body: notification.body ?? 'You have a new workspace update.',
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'ellipse_important',
          'Important workspace updates',
          channelDescription:
              'Messages, approvals, action results, and team updates.',
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
      ),
      payload: jsonEncode(message.data),
    );
  }

  Future<void> dispose() async {
    await _foregroundSubscription?.cancel();
    await _openedSubscription?.cancel();
    await _tokenSubscription?.cancel();
  }
}
