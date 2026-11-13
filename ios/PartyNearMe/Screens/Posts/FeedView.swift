import SwiftUI

/// The posts on Home, kept while other screens open on top so the list keeps its place.
@MainActor
@Observable
final class FeedModel {
    let paged: Paged<Post>
    /// The ranked list on screen, sent with impressions so the ranking can be measured; nil for the saved copy.
    private(set) var serveId: String?
    @ObservationIgnored private var asked = false
    @ObservationIgnored private var here: (Double, Double)?

    init(app: AppModel) {
        weak var model: FeedModel?
        paged = Paged { cursor in
            guard let feed = model else { return ([], nil) }
            return try await feed.page(app: app, cursor: cursor)
        }
        model = self
        // The server can take a while to wake; the last feed shows meanwhile.
        if let cache = app.feedCache { paged.seed(cache.load(userId: app.myId)) }
    }

    private func page(app: AppModel, cursor: String?) async throws -> ([Post], String?) {
        if !asked {
            asked = true
            if let coordinate = await app.location.current() { here = (coordinate.latitude, coordinate.longitude) }
        }
        // A nil page means the ranked list behind the cursor is gone; pull to refresh starts a new one.
        guard let page = try await app.api.feed(lat: here?.0, lng: here?.1, cursor: cursor) else { return ([], nil) }
        if cursor == nil {
            app.feedCache?.save(userId: app.myId, posts: page.posts)
            serveId = page.serveId
        }
        return (page.posts, page.nextCursor)
    }
}

/// Home: the ranked feed of photos from parties, pull to refresh, endless scrolling.
struct FeedView: View {
    @Environment(AppModel.self) private var app
    @Bindable var paged: Paged<Post>
    /// The ranked list the posts came from, for measuring the ranking.
    var serveId: String?
    /// Parties near the user, for the row at the top.
    var parties: [Event] = []
    /// Opens the new party form.
    var onStartParty: () -> Void = {}

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                HStack {
                    Wordmark(size: 26)
                    Spacer()
                    NavigationLink(value: Route.search) {
                        Image(systemName: "magnifyingglass")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(Color.appText)
                            .frame(width: 42, height: 42)
                    }
                    .accessibilityLabel("Search people")
                    NavigationLink(value: Route.notifications) {
                        Image(systemName: "bell")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(Color.appText)
                            .frame(width: 42, height: 42)
                            .overlay(alignment: .topTrailing) {
                                if app.unreadNotifications > 0 {
                                    Text(app.unreadNotifications > 9 ? "9+" : String(app.unreadNotifications))
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 5)
                                        .frame(minWidth: 18, minHeight: 18)
                                        .background(Capsule().fill(Brand.gradient))
                                        .offset(x: 2, y: 2)
                                }
                            }
                    }
                    .accessibilityLabel(app.unreadNotifications > 0 ? "Notifications, \(app.unreadNotifications) new" : "Notifications")
                }
                .padding(.horizontal, 20)
                .frame(height: 52)
                if app.askRecommend {
                    RecommendCard { withAnimation(.snappy) { app.askRecommend = false } }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
                PartyRail(parties: parties, onStart: onStartParty)
                if paged.items.isEmpty && !paged.loadedOnce {
                    ForEach(0..<2, id: \.self) { _ in PostSkeleton() }
                }
                ForEach($paged.items) { $post in
                    PostCard(post: $post, onDeleted: { paged.remove { $0.id == post.id } }, onNotInterested: {
                        withAnimation { paged.remove { $0.id == post.id } }
                        app.interactions.notInterested(post.id)
                        app.show("Got it. You'll see fewer posts like this.")
                    })
                    .modifier(TrackView(postId: post.id, serveId: serveId,
                                        position: paged.items.firstIndex { $0.id == post.id } ?? 0))
                    .onAppear {
                        paged.onAppear(post)
                        prefetch(after: post)
                    }
                }
                if let error = paged.error, !paged.items.isEmpty {
                    ListMessage(text: error) { Task { await paged.retry() } }
                }
                if paged.loading && !paged.items.isEmpty {
                    ProgressView().padding(24)
                }
            }
        }
        .overlay { emptyState }
        .refreshable { await paged.refresh() }
        .background(AppBackground())
        // Home draws its own header, the wordmark, as on Android; pushed screens keep the bar.
        .toolbar(.hidden, for: .navigationBar)
        .task { if !paged.loadedOnce && !paged.loading { await paged.refresh() } }
    }

    @ViewBuilder private var emptyState: some View {
        if paged.items.isEmpty {
            if !paged.loadedOnce {
                EmptyView()
            } else if let error = paged.error {
                ListMessage(text: error) { Task { await paged.refresh() } }
            } else {
                ContentUnavailableView {
                    Label("Your feed is warming up", systemImage: "sparkles")
                } description: {
                    Text("Post the first photo, or follow people to see their nights out here.")
                }
            }
        }
    }

    /// Starts downloading the photos of the next few posts, so scrolling doesn't wait.
    private func prefetch(after post: Post) {
        let items = paged.items
        guard let index = items.firstIndex(where: { $0.id == post.id }) else { return }
        let next = items.dropFirst(index + 1).prefix(3)
        ImageCache.shared.prefetch(next.flatMap { $0.media.compactMap { $0.url(minWidth: 1080) } })
    }
}

/// "Happening near you": round party covers, story style, with "Start one" first.
private struct PartyRail: View {
    let parties: [Event]
    let onStart: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("HAPPENING NEAR YOU")
                .font(.overline)
                .tracking(1)
                .foregroundStyle(Color.appSecondaryText)
                .padding(.horizontal, 20)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 6) {
                    Button(action: onStart) {
                        RailItem(label: "Start one", ring: false) {
                            ZStack {
                                Color.appRaised
                                Image(systemName: "plus").font(.title2.weight(.semibold)).foregroundStyle(Color.appText)
                            }
                        }
                    }
                    .buttonStyle(PressStyle())
                    ForEach(parties) { event in
                        NavigationLink(value: Route.event(event.id)) {
                            RailItem(label: event.title, ring: true) {
                                PartyCover(url: event.coverUrl, title: event.title, showsTitle: false)
                            }
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .padding(.horizontal, 14)
            }
        }
        .padding(.bottom, 16)
    }
}

private struct RailItem<Picture: View>: View {
    let label: String
    let ring: Bool
    @ViewBuilder let picture: () -> Picture

    var body: some View {
        VStack(spacing: 6) {
            picture()
                .frame(width: 62, height: 62)
                .clipShape(Circle())
                .padding(4)
                .overlay { if ring { Circle().strokeBorder(Brand.sunset, lineWidth: 2.5) } }
            Text(label)
                .font(.caption.weight(.medium))
                .foregroundStyle(Color.appText)
                .lineLimit(1)
                .frame(width: 74)
        }
        .frame(width: 78)
    }
}

/// Records that a post was on screen, and for how long, for ranking.
struct TrackView: ViewModifier {
    @Environment(AppModel.self) private var app
    let postId: String
    var serveId: String?
    var position: Int?
    @State private var shownAt: Date?

    func body(content: Content) -> some View {
        content
            .onAppear {
                app.interactions.impression(postId, surface: "feed", serveId: serveId, position: position)
                shownAt = Date()
            }
            .onDisappear {
                if let shownAt {
                    app.interactions.dwell(postId, milliseconds: Int(Date().timeIntervalSince(shownAt) * 1000),
                                           surface: "feed", serveId: serveId)
                }
                shownAt = nil
            }
    }
}
