import SwiftUI

/// Likes, comments, tags, follows, RSVPs, requests and reminders, new ones first.
/// Opening the list clears the bell's badge.
struct NotificationsView: View {
    @Environment(AppModel.self) private var app
    @State private var items: [AppNotification]?
    @State private var error: String?

    var body: some View {
        ScrollView {
            if let items {
                let fresh = items.filter(\.unread), earlier = items.filter { !$0.unread }
                LazyVStack(alignment: .leading, spacing: 0) {
                    if !fresh.isEmpty {
                        header("New")
                        ForEach(fresh) { NotificationRow(notification: $0) }
                    }
                    if !earlier.isEmpty {
                        header("Earlier")
                        ForEach(earlier) { NotificationRow(notification: $0) }
                    }
                }
                .padding(.bottom, 24)
            }
        }
        .overlay {
            if items == nil, let error {
                ListMessage(text: error) { Task { await load() } }
            } else if items == nil {
                ProgressView()
            } else if items?.isEmpty == true {
                ContentUnavailableView {
                    Label("Nothing yet", systemImage: "bell")
                } description: {
                    Text("When people like or comment on your photos, follow you or say they're going to your parties, you'll see it here.")
                }
            }
        }
        .refreshable { await load() }
        .background(AppBackground())
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .task { if items == nil { await load() } }
    }

    private func header(_ text: String) -> some View {
        Text(text).font(.headline).foregroundStyle(Color.appText).padding(.horizontal, 20).padding(.top, 14).padding(.bottom, 6)
    }

    private func load() async {
        do {
            let page = try await app.api.notifications()
            items = page.notifications.filter { AppNotification.known.contains($0.type) }
            error = nil
            if page.unreadCount > 0 { try? await app.api.markNotificationsSeen() }
            app.unreadNotifications = 0
        } catch is CancellationError {
        } catch {
            self.error = error.userMessage
        }
    }
}

private struct NotificationRow: View {
    let notification: AppNotification

    var body: some View {
        Group {
            if let route {
                NavigationLink(value: route) { row }.buttonStyle(.plain)
            } else {
                row
            }
        }
    }

    private var route: Route? {
        let n = notification
        switch n.type {
        case "like", "tag": return n.postId.map { .post($0) }
        case "comment": return n.postId.map { .comments(postId: $0) }
        case "follow": return n.actor.map { .user($0.id) }
        case "request": return n.eventId.map { .guests(eventId: $0, title: n.eventTitle ?? "Your party") }
        default: return n.eventId.map { .event($0) }
        }
    }

    private var row: some View {
        HStack(spacing: 12) {
            if let actor = notification.actor {
                Avatar(url: actor.avatarUrl, name: actor.name, size: 48, ring: notification.unread)
            } else {
                PartyCover(url: notification.eventCoverUrl, title: notification.eventTitle ?? notification.id, showsTitle: false)
                    .frame(width: 48, height: 48)
                    .clipShape(Circle())
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(Self.text(for: notification)).font(.subheadline).foregroundStyle(Color.appText).lineLimit(3)
                Text(Formatting.timeAgo(notification.createdAt)).font(.caption).foregroundStyle(Color.appSecondaryText)
            }
            Spacer(minLength: 8)
            if let thumbnail = notification.postThumbnailUrl.flatMap({ URL(string: $0) }) {
                RemoteImage(url: thumbnail)
                    .frame(width: 48, height: 48)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else if notification.type == "rsvp" || notification.type == "request" {
                PartyCover(url: notification.eventCoverUrl, title: notification.eventTitle ?? notification.id, showsTitle: false)
                    .frame(width: 48, height: 48)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(notification.unread ? Color.appAccent.opacity(0.08) : .clear)
        .contentShape(Rectangle())
    }

    /// "Sam liked your photo." with the names in bold.
    static func text(for n: AppNotification) -> AttributedString {
        func bold(_ s: String) -> AttributedString {
            var a = AttributedString(s)
            a.inlinePresentationIntent = .stronglyEmphasized
            return a
        }
        let who = bold(n.actor?.name ?? "Someone")
        let party = bold(n.eventTitle ?? "your party")
        switch n.type {
        case "like": return who + AttributedString(" liked your photo.")
        case "comment": return who + AttributedString(" commented: \(n.commentText ?? "")")
        case "tag": return who + AttributedString(" tagged you in a photo.")
        case "follow": return who + AttributedString(" started following you.")
        case "request": return who + AttributedString(" asked to come to ") + party + AttributedString(".")
        case "rsvp": return who + AttributedString(" is going to ") + party + AttributedString(".")
        default: return party + AttributedString(" is coming up soon. Get ready!")
        }
    }
}
