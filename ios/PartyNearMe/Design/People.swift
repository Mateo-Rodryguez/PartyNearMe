import SwiftUI

/// A round profile picture, or the first letter of the name on a gradient when there
/// isn't one. `ring` draws the brand ring around it, Instagram-story style.
struct Avatar: View {
    let url: String?
    let name: String
    var size: CGFloat = 40
    var ring = false

    var body: some View {
        ZStack {
            Circle().fill(Covers.gradient(for: name.trimmingCharacters(in: CharacterSet(charactersIn: "@"))))
            if let url, let link = URL(string: url) {
                RemoteImage(url: link)
            } else {
                Text(initial)
                    .font(.system(size: size * 0.4, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: ring ? size - 10 : size, height: ring ? size - 10 : size)
        .clipShape(Circle())
        .padding(ring ? 5 : 0)
        .overlay {
            if ring { Circle().strokeBorder(Brand.sunset, lineWidth: 2.5) }
        }
        .accessibilityLabel(name)
    }

    private var initial: String {
        String(name.trimmingCharacters(in: CharacterSet(charactersIn: "@")).prefix(1)).uppercased()
    }
}

/// Fallback colours for people and parties without a picture: one pair per name,
/// the same pairs as on Android.
enum Covers {
    private static let pairs: [(UInt32, UInt32)] = [
        (0xFF3D7F, 0x6D28D9), (0xFF8A3D, 0xDB2777), (0x06B6D4, 0x7C3AED), (0x8B5CF6, 0x1E1B4B), (0x22C55E, 0x0E7490),
    ]

    static func gradient(for key: String) -> LinearGradient {
        // A stable hash: Swift's own hashValue changes on every launch.
        let hash = key.unicodeScalars.reduce(UInt32(5381)) { ($0 &* 33) &+ $1.value }
        let pair = pairs[Int(hash % UInt32(pairs.count))]
        return LinearGradient(colors: [Color(hex: pair.0), Color(hex: pair.1)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

/// The small heart next to someone's name: full red when taken, half filled in a
/// softer red when talking to someone, an empty outline when single. Nothing when
/// they chose not to show it.
struct RelationshipHeart: View {
    let status: String?
    var size: CGFloat = 18

    private static let red = Color(hex: 0xE5132A)
    private static let softRed = Color(hex: 0xF2788A)

    var body: some View {
        switch status {
        case "taken":
            Image(systemName: "heart.fill").font(.system(size: size)).foregroundStyle(Self.red)
                .accessibilityLabel("In a relationship")
        case "talking":
            Image(systemName: "heart.lefthalf.filled").font(.system(size: size)).foregroundStyle(Self.softRed)
                .accessibilityLabel("Talking to someone")
        case "single":
            Image(systemName: "heart").font(.system(size: size)).foregroundStyle(Color.appText)
                .accessibilityLabel("Single and looking")
        default:
            EmptyView()
        }
    }
}
