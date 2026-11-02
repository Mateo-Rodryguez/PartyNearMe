import Observation
import SwiftUI

/// Settings that stay on this phone: theme, units, how far Nearby looks, and
/// whether like counts show. Saved in UserDefaults.
@MainActor
@Observable
final class AppPrefs {
    enum Theme: String, CaseIterable, Identifiable {
        case system, light, dark
        var id: Self { self }
        var label: String {
            switch self {
            case .system: return "Automatic"
            case .light: return "Day"
            case .dark: return "Night"
            }
        }
        var colorScheme: ColorScheme? {
            switch self {
            case .system: return nil
            case .light: return .light
            case .dark: return .dark
            }
        }
    }

    static let radiusChoices = [5, 10, 25, 50]
    static let shared = AppPrefs()

    @ObservationIgnored private let defaults: UserDefaults

    var theme: Theme { didSet { defaults.set(theme.rawValue, forKey: Keys.theme) } }
    /// Distances in miles. Starts from the phone's region (miles in the US and the UK).
    var miles: Bool { didSet { defaults.set(miles, forKey: Keys.miles) } }
    var radiusKm: Int { didSet { defaults.set(radiusKm, forKey: Keys.radius) } }
    /// Hides the like count on other people's posts.
    var hideLikeCounts: Bool { didSet { defaults.set(hideLikeCounts, forKey: Keys.hideLikes) } }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        theme = defaults.string(forKey: Keys.theme).flatMap(Theme.init(rawValue:)) ?? .system
        miles = defaults.object(forKey: Keys.miles) as? Bool ?? (Locale.current.measurementSystem != .metric)
        let radius = defaults.integer(forKey: Keys.radius)
        radiusKm = Self.radiusChoices.contains(radius) ? radius : 25
        hideLikeCounts = defaults.bool(forKey: Keys.hideLikes)
    }

    /// "25 km", or "16 mi" in miles.
    func radiusLabel(_ km: Int) -> String { miles ? "\(Int(Double(km) / 1.609 + 0.5)) mi" : "\(km) km" }

    private enum Keys {
        static let theme = "pref_theme"
        static let miles = "pref_miles"
        static let radius = "pref_radius_km"
        static let hideLikes = "pref_hide_like_counts"
    }
}
