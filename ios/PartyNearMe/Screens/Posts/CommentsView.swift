import SwiftUI

/// A post's comments, newest first like TikTok, with the box to add one pinned at the bottom.
struct CommentsView: View {
    @Environment(AppModel.self) private var app
    let postId: String

    @State private var paged: Paged<Comment>?
    @State private var draft = ""
    @State private var sending = false
    @State private var deleting: Comment?
    @State private var reporting: (ReportTarget, String)?
    @FocusState private var typing: Bool

    var body: some View {
        Group {
            if let paged {
                list(paged)
            } else {
                Color.clear
            }
        }
        .background(AppBackground())
        .safeAreaInset(edge: .bottom) { composer }
        .navigationTitle("Comments")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Delete comment?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible, presenting: deleting) { comment in
            Button("Delete", role: .destructive) { delete(comment) }
        } message: { _ in
            Text("It disappears for everyone.")
        }
        .reportDialog($reporting, app: app)
        .task {
            if paged == nil {
                let api = app.api
                let id = postId
                let loader = Paged<Comment> { cursor in
                    let page = try await api.comments(id, cursor: cursor)
                    return (page.comments, page.nextCursor)
                }
                paged = loader
                await loader.refresh()
            }
        }
    }

    /// A plain stack, not a List: a List would turn each row's profile link into a whole-row link.
    private func list(_ paged: Paged<Comment>) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 4) {
                ForEach(paged.items) { comment in
                    CommentRow(comment: comment)
                        .contentShape(Rectangle())
                        .onAppear { paged.onAppear(comment) }
                        .contextMenu {
                            if comment.canDelete == true {
                                Button("Delete comment", systemImage: "trash", role: .destructive) { deleting = comment }
                            }
                            if comment.author.id != app.myId {
                                Button("Report comment", systemImage: "exclamationmark.bubble") { reporting = (.comment, comment.id) }
                            }
                        }
                }
                if let error = paged.error, !paged.items.isEmpty {
                    ListMessage(text: error) { Task { await paged.retry() } }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await paged.refresh() }
        .overlay {
            if paged.items.isEmpty {
                if !paged.loadedOnce {
                    ProgressView()
                } else if let error = paged.error {
                    ListMessage(text: error) { Task { await paged.refresh() } }
                } else {
                    ContentUnavailableView("No comments yet", systemImage: "bubble.right", description: Text("Start the conversation."))
                }
            }
        }
    }

    private var composer: some View {
        let canSend = !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !sending
        return HStack(alignment: .bottom, spacing: 8) {
            TextField("Add a comment…", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .focused($typing)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Capsule().fill(Color.appField))
                .onChange(of: draft) { _, new in if new.count > 1000 { draft = String(new.prefix(1000)) } }
            Button(action: send) {
                Image(systemName: "arrow.up")
                    .font(.body.weight(.bold))
                    .foregroundStyle(canSend ? Color.white : Color.appSecondaryText)
                    .frame(width: 44, height: 44)
                    .background {
                        if canSend { Circle().fill(Brand.gradient) } else { Circle().fill(Color.appRaised) }
                    }
            }
            .disabled(!canSend)
            .accessibilityLabel("Post comment")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
    }

    private func send() {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, let paged else { return }
        sending = true
        Task {
            do {
                let comment = try await app.api.addComment(postId, body: body)
                withAnimation { paged.items.insert(comment, at: 0) }
                draft = ""
            } catch {
                app.show(error.userMessage)
            }
            sending = false
        }
    }

    private func delete(_ comment: Comment) {
        Task {
            do {
                try await app.api.deleteComment(comment.id)
                withAnimation { paged?.remove { $0.id == comment.id } }
            } catch {
                app.show(error.userMessage)
            }
        }
    }
}

/// One comment: picture, name and words, with when it was posted.
private struct CommentRow: View {
    let comment: Comment

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            NavigationLink(value: Route.user(comment.author.id)) {
                Avatar(url: comment.author.avatarUrl, name: comment.author.name, size: 36)
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 3) {
                (Text(comment.author.name).fontWeight(.semibold) + Text("  ") + Text(comment.body))
                    .font(.subheadline)
                    .foregroundStyle(Color.appText)
                if comment.status == "hidden" {
                    Text("Only you can see this. It was hidden for breaking the community rules.")
                        .font(.caption)
                        .foregroundStyle(Color.appError)
                } else {
                    Text(Formatting.timeAgo(comment.createdAt)).font(.caption).foregroundStyle(Color.appSecondaryText)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
}
