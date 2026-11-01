import SwiftUI
import UIKit

/// Downloads and keeps photos: decoded images in memory, the files in a disk cache,
/// so scrolling back up or reopening the app doesn't download them again.
@MainActor
final class ImageCache {
    static let shared = ImageCache()

    private let memory = NSCache<NSURL, UIImage>()
    private var inFlight: [URL: Task<UIImage?, Never>] = [:]
    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.urlCache = URLCache(memoryCapacity: 20 * 1024 * 1024, diskCapacity: 300 * 1024 * 1024)
        config.requestCachePolicy = .returnCacheDataElseLoad
        return URLSession(configuration: config)
    }()

    init() {
        memory.totalCostLimit = 120 * 1024 * 1024
    }

    func cached(_ url: URL) -> UIImage? { memory.object(forKey: url as NSURL) }

    func image(for url: URL) async -> UIImage? {
        if let image = cached(url) { return image }
        if let running = inFlight[url] { return await running.value }
        let task = Task { [session] () -> UIImage? in
            guard let data = try? await session.data(from: url).0 else { return nil }
            // Decode off the main thread, at once, so the first frame doesn't stutter.
            return await Task.detached(priority: .userInitiated) { UIImage(data: data)?.preparingForDisplay() }.value
        }
        inFlight[url] = task
        let image = await task.value
        inFlight[url] = nil
        if let image {
            memory.setObject(image, forKey: url as NSURL, cost: Int(image.size.width * image.size.height * image.scale * image.scale * 4))
        }
        return image
    }

    /// Starts downloading photos the user is about to scroll to.
    func prefetch(_ urls: [URL]) {
        for url in urls where cached(url) == nil && inFlight[url] == nil {
            Task { _ = await image(for: url) }
        }
    }
}

/// A photo from the internet that fills its frame, with the BlurHash colours (or a
/// plain tile) while it loads, then a quick fade in.
struct RemoteImage: View {
    let url: URL?
    var blurHash: String?
    var contentMode: ContentMode = .fill

    @State private var image: UIImage?

    var body: some View {
        ZStack {
            Color.appRaised
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
                    .transition(.opacity)
            } else if let blurHash, let placeholder = BlurHash.image(blurHash) {
                Image(uiImage: placeholder).resizable()
            }
        }
        .clipped()
        .task(id: url) {
            guard let url else { return }
            if let cached = ImageCache.shared.cached(url) {
                image = cached
                return
            }
            let loaded = await ImageCache.shared.image(for: url)
            withAnimation(.easeOut(duration: 0.2)) { image = loaded }
        }
    }
}
