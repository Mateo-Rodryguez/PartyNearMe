import Foundation

/// Collects what the user sees and does in the feed and sends it in batches,
/// so ranking can learn without a request per scroll. Each post's impression
/// is counted once per session. Same rules as the Android app.
@MainActor
final class InteractionLog {
    private let send: ([Interaction]) async throws -> Void
    private let batchSize: Int
    private var pending: [Interaction] = []
    private var seen: Set<String> = []

    static let minDwellMs = 800
    static let maxDwellMs = 10 * 60 * 1000

    init(batchSize: Int = 20, send: @escaping ([Interaction]) async throws -> Void) {
        self.batchSize = batchSize
        self.send = send
    }

    func impression(_ postId: String) {
        guard seen.insert(postId).inserted else { return }
        add(Interaction(kind: "impression", postId: postId))
    }

    /// Time spent on a post; very short glances are not worth sending.
    func dwell(_ postId: String, milliseconds: Int) {
        guard milliseconds >= Self.minDwellMs else { return }
        add(Interaction(kind: "dwell", postId: postId, dwellMs: min(milliseconds, Self.maxDwellMs)))
    }

    func open(_ postId: String) { add(Interaction(kind: "open", postId: postId)) }

    /// Someone shared a post or party: a strong signal for ranking.
    func share(postId: String? = nil, eventId: String? = nil) {
        add(Interaction(kind: "share", postId: postId, eventId: eventId))
    }

    func notInterested(_ postId: String) { add(Interaction(kind: "not_interested", postId: postId), flushNow: true) }

    /// What is waiting to be sent, for tests.
    var waiting: [Interaction] { pending }

    private func add(_ event: Interaction, flushNow: Bool = false) {
        pending.append(event)
        if flushNow || pending.count >= batchSize { flush() }
    }

    /// Sends what is waiting. Failures are dropped: this data is nice to have, never worth an error.
    func flush() {
        let batch = pending
        pending.removeAll()
        guard !batch.isEmpty else { return }
        Task { try? await send(batch) }
    }
}
