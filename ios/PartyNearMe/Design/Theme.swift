import SwiftUI
import UIKit

/// The brand. It follows the phone's light or dark setting, as on Android:
/// - Night (dark): near-black with a violet tint and a hot pink to violet gradient,
///   the look of a club at night.
/// - Day (light): warm cream with a coral to pink gradient, like a sunset.
/// Photos and one gradient do the talking in both. Every colour here is dynamic,
/// so it switches with the phone's appearance without any view code.
enum Brand {
    static let pink = Color(hex: 0xFF3D7F)
    static let violet = Color(hex: 0x8B5CF6)
    static let orange = Color(hex: 0xFF8A3D)
    static let coral = Color(hex: 0xFF5A4E)

    /// Main buttons, my chat bubbles, the selected chip.
    static let gradient = LinearGradient(
        colors: [.dynamic(day: 0xFF5A4E, night: 0xFF3D7F), .dynamic(day: 0xFF3D7F, night: 0x8B5CF6)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    /// The wordmark and the rings around people and parties.
    static let sunset = LinearGradient(
        colors: [orange, .dynamic(day: 0xFF5A4E, night: 0xFF3D7F), .dynamic(day: 0xFF3D7F, night: 0x8B5CF6)],
        startPoint: .leading, endPoint: .trailing
    )
    /// The two soft lights behind the sign-in screen.
    static let glow = (
        Color.dynamic(day: 0xFF8A3D, night: 0xFF3D7F, dayAlpha: 0.22, nightAlpha: 0.35),
        Color.dynamic(day: 0xFF3D7F, night: 0x8B5CF6, dayAlpha: 0.18, nightAlpha: 0.30)
    )
    /// Darkens the bottom of a photo so white text on it stays readable.
    static let scrim = LinearGradient(colors: [.clear, .black.opacity(0.8)], startPoint: .top, endPoint: .bottom)
}

/// The app's colours by role, the same values as the Android theme.
extension Color {
    static let appBackground = dynamic(day: 0xFFF8F4, night: 0x0B0A10)
    static let appText = dynamic(day: 0x221A1D, night: 0xF5F3FA)
    static let appSecondaryText = dynamic(day: 0x6E6064, night: 0xA29EB4)
    /// A deeper pink by day, so text and icons in it pass contrast on cream.
    static let appAccent = dynamic(day: 0xE11D63, night: 0xFF3D7F)
    /// Fields, chips and secondary buttons.
    static let appField = dynamic(day: 0xFFF1EC, night: 0x14121C)
    static let appRaised = dynamic(day: 0xF9E6E0, night: 0x1C1927)
    static let appDivider = dynamic(day: 0xEBD9D3, night: 0x2C2839)
    static let appError = dynamic(day: 0xD92D3A, night: 0xFF5A5F)

    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: alpha)
    }

    static func dynamic(day: UInt32, night: UInt32, dayAlpha: CGFloat = 1, nightAlpha: CGFloat = 1) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(hex: night, alpha: nightAlpha) : UIColor(hex: day, alpha: dayAlpha)
        })
    }
}

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: alpha)
    }
}

/// Heavier, tighter headings than the system defaults: the look of current social apps.
extension Font {
    static let display = Font.system(size: 34, weight: .heavy)
    static let headline1 = Font.system(size: 28, weight: .heavy)
    static let headline2 = Font.system(size: 22, weight: .bold)
    static let overline = Font.system(size: 12, weight: .bold)
}

extension View {
    /// A large, tight screen heading.
    func headingStyle(_ font: Font = .headline1) -> some View {
        self.font(font).tracking(-0.6).foregroundStyle(Color.appText)
    }

    /// Body text one step quieter than the main text.
    func secondaryStyle() -> some View {
        self.font(.body).foregroundStyle(Color.appSecondaryText)
    }
}
