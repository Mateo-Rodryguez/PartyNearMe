import CoreLocation

/// The phone's location, asked for only while the app is open.
@MainActor
protocol LocationProvider: AnyObject {
    /// Asks for permission first if needed. Nil when the user said no or there's no fix.
    func current() async -> CLLocationCoordinate2D?
}

@MainActor
final class DeviceLocation: NSObject, LocationProvider, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var permission: CheckedContinuation<Void, Never>?
    private var fix: CheckedContinuation<CLLocationCoordinate2D?, Never>?

    override init() {
        super.init()
        manager.delegate = self
        // Parties are a street or two apart at most: no need for GPS-level accuracy.
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func current() async -> CLLocationCoordinate2D? {
        if manager.authorizationStatus == .notDetermined {
            await withCheckedContinuation { continuation in
                permission = continuation
                manager.requestWhenInUseAuthorization()
            }
        }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: break
        default: return nil
        }
        if let recent = manager.location, recent.timestamp.timeIntervalSinceNow > -120 { return recent.coordinate }
        // One request at a time; a second caller waits for the same answer by asking again after.
        guard fix == nil else { return manager.location?.coordinate }
        return await withCheckedContinuation { continuation in
            fix = continuation
            manager.requestLocation()
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        MainActor.assumeIsolated {
            guard status != .notDetermined else { return }
            permission?.resume()
            permission = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let coordinate = locations.last?.coordinate
        MainActor.assumeIsolated {
            fix?.resume(returning: coordinate)
            fix = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        MainActor.assumeIsolated {
            fix?.resume(returning: nil)
            fix = nil
        }
    }
}
