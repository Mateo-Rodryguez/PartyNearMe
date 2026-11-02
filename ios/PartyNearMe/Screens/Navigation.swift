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
