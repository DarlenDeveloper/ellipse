import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return ios;
      case TargetPlatform.windows:
      case TargetPlatform.linux:
      case TargetPlatform.fuchsia:
        throw UnsupportedError(
          'Firebase is not configured for this platform.',
        );
    }
  }

  static const web = FirebaseOptions(
    apiKey: 'AIzaSyCByAfWi5cNlmBiuBNBZa-lNBW0zSpV2rg',
    appId: '1:344223107303:web:fdf5203112592c83b43a42',
    messagingSenderId: '344223107303',
    projectId: 'ellipse-desk',
    authDomain: 'ellipse-desk.firebaseapp.com',
    storageBucket: 'ellipse-desk.firebasestorage.app',
    measurementId: 'G-CMJH1RM5Y5',
  );

  static const android = FirebaseOptions(
    apiKey: 'AIzaSyDDl_jJkasNGA43WdhpQz0letmyrIiJ3Yc',
    appId: '1:344223107303:android:115dcbcdbef266c1b43a42',
    messagingSenderId: '344223107303',
    projectId: 'ellipse-desk',
    storageBucket: 'ellipse-desk.firebasestorage.app',
  );

  static const ios = FirebaseOptions(
    apiKey: 'AIzaSyDaw6iIaG05m5qSCoL2VnQcnmap3Bv70vQ',
    appId: '1:344223107303:ios:04917a6ebbca3946b43a42',
    messagingSenderId: '344223107303',
    projectId: 'ellipse-desk',
    storageBucket: 'ellipse-desk.firebasestorage.app',
    iosClientId:
        '344223107303-kloc5nj18d3oqndidsqes6opq54j7io5.apps.googleusercontent.com',
    iosBundleId: 'com.ellipse.ellipseCompanion',
  );
}
