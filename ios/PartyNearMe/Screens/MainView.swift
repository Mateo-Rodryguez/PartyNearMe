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
    /// Parties near the user, for the Nearby tab and Home's row of parties.
    @State private var nearby: NearbyModel?
    @State private var nearbyPath: [Route] = []
    @State private var homePath: [Route] = []
    /// The first time in the app, straight after onboarding.
    private let firstRun: Bool
    /// The demo shows the recommend card without waiting a week.
    private let forceRecommend: Bool

    init(me: OwnProfile, tab: Tab = .home, firstRun: Bool = false, askRecommend: Bool = false) {
        self.me = me
        self.firstRun = firstRun
        forceRecommend = askRecommend
        _tab = State(initialValue: tab)
    }

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack(path: $homePath) {
                if let feed {
                    FeedView(paged: feed.paged, parties: nearby?.paged.items ?? []) {
                        tab = .nearby
                        nearby?.creating = true
                    }
                    .analyticsScreen("home")
                    .routeDestinations()
                }
            }
            .tabItem { Label("Home", systemImage: tab == .home ? "house.fill" : "house") }
            .tag(Tab.home)

            NavigationStack(path: $nearbyPath) {
                if let nearby {
                    NearbyView(model: nearby) { nearbyPath.append(.event($0.id)) }
                        .analyticsScreen("nearby")
                        .routeDestinations()
                }
            }
            .tabItem { Label("Nearby", systemImage: tab == .nearby ? "mappin.circle.fill" : "mappin.circle") }
            .tag(Tab.nearby)

            NavigationStack {
                NewPostView {
                    tab = .home
                    Task { await feed?.paged.refresh() }
                }
                .analyticsScreen("new_post")
            }
            .tabItem {
                Image(uiImage: PostTabIcon.image)
                Text("Post")
            }
            .tag(Tab.post)

            NavigationStack { InboxView().analyticsScreen("inbox").routeDestinations() }
                .tabItem { Label("Messages", systemImage: tab == .messages ? "bubble.left.and.bubble.right.fill" : "bubble.left.and.bubble.right") }
                .badge(app.unreadChats)
                .tag(Tab.messages)

            NavigationStack { ProfileView(userId: me.id).analyticsScreen("my_profile").routeDestinations() }
                .tabItem { Label("Profile", systemImage: tab == .profile ? "person.crop.circle.fill" : "person.crop.circle") }
                .tag(Tab.profile)
        }
        .sensoryFeedback(.selection, trigger: tab)
        .overlay(alignment: .bottom) { ToastView() }
        .onAppear {
            if forceRecommend { app.askRecommend = true }
            if feed == nil { feed = FeedModel(app: app) }
            if nearby == nil {
                let model = NearbyModel(app: app)
                nearby = model
                Task { await model.paged.refresh() }
            }
        }
        // Send what the user looked at before the app goes to the background.
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in
            app.interactions.flush()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            Task { await app.refreshBadges() }
        }
        .task {
            app.analytics.capture("app_opened", ["first_run": firstRun])
            // Asked once someone knows the app: closing it, answering it or ignoring it all wait another 90 days.
            let prefs = AppPrefs.shared
            let today = AppPrefs.today()
            prefs.activeOn(today)
            if app.demoScreen == nil, prefs.recommendDue(today) {
                prefs.recommendAskedDay = today
                app.askRecommend = true
            }
        }
        // Badges: now, whenever a message arrives, and every couple of minutes for notifications.
        .task { await app.refreshBadges() }
        .task { for await _ in app.live.messages(in: nil) { await app.refreshBadges() } }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(120))
                await app.refreshBadges()
            }
        }
        .onOpenURL { openLink($0) }
    }
}

extension MainView {
    /// Opens a shared party or post: parties on Nearby, posts on Home.
    func openLink(_ url: URL) {
        let target = DeepLink.parse(url)
        let kind: String
        switch target {
        case .party: kind = "party"
        case .post: kind = "post"
        case nil: kind = "other"
        }
        app.analytics.capture("link_opened", ["kind": kind])
        switch target {
        case .party(let id):
            tab = .nearby
            nearbyPath.append(.event(id))
        case .post(let id):
            tab = .home
            homePath.append(.post(id))
        case nil:
            break
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
