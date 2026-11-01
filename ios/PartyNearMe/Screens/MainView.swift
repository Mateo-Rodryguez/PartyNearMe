import SwiftUI
import UIKit

/// The signed-in app: five tabs with a gradient "+" in the middle, TikTok style,
/// on the system's own tab bar. Tabs fill in as their screens are rebuilt natively.
struct MainView: View {
    enum Tab: Hashable { case home, nearby, post, messages, profile }

    @Environment(AppModel.self) private var app
    let me: OwnProfile
    @State private var tab: Tab
    /// Home's posts, kept while other tabs are open so the feed keeps its place.
    @State private var feed: FeedModel?

    init(me: OwnProfile, tab: Tab = .home) {
        self.me = me
        _tab = State(initialValue: tab)
    }

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                if let feed { FeedView(paged: feed.paged).routeDestinations() }
            }
            .tabItem { Label("Home", systemImage: tab == .home ? "house.fill" : "house") }
            .tag(Tab.home)

            NavigationStack {
                ComingSoon(title: "Nearby", systemImage: "map", text: "Parties on a map and in a list, by distance and time.")
            }
            .tabItem { Label("Nearby", systemImage: tab == .nearby ? "mappin.circle.fill" : "mappin.circle") }
            .tag(Tab.nearby)

            NavigationStack {
                NewPostView {
                    tab = .home
                    Task { await feed?.paged.refresh() }
                }
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

            NavigationStack { ProfileView(userId: me.id).routeDestinations() }
                .tabItem { Label("Profile", systemImage: tab == .profile ? "person.crop.circle.fill" : "person.crop.circle") }
                .tag(Tab.profile)
        }
        .sensoryFeedback(.selection, trigger: tab)
        .overlay(alignment: .bottom) { ToastView() }
        .onAppear { if feed == nil { feed = FeedModel(app: app) } }
        // Send what the user looked at before the app goes to the background.
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in
            app.interactions.flush()
        }
    }
}

/// The short note at the bottom of the screen, above the tab bar.
private struct ToastView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        ZStack {
            if let toast = app.toast {
                Text(toast.text)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.appBackground)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(Capsule().fill(Color.appText))
                    .shadow(color: .black.opacity(0.2), radius: 12, y: 4)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 64)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .id(toast.id)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .animation(.snappy, value: app.toast)
        .allowsHitTesting(false)
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
