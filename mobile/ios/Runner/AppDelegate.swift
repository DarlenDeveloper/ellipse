import Flutter
import GoogleMaps
import UIKit
import native_geofence

private func usableMapsKey(_ value: Any?) -> String? {
  guard let key = value as? String else { return nil }
  let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !trimmed.isEmpty, !trimmed.contains("$("), trimmed.hasPrefix("AIza") else {
    return nil
  }
  return trimmed
}

private func bundledMapsKey() -> String? {
  if let configured = usableMapsKey(
    Bundle.main.object(forInfoDictionaryKey: "GOOGLE_MAPS_API_KEY")
  ) {
    return configured
  }
  guard
    let url = Bundle.main.url(
      forResource: "GoogleService-Info",
      withExtension: "plist"
    ),
    let data = try? Data(contentsOf: url),
    let value = try? PropertyListSerialization.propertyList(
      from: data,
      options: [],
      format: nil
    ) as? [String: Any]
  else {
    return nil
  }
  return usableMapsKey(value["API_KEY"])
}

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    NativeGeofencePlugin.setPluginRegistrantCallback { registry in
      GeneratedPluginRegistrant.register(with: registry)
    }
    if let mapsKey = bundledMapsKey() {
      GMSServices.provideAPIKey(mapsKey)
    } else {
      NSLog("Ellipse: no usable iOS Google Maps API key was bundled")
    }
    GeneratedPluginRegistrant.register(with: self)
    let launched = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    // Explicit registration makes APNs token acquisition deterministic in
    // TestFlight builds instead of relying solely on Firebase swizzling.
    application.registerForRemoteNotifications()
    return launched
  }
}
