import Foundation
import Observation

/// A list that loads page by page: `load` gets the cursor and returns items plus the next cursor.
@MainActor
@Observable
final class Paged<Item: Identifiable> {
    var items: [Item] = []
    private(set) var loading = false
    private(set) var loadedOnce = false
    private(set) var error: String?
    private(set) var hasMore = true

    @ObservationIgnored private var cursor: String?
    @ObservationIgnored private let load: (String?) async throws -> ([Item], String?)
    /// The items are a saved copy, not a loaded page: no more pages follow them,
    /// and the first real page replaces them.
    @ObservationIgnored private var seeded = false
    /// Bumped on refresh, so a page from before the refresh is thrown away.
    @ObservationIgnored private var generation = 0

    init(load: @escaping (String?) async throws -> ([Item], String?)) {
        self.load = load
    }

    /// Starts again from the top. Items stay on screen until the new first page arrives.
    func refresh() async {
        generation += 1
        cursor = nil
        hasMore = true
        await fetch(replacing: true)
    }

    /// Shows a saved copy (such as the last feed) until the first page loads. Only
    /// before anything has loaded, so it never covers fresher items.
    func seed(_ copy: [Item]) {
        guard !loadedOnce, items.isEmpty, !copy.isEmpty else { return }
        items = copy
        seeded = true
    }

    /// Loads the next page, unless one is already loading or there is none.
    func loadMore() async {
        guard !loading, hasMore, loadedOnce, !seeded, error == nil else { return }
        await fetch(replacing: false)
    }

    /// After an error at the end of the list.
    func retry() async {
        error = nil
        await fetch(replacing: !loadedOnce || seeded)
    }

    /// Call from a row's onAppear: loads more when it's within a few rows of the end.
    func onAppear(_ item: Item, threshold: Int = 5) {
        guard let index = items.firstIndex(where: { $0.id == item.id }), index >= items.count - threshold else { return }
        Task { await loadMore() }
    }

    func remove(where shouldRemove: (Item) -> Bool) { items.removeAll(where: shouldRemove) }

    func update(_ id: Item.ID, _ change: (inout Item) -> Void) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        change(&items[index])
    }

    private func fetch(replacing: Bool) async {
        let started = generation
        loading = true
        error = nil
        do {
            let (page, next) = try await load(cursor)
            guard started == generation else { return }
            items = replacing ? page : items + page.filter { new in !items.contains { $0.id == new.id } }
            if replacing { seeded = false }
            cursor = next
            hasMore = next != nil
        } catch is CancellationError {
        } catch let error as URLError where error.code == .cancelled {
        } catch {
            if started == generation { self.error = error.userMessage }
        }
        if started == generation {
            loading = false
            loadedOnce = true
        }
    }
}
