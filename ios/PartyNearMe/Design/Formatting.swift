import Foundation

enum Formatting {
    private static let withFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let plain = ISO8601DateFormatter()

    /// The server's timestamps, with or without fractions of a second. Nil for anything else.
    static func date(_ iso: String) -> Date? { withFraction.date(from: iso) ?? plain.date(from: iso) }

    /// "now", "5m", "3h", "2d", then a date: the Instagram style for post times.
    static func timeAgo(_ iso: String, now: Date = Date()) -> String {
        guard let then = date(iso) else { return "" }
        let minutes = Int(now.timeIntervalSince(then) / 60)
        switch minutes {
        case ..<1: return "now"
        case ..<60: return "\(minutes)m"
        case ..<(24 * 60): return "\(minutes / 60)h"
        case ..<(7 * 24 * 60): return "\(minutes / (24 * 60))d"
        default: return then.formatted(.dateTime.day().month(.abbreviated))
        }
    }

    /// 1890 -> "1,890", 12500 -> "12.5K": how social apps show big numbers.
    static func compactCount(_ n: Int) -> String {
        func short(_ value: Double, _ suffix: String) -> String {
            let rounded = (value * 10).rounded(.down) / 10
            return (rounded == rounded.rounded() ? String(Int(rounded)) : String(rounded)) + suffix
        }
        switch n {
        case 1_000_000...: return short(Double(n) / 1_000_000, "M")
        case 10_000...: return short(Double(n) / 1_000, "K")
        case 1_000...: return "\(n / 1000),\(String(format: "%03d", n % 1000))"
        default: return String(n)
        }
    }

    /// "Sam", "Sam and Alex", "Sam and 2 others".
    static func tagged(_ names: [String]) -> String {
        switch names.count {
        case 0: return ""
        case 1: return names[0]
        case 2: return "\(names[0]) and \(names[1])"
        default: return "\(names[0]) and \(names.count - 1) others"
        }
    }

    // MARK: Parties

    /// "Tonight", "Tomorrow", or "Wed 21 Oct" in the phone's time zone.
    static func dayLabel(_ iso: String, now: Date = Date(), calendar: Calendar = .current) -> String {
        guard let day = date(iso) else { return "" }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: day)).day ?? 0
        switch days {
        case 0: return "Tonight"
        case 1: return "Tomorrow"
        default: return fixed("EEE d MMM", calendar).string(from: day)
        }
    }

    /// "21:00", in the phone's time zone and its 12 or 24 hour setting.
    static func clockTime(_ iso: String) -> String {
        guard let time = date(iso) else { return "" }
        return time.formatted(date: .omitted, time: .shortened)
    }

    /// "21:00 – 01:00", or just the start when there's no end.
    static func timeRange(_ startsAt: String, _ endsAt: String?) -> String {
        let start = clockTime(startsAt)
        guard let endsAt, !clockTime(endsAt).isEmpty else { return start }
        return "\(start) – \(clockTime(endsAt))"
    }

    /// The two lines of a calendar tile: "OCT" and "19".
    static func calendarTile(_ iso: String, calendar: Calendar = .current) -> (month: String, day: String) {
        guard let day = date(iso) else { return ("", "") }
        return (fixed("MMM", calendar).string(from: day).uppercased(), String(calendar.component(.day, from: day)))
    }

    /// The app's own short date style, the same on every phone, as on Android.
    private static func fixed(_ format: String, _ calendar: Calendar) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = format
        return formatter
    }

    /// A time as the server takes it.
    static func iso(_ date: Date) -> String { plain.string(from: date) }

    /// Whether to show distances in miles: in the US and the UK, as their road signs do.
    static var usesMiles: Bool { Locale.current.measurementSystem != .metric }

    /// "650 m away", "2.3 km away", or in miles "0.4 mi away".
    static func distance(_ meters: Int?, miles: Bool = usesMiles) -> String {
        guard let meters else { return "" }
        if miles {
            return "\(trimmed(Double(max(1, Int(Double(meters) / 160.934 + 0.5))) / 10)) mi away"
        }
        if meters < 1000 { return "\((meters / 50 + 1) * 50) m away" }
        return "\(trimmed(Double((meters + 50) / 100) / 10)) km away"
    }

    /// 2.0 -> "2", 2.3 -> "2.3".
    private static func trimmed(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
    }
}

/// The time filter above the Nearby list.
enum PartyTime: String, CaseIterable, Identifiable {
    case anyTime = "Any time"
    case tonight = "Tonight"
    case weekend = "This weekend"

    var id: Self { self }

    /// The range of start times to ask for, or nil for no limit.
    func window(now: Date = Date(), calendar: Calendar = .current) -> (from: Date, to: Date)? {
        switch self {
        case .anyTime: return nil
        case .tonight: return Self.tonight(now: now, calendar: calendar)
        case .weekend: return Self.weekend(now: now, calendar: calendar)
        }
    }

    /// From now until 6 the next morning: what people mean by "tonight".
    static func tonight(now: Date, calendar: Calendar) -> (from: Date, to: Date) {
        let today = calendar.startOfDay(for: now)
        let endDay = calendar.component(.hour, from: now) < 6 ? today : calendar.date(byAdding: .day, value: 1, to: today)!
        return (now, calendar.date(bySettingHour: 6, minute: 0, second: 0, of: endDay)!)
    }

    /// Friday 17:00 to Monday 6:00 of this weekend, or the next one; from now if it has started.
    static func weekend(now: Date, calendar: Calendar) -> (from: Date, to: Date) {
        let today = calendar.startOfDay(for: now)
        // Calendar weekdays run Sunday = 1 to Saturday = 7; Friday is 6.
        let sinceFriday = (calendar.component(.weekday, from: now) - 6 + 7) % 7
        let stillOn = sinceFriday <= 2 || (sinceFriday == 3 && calendar.component(.hour, from: now) < 6)
        let friday = calendar.date(byAdding: .day, value: stillOn ? -sinceFriday : 7 - sinceFriday, to: today)!
        let start = calendar.date(bySettingHour: 17, minute: 0, second: 0, of: friday)!
        let monday = calendar.date(byAdding: .day, value: 3, to: friday)!
        let end = calendar.date(bySettingHour: 6, minute: 0, second: 0, of: monday)!
        return (max(start, now), end)
    }
}
