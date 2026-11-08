import SwiftUI

/// The Messages tab: one-to-one chats and party group chats, most recent first.
/// It refreshes whenever a message arrives in any of them.
struct InboxView: View {
    @Environment(AppModel.self) private var app
    @State private var paged: Paged<Conversation>?

    var body: some View {
        Group {
            if let paged {
                list(paged)
            } else {
                Color.clear
            }
        }
        .background(AppBackground())
        .navigationTitle("Messages")
        .onAppear {
            if paged == nil {
                let api = app.api
                paged = Paged { cursor in
                    let page = try await api.inbox(cursor: cursor)
                    return (page.conversations, page.nextCursor)
                }
            }
            Task { await paged?.refresh() }
        }
        .task {
            for await _ in app.live.messages(in: nil) {
                await paged?.refresh()
                await app.refreshBadges()
            }
        }
    }

    private func list(_ paged: Paged<Conversation>) -> some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(paged.items) { conversation in
                    NavigationLink(value: Route.chat(id: conversation.id, title: conversation.title)) {
                        InboxRow(conversation: conversation, myId: app.myId)
                    }
                    .buttonStyle(.plain)
                    .onAppear { paged.onAppear(conversation) }
                }
                if paged.loading && !paged.items.isEmpty { ProgressView().padding(24) }
            }
            .padding(.vertical, 4)
        }
        .refreshable { await paged.refresh() }
        .overlay {
            if paged.items.isEmpty {
                if !paged.loadedOnce {
                    ProgressView()
                } else if let error = paged.error {
                    ListMessage(text: error) { Task { await paged.refresh() } }
                } else {
                    ContentUnavailableView {
                        Label("No messages yet", systemImage: "bubble.left.and.bubble.right")
                    } description: {
                        Text("Open someone's profile and tap Message to plan your next night out.")
                    }
                }
            }
        }
    }
}

private struct InboxRow: View {
    let conversation: Conversation
    let myId: String

    private var unread: Bool { conversation.unreadCount > 0 }

    var body: some View {
        HStack(spacing: 14) {
            if let party = conversation.party {
                PartyCover(url: party.coverUrl, title: party.title, showsTitle: false)
                    .frame(width: 56, height: 56)
                    .clipShape(Circle())
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: "person.3.fill")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 22, height: 22)
                            .background(Circle().fill(Brand.gradient))
                            .overlay(Circle().strokeBorder(Color.appBackground, lineWidth: 2))
                    }
            } else {
                Avatar(url: conversation.other?.avatarUrl, name: conversation.title, size: 56, ring: unread)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(conversation.title)
                    .font(.subheadline.weight(unread ? .bold : .semibold))
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)
                if let last = conversation.lastMessage {
                    HStack(spacing: 4) {
                        Text(prefix(last.senderId) + last.body).lineLimit(1)
                        if let at = conversation.lastMessageAt {
                            Text("· \(Formatting.timeAgo(at))").layoutPriority(1)
                        }
                    }
                    .font(.subheadline.weight(unread ? .semibold : .regular))
                    .foregroundStyle(unread ? Color.appText : Color.appSecondaryText)
                }
            }
            Spacer(minLength: 8)
            if unread {
                Circle().fill(Brand.gradient).frame(width: 10, height: 10).accessibilityLabel("Unread")
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    /// "You: ", or the sender's first name in a party chat.
    private func prefix(_ senderId: String) -> String {
        if senderId == myId { return "You: " }
        guard conversation.party != nil else { return "" }
        let name = conversation.members.first { $0.id == senderId }?.name ?? "Someone"
        return (name.split(separator: " ").first.map(String.init) ?? name) + ": "
    }
}
