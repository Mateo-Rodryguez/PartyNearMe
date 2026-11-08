import Observation
import SwiftUI

/// Settings that stay on this phone: theme, units, how far Nearby looks, whether
/// like counts show, and usage stats. Saved in UserDefaults, with Android's keys.
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
    /// Sends anonymous usage counts (see Analytics); people can turn it off in settings.
    var shareUsage: Bool { didSet { defaults.set(shareUsage, forKey: Keys.shareUsage) } }

    /// Days (since 1970, UTC) for the "would you recommend us?" card: the first and
    /// latest day the app was used, how many different days, and when it was last asked.
    private(set) var firstActiveDay: Int { didSet { defaults.set(firstActiveDay, forKey: Keys.firstActive) } }
    private(set) var lastActiveDay: Int { didSet { defaults.set(lastActiveDay, forKey: Keys.lastActive) } }
    private(set) var activeDays: Int { didSet { defaults.set(activeDays, forKey: Keys.activeDays) } }
    var recommendAskedDay: Int { didSet { defaults.set(recommendAskedDay, forKey: Keys.recommendAsked) } }
    /// Parties sorted by date instead of For you (ranked by what this person likes).
    var partiesSoonest: Bool { didSet { defaults.set(partiesSoonest, forKey: Keys.partiesSoonest) } }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        theme = defaults.string(forKey: Keys.theme).flatMap(Theme.init(rawValue:)) ?? .system
        miles = defaults.object(forKey: Keys.miles) as? Bool ?? (Locale.current.measurementSystem != .metric)
        let radius = defaults.integer(forKey: Keys.radius)
        radiusKm = Self.radiusChoices.contains(radius) ? radius : 25
        hideLikeCounts = defaults.bool(forKey: Keys.hideLikes)
        shareUsage = defaults.object(forKey: Keys.shareUsage) as? Bool ?? true
        firstActiveDay = defaults.integer(forKey: Keys.firstActive)
        lastActiveDay = defaults.integer(forKey: Keys.lastActive)
        activeDays = defaults.integer(forKey: Keys.activeDays)
        recommendAskedDay = defaults.integer(forKey: Keys.recommendAsked)
        partiesSoonest = defaults.bool(forKey: Keys.partiesSoonest)
    }

    /// Today as a day number (days since 1970, UTC).
    static func today(_ now: Date = Date()) -> Int { Int(now.timeIntervalSince1970 / 86_400) }

    /// Counts `today` as a day the app was used.
    func activeOn(_ today: Int) {
        guard today != lastActiveDay else { return }
        if firstActiveDay == 0 { firstActiveDay = today }
        lastActiveDay = today
        activeDays += 1
    }

    /// True when it's time to ask "would you recommend PartyNearMe to a friend?":
    /// only once someone knows the app (used on 3+ days over at least a week), and
    /// then at most every 90 days, so it never nags. Same rule as Android.
    func recommendDue(_ today: Int) -> Bool {
        activeDays >= 3 && firstActiveDay > 0 && today - firstActiveDay >= 7
            && (recommendAskedDay == 0 || today - recommendAskedDay >= 90)
    }

    /// "25 km", or "16 mi" in miles.
    func radiusLabel(_ km: Int) -> String { miles ? "\(Int(Double(km) / 1.609 + 0.5)) mi" : "\(km) km" }

    private enum Keys {
        static let theme = "pref_theme"
        static let miles = "pref_miles"
        static let radius = "pref_radius_km"
        static let hideLikes = "pref_hide_like_counts"
        static let shareUsage = "pref_share_usage"
        static let firstActive = "pref_first_active_day"
        static let lastActive = "pref_last_active_day"
        static let activeDays = "pref_active_days"
        static let recommendAsked = "pref_recommend_asked_day"
        static let partiesSoonest = "pref_parties_soonest"
    }
}
