import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)
    let launched = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    // Explicit registration makes APNs token acquisition deterministic in
    // TestFlight builds instead of relying solely on Firebase swizzling.
    application.registerForRemoteNotifications()
    return launched
  }
}
