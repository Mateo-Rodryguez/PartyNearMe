import SwiftUI

/// The posts on Home, kept while other screens open on top so the list keeps its place.
@MainActor
@Observable
final class FeedModel {
    let paged: Paged<Post>
    @ObservationIgnored private var asked = false
    @ObservationIgnored private var here: (Double, Double)?

    init(app: AppModel) {
        weak var model: FeedModel?
        paged = Paged { cursor in
            guard let feed = model else { return ([], nil) }
            return try await feed.page(app: app, cursor: cursor)
        }
        model = self
    }

    private func page(app: AppModel, cursor: String?) async throws -> ([Post], String?) {
        if !asked {
            asked = true
            if let coordinate = await app.location.current() { here = (coordinate.latitude, coordinate.longitude) }
        }
        // A nil page means the ranked list behind the cursor is gone; pull to refresh starts a new one.
        guard let page = try await app.api.feed(lat: here?.0, lng: here?.1, cursor: cursor) else { return ([], nil) }
        return (page.posts, page.nextCursor)
    }
}

/// Home: the ranked feed of photos from parties, pull to refresh, endless scrolling.
struct FeedView: View {
    @Environment(AppModel.self) private var app
    @Bindable var paged: Paged<Post>

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                HStack {
                    Wordmark(size: 26)
                    Spacer()
                }
                .padding(.horizontal, 20)
                .frame(height: 52)
                ForEach($paged.items) { $post in
                    PostCard(post: $post, onDeleted: { paged.remove { $0.id == post.id } }, onNotInterested: {
                        withAnimation { paged.remove { $0.id == post.id } }
                        app.interactions.notInterested(post.id)
                        app.show("Got it. You'll see fewer posts like this.")
                    })
                    .modifier(TrackView(postId: post.id))
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
                ProgressView()
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

/// Records that a post was on screen, and for how long, for ranking.
struct TrackView: ViewModifier {
    @Environment(AppModel.self) private var app
    let postId: String
    @State private var shownAt: Date?

    func body(content: Content) -> some View {
        content
            .onAppear {
                app.interactions.impression(postId)
                shownAt = Date()
            }
            .onDisappear {
                if let shownAt {
                    app.interactions.dwell(postId, milliseconds: Int(Date().timeIntervalSince(shownAt) * 1000))
                }
                shownAt = nil
            }
    }
}
