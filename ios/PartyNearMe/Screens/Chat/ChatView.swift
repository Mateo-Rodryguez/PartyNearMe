import SwiftUI

/// A conversation, iMessage style: bubbles with the newest at the bottom, a
/// composer that grows, older messages as you scroll up. New messages arrive
/// live; a slow check also catches anything missed while offline.
struct ChatView: View {
    enum Start: Hashable {
        case conversation(String)
        /// Opens (or makes) the one-to-one chat with this person.
        case person(String)
    }

    @Environment(AppModel.self) private var app
    let start: Start
    let title: String

    @State private var conversationId: String?
    @State private var conversation: Conversation?
    /// Newest first, as the server sends them.
    @State private var messages: [ChatMessage] = []
    @State private var hasMore = false
    @State private var loadingOlder = false
    @State private var error: String?
    @State private var draft = ""
    @State private var sending = false
    @State private var reporting: (ReportTarget, String)?
    /// The first page has been asked for, so an empty chat can say so.
    @State private var hasLoaded = false
    @FocusState private var composing: Bool

    init(start: Start, title: String) {
        self.start = start
        self.title = title
        if case .conversation(let id) = start { _conversationId = State(initialValue: id) }
    }

    private var isGroup: Bool { conversation?.party != nil }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 3) {
                if hasMore {
                    ProgressView()
                        .padding(12)
                        .onAppear { Task { await loadOlder() } }
                }
                let ordered = Array(messages.reversed())
                ForEach(Array(ordered.enumerated()), id: \.element.id) { index, message in
                    let previous = index > 0 ? ordered[index - 1] : nil
                    let mine = message.senderId == app.myId
                    if isGroup, !mine, previous?.senderId != message.senderId {
                        Text(name(of: message.senderId))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.appSecondaryText)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.leading, 14)
                            .padding(.top, 10)
                    }
                    Bubble(message: message, mine: mine, joined: previous?.senderId == message.senderId,
                           onReport: { reporting = (.message, message.id) })
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
        }
        .defaultScrollAnchor(.bottom)
        .scrollDismissesKeyboard(.interactively)
        .overlay {
            if messages.isEmpty {
                if let error {
                    ListMessage(text: error) { Task { await poll(first: true) } }
                } else if !hasLoaded {
                    ProgressView()
                } else {
                    ContentUnavailableView("Say hi", systemImage: "hand.wave", description: Text("Messages you send show up here."))
                }
            }
        }
        .safeAreaInset(edge: .bottom) { composer }
        .background(AppBackground())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let party = conversation?.party {
                    NavigationLink(value: Route.event(party.id)) {
                        PartyCover(url: party.coverUrl, title: party.title, showsTitle: false)
                            .frame(width: 32, height: 32)
                            .clipShape(Circle())
                    }
                    .accessibilityLabel("Open the party")
                } else if let other = conversation?.other {
                    NavigationLink(value: Route.user(other.id)) {
                        Avatar(url: other.avatarUrl, name: other.name, size: 32)
                    }
                    .accessibilityLabel("Open \(other.name)'s profile")
                }
            }
        }
        .task(id: conversationId) { await run() }
        .task(id: conversationId) { await listen() }
        .reportDialog($reporting, app: app)
    }

    private var composer: some View {
        let canSend = !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !sending && conversationId != nil
        return HStack(alignment: .bottom, spacing: 8) {
            TextField("Message…", text: $draft, axis: .vertical)
                .lineLimit(1...5)
                .textInputAutocapitalization(.sentences)
                .focused($composing)
                .tint(Color.appAccent)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color.appField))
                .onChange(of: draft) { _, new in if new.count > 4000 { draft = String(new.prefix(4000)) } }
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
            .accessibilityLabel("Send")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
    }

    private func name(of senderId: String) -> String {
        conversation?.members.first { $0.id == senderId }?.name ?? "Someone"
    }

    // MARK: Loading

    /// Finds the conversation, then checks for new messages every 30 seconds while open.
    private func run() async {
        if conversationId == nil, case .person(let userId) = start {
            do {
                let made = try await app.api.startConversation(with: userId)
                conversation = made
                conversationId = made.id
            } catch {
                self.error = error.userMessage
            }
            return // The id changed, so this task starts again with it.
        }
        guard let conversationId else { return }
        if conversation == nil { conversation = try? await app.api.conversation(conversationId) }
        await poll(first: true)
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(30))
            if Task.isCancelled { break }
            await poll(first: false)
        }
    }

    private func poll(first: Bool) async {
        guard let conversationId else { return }
        do {
            let page = try await app.api.messages(conversationId, before: nil)
            let newest = messages.first?.id
            merge(page.messages)
            if first { hasMore = page.hasMore }
            if first || messages.first?.id != newest { await markRead() }
            error = nil
        } catch is CancellationError {
        } catch {
            if first && messages.isEmpty { self.error = error.userMessage }
        }
        hasLoaded = true
    }

    private func listen() async {
        guard let conversationId else { return }
        for await message in app.live.messages(in: conversationId) {
            merge([message])
            if message.senderId != app.myId { await markRead() }
        }
    }

    private func loadOlder() async {
        guard let conversationId, hasMore, !loadingOlder, let oldest = messages.last else { return }
        loadingOlder = true
        if let page = try? await app.api.messages(conversationId, before: oldest.id) {
            merge(page.messages)
            hasMore = page.hasMore
        }
        loadingOlder = false
    }

    private func markRead() async {
        guard let conversationId else { return }
        try? await app.api.markRead(conversationId)
        await app.refreshBadges()
    }

    /// Adds messages not seen yet, skipping people you blocked, newest first.
    private func merge(_ fresh: [ChatMessage]) {
        let known = Set(messages.map(\.id))
        let hidden = Set(conversation?.hiddenSenderIds ?? [])
        let added = fresh.filter { !known.contains($0.id) && !hidden.contains($0.senderId) }
        guard !added.isEmpty else { return }
        withAnimation(.snappy) {
            messages = (messages + added).sorted { $0.order > $1.order }
        }
    }

    private func send() {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, let conversationId, !sending else { return }
        sending = true
        Task {
            do {
                let sent = try await app.api.send(conversationId, body: body)
                draft = ""
                merge([sent])
            } catch {
                app.show(error.userMessage)
            }
            sending = false
        }
    }
}

/// A message: gradient bubbles for yours on the right, grey ones on the left.
/// Hold someone else's to report it. A party invite opens the party.
private struct Bubble: View {
    let message: ChatMessage
    let mine: Bool
    /// The same person sent the one above, so the bubbles sit closer.
    let joined: Bool
    let onReport: () -> Void

    var body: some View {
        HStack {
            if mine { Spacer(minLength: 56) }
            content
                .contextMenu {
                    Button("Copy", systemImage: "doc.on.doc") { UIPasteboard.general.string = message.body }
                    if !mine {
                        Button("Report message", systemImage: "exclamationmark.bubble", role: .destructive, action: onReport)
                    }
                }
            if !mine { Spacer(minLength: 56) }
        }
        .padding(.top, joined ? 0 : 6)
    }

    @ViewBuilder private var content: some View {
        if let party = message.eventId {
            NavigationLink(value: Route.event(party)) { bubble }.buttonStyle(.plain)
        } else {
            bubble
        }
    }

    private var bubble: some View {
        let ink = mine ? Color.white : Color.appText
        return VStack(alignment: .leading, spacing: 4) {
            if message.eventId != nil {
                Label("PARTY INVITE", systemImage: "party.popper.fill").font(.caption2.weight(.heavy)).foregroundStyle(ink.opacity(0.8))
            }
            Text(message.body).font(.body).foregroundStyle(ink)
            if message.eventId != nil {
                Text("Tap to see the party").font(.caption).foregroundStyle(ink.opacity(0.8))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background {
            let shape = UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: mine ? 20 : 6,
                                               bottomTrailingRadius: mine ? 6 : 20, topTrailingRadius: 20, style: .continuous)
            if mine { shape.fill(Brand.gradient) } else { shape.fill(Color.appRaised) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(mine ? "You: \(message.body)" : message.body)
    }
}
