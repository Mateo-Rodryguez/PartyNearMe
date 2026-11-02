import SwiftUI

/// Screens that open on top of a tab, pushed onto its navigation stack.
enum Route: Hashable {
    case post(String)
    case comments(postId: String)
    case user(String)
    case people(userId: String, followers: Bool, title: String)
    case event(String)
    case guests(eventId: String, title: String)
    /// A new post at a party, from its page.
    case newPost(eventId: String, title: String)
    case invite(eventId: String, title: String)
    case chat(id: String, title: String)
    /// The one-to-one chat with someone, made if it's new.
    case chatWith(userId: String, title: String)
    case notifications
}

/// Links that open a screen: partynearme://party/<id> and partynearme://post/<id>,
/// which the shared web pages link to, and those pages' own addresses (…/e/<id>, …/p/<id>).
enum DeepLink {
    enum Target: Equatable {
        case party(String)
        case post(String)
    }

    static func parse(_ url: URL) -> Target? {
        let parts: [String]
        switch url.scheme?.lowercased() {
        case AppConfig.appScheme:
            parts = [url.host ?? ""] + url.pathComponents.filter { $0 != "/" }
        case "https":
            parts = url.pathComponents.filter { $0 != "/" }
        default:
            return nil
        }
        guard parts.count == 2, UUID(uuidString: parts[1]) != nil else { return nil }
        switch parts[0] {
        case "party", "e": return .party(parts[1])
        case "post", "p": return .post(parts[1])
        default: return nil
        }
    }
}

extension View {
    /// Lets every screen in a tab push any route.
    func routeDestinations() -> some View {
        navigationDestination(for: Route.self) { route in
            switch route {
            case .post(let id): PostDetailView(id: id)
            case .comments(let postId): CommentsView(postId: postId)
            case .user(let id): ProfileView(userId: id)
            case let .people(userId, followers, title): PeopleListView(userId: userId, followers: followers, title: title)
            case .event(let id): EventView(id: id)
            case let .guests(eventId, title): GuestListView(eventId: eventId, title: title)
            case let .newPost(eventId, title): NewPostView(party: PartyRef(id: eventId, title: title))
            case let .invite(eventId, title): InviteView(eventId: eventId, title: title)
            case let .chat(id, title): ChatView(start: .conversation(id), title: title)
            case let .chatWith(userId, title): ChatView(start: .person(userId), title: title)
            case .notifications: NotificationsView()
            }
        }
    }
}

/// A short note in place of a list, such as an error, with a way to try again.
struct ListMessage: View {
    let text: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 16) {
            Text(text).multilineTextAlignment(.center).foregroundStyle(Color.appSecondaryText)
            if let retry {
                SecondaryButton("Try again", systemImage: "arrow.clockwise", fullWidth: false, action: retry)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(32)
    }
}

/// The reasons people pick from when reporting; the server stores the text as given.
let reportReasons = [
    "Spam",
    "Nudity or sexual content",
    "Harassment or hate",
    "Violence or dangerous behaviour",
    "Illegal (e.g. drugs)",
    "Something else",
]

extension View {
    /// Asks why something is being reported, as a native action sheet, and sends the report.
    func reportDialog(_ target: Binding<(ReportTarget, String)?>, app: AppModel) -> some View {
        confirmationDialog(
            "Why are you reporting this?",
            isPresented: Binding(get: { target.wrappedValue != nil }, set: { if !$0 { target.wrappedValue = nil } }),
            titleVisibility: .visible,
            presenting: target.wrappedValue
        ) { reported in
            ForEach(reportReasons, id: \.self) { reason in
                Button(reason) {
                    Task {
                        do {
                            try await app.api.report(reported.0, id: reported.1, reason: reason)
                            app.show("Thanks, we'll review it")
                        } catch {
                            app.show(error.userMessage)
                        }
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("We review every report.")
        }
    }
}
