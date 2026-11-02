import SwiftUI

/// Reported posts, parties, people, messages and comments, for moderators.
/// Each action closes every open report on that thing.
struct ModerationView: View {
    @Environment(AppModel.self) private var app
    @State private var items: [ReportedItem]?
    @State private var error: String?
    @State private var confirming: (ReportedItem, ModerationAction, String)?
    @State private var note = ""

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                ForEach(items ?? []) { item in
                    ReportCard(item: item) { action, label in
                        note = ""
                        confirming = (item, action, label)
                    }
                }
            }
            .padding(16)
        }
        .overlay {
            if items == nil, let error {
                ListMessage(text: error) { Task { await load() } }
            } else if items == nil {
                ProgressView()
            } else if items?.isEmpty == true {
                ContentUnavailableView("Nothing to review", systemImage: "checkmark.shield",
                                       description: Text("New reports show up here."))
            }
        }
        .refreshable { await load() }
        .background(AppBackground())
        .navigationTitle("Reports to review")
        .navigationBarTitleDisplayMode(.inline)
        .task { if items == nil { await load() } }
        .alert(confirming?.2 ?? "", isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } })) {
            TextField("Note for the log (optional)", text: $note)
            Button("Cancel", role: .cancel) {}
            Button(confirming?.2 ?? "Confirm", role: confirming?.1 == .deleteAccount ? .destructive : nil) {
                if let confirming { act(confirming.0, confirming.1) }
            }
        } message: {
            if confirming?.1 == .deleteAccount {
                Text("This deletes the account and everything they posted. It can't be undone.")
            }
        }
    }

    static func actions(for type: String) -> [(action: ModerationAction, label: String)] {
        let specific: [(action: ModerationAction, label: String)]
        switch type {
        case "post": specific = [(.remove, "Remove post"), (.restore, "Put back")]
        case "event": specific = [(.remove, "Remove party"), (.restore, "Put back")]
        case "user": specific = [(.removePicture, "Remove picture"), (.deleteAccount, "Delete account")]
        case "message": specific = [(.remove, "Delete message")]
        case "comment": specific = [(.remove, "Remove comment"), (.restore, "Put back")]
        default: specific = []
        }
        return specific + [(.dismiss, "Nothing wrong")]
    }

    private func load() async {
        do {
            items = try await app.api.moderationQueue()
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.userMessage
        }
    }

    private func act(_ item: ReportedItem, _ action: ModerationAction) {
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                try await app.api.moderate(item.targetType, id: item.targetId, action: action, note: text.isEmpty ? nil : String(text.prefix(500)))
                withAnimation { items?.removeAll { $0.id == item.id } }
                app.show("Done")
            } catch {
                app.show(error.userMessage)
            }
        }
    }
}

private struct ReportCard: View {
    let item: ReportedItem
    let onAction: (ModerationAction, String) -> Void

    private var kind: String {
        switch item.targetType {
        case "post": return "Post"
        case "event": return "Party"
        case "user": return "Person"
        case "message": return "Message"
        case "comment": return "Comment"
        default: return item.targetType.capitalized
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(kind.uppercased()).font(.overline).tracking(1).foregroundStyle(Color.appAccent)
                Spacer()
                Text("\(item.reportCount) report\(item.reportCount == 1 ? "" : "s") · \(Formatting.timeAgo(item.firstReportedAt))")
                    .font(.caption).foregroundStyle(Color.appSecondaryText)
            }
            if let preview = item.preview {
                HStack(alignment: .top, spacing: 12) {
                    if let image = preview.imageUrl.flatMap({ URL(string: $0) }) {
                        RemoteImage(url: image)
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(preview.title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.appText)
                        if let body = preview.body, !body.isEmpty {
                            Text(body).font(.subheadline).foregroundStyle(Color.appText).lineLimit(4)
                        }
                        if let status = preview.status {
                            Text("Status: \(status)").font(.caption).foregroundStyle(Color.appSecondaryText)
                        }
                    }
                }
                if let userId = preview.userId {
                    NavigationLink("View person", value: Route.user(userId)).font(.footnote.weight(.semibold))
                }
            } else {
                Text("This was deleted after it was reported.").font(.subheadline).foregroundStyle(Color.appSecondaryText)
            }
            Text("Reasons: " + item.reasons.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }.joined(separator: " · "))
                .font(.caption).foregroundStyle(Color.appSecondaryText)
            FlowLayout(spacing: 8) {
                ForEach(ModerationView.actions(for: item.targetType), id: \.label) { action, label in
                    Button(label) { onAction(action, label) }
                        .buttonStyle(.bordered)
                        .tint(action == .dismiss ? Color.appText : Color.appError)
                        .controlSize(.small)
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.appField))
    }
}
