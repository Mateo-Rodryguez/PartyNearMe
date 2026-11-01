import SwiftUI
import UIKit

/// The signed-in app: five tabs with a gradient "+" in the middle, TikTok style,
/// on the system's own tab bar. Tabs fill in as their screens are rebuilt natively.
struct MainView: View {
    enum Tab: Hashable { case home, nearby, post, messages, profile }

    let me: OwnProfile
    @State private var tab: Tab

    init(me: OwnProfile, tab: Tab = .home) {
        self.me = me
        _tab = State(initialValue: tab)
    }

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                ComingSoon(title: "Home", systemImage: "house", text: "The feed of photos from parties near you.")
            }
            .tabItem { Label("Home", systemImage: tab == .home ? "house.fill" : "house") }
            .tag(Tab.home)

            NavigationStack {
                ComingSoon(title: "Nearby", systemImage: "map", text: "Parties on a map and in a list, by distance and time.")
            }
            .tabItem { Label("Nearby", systemImage: tab == .nearby ? "mappin.circle.fill" : "mappin.circle") }
            .tag(Tab.nearby)

            NavigationStack {
                ComingSoon(title: "New post", systemImage: "camera", text: "Share photos from a party.")
            }
            .tabItem {
                Image(uiImage: PostTabIcon.image)
                Text("Post")
            }
            .tag(Tab.post)

            NavigationStack {
                ComingSoon(title: "Messages", systemImage: "bubble.left.and.bubble.right",
                           text: "Your chats and party group chats.")
            }
            .tabItem { Label("Messages", systemImage: tab == .messages ? "bubble.left.and.bubble.right.fill" : "bubble.left.and.bubble.right") }
            .tag(Tab.messages)

            NavigationStack { MeView(me: me) }
                .tabItem { Label("Profile", systemImage: tab == .profile ? "person.crop.circle.fill" : "person.crop.circle") }
                .tag(Tab.profile)
        }
        .sensoryFeedback(.selection, trigger: tab)
    }
}

/// A tab whose native screen is still being built.
private struct ComingSoon: View {
    let title: String
    let systemImage: String
    let text: String

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text("\(text)\nComing soon in the new iPhone app.")
        }
        .background(AppBackground())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// For now: who you're signed in as, and signing out. The full profile comes next.
private struct MeView: View {
    @Environment(AppModel.self) private var app
    let me: OwnProfile

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    Circle()
                        .fill(Brand.gradient)
                        .frame(width: 56, height: 56)
                        .overlay {
                            Text(String(me.name.trimmingCharacters(in: CharacterSet(charactersIn: "@")).prefix(1)).uppercased())
                                .font(.title2.weight(.bold))
                                .foregroundStyle(.white)
                        }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(me.displayName ?? me.username ?? "You").font(.headline)
                        if let username = me.username {
                            Text("@\(username)").font(.subheadline).foregroundStyle(Color.appSecondaryText)
                        }
                    }
                }
                .padding(.vertical, 4)
            }
            Section {
                Link(destination: AppConfig.termsURL) { Label("Terms", systemImage: "doc.text") }
                Link(destination: AppConfig.privacyURL) { Label("Privacy policy", systemImage: "hand.raised") }
            }
            Section {
                Button("Sign out", role: .destructive) { Task { await app.signOut() } }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AppBackground())
        .navigationTitle("Profile")
    }
}

/// The middle tab's icon: a "+" on a rounded gradient tile, drawn once. The tab bar
/// shows it in its own colours rather than tinting it.
enum PostTabIcon {
    static let image: UIImage = {
        let size = CGSize(width: 40, height: 28)
        let image = UIGraphicsImageRenderer(size: size).image { context in
            let rect = CGRect(origin: .zero, size: size)
            UIBezierPath(roundedRect: rect, cornerRadius: 9).addClip()
            let colors = [UIColor(hex: 0xFF3D7F).cgColor, UIColor(hex: 0x8B5CF6).cgColor] as CFArray
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
                context.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: size.width, y: size.height), options: [])
            }
            let plus = UIImage(systemName: "plus", withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .bold))?
                .withTintColor(.white, renderingMode: .alwaysOriginal)
            if let plus {
                plus.draw(at: CGPoint(x: (size.width - plus.size.width) / 2, y: (size.height - plus.size.height) / 2))
            }
        }
        return image.withRenderingMode(.alwaysOriginal)
    }()
}
