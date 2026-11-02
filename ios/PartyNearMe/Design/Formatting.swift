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
}
