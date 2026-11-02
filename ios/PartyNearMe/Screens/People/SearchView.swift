import SwiftUI

/// Finds people by username or name, as you type.
struct SearchView: View {
    @Environment(AppModel.self) private var app
    @State private var query = ""
    @State private var results: [ListedPerson] = []
    @State private var searched = ""
    @State private var error: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(results) { person in
                    NavigationLink(value: Route.user(person.id)) {
                        PersonRow(person: person).padding(.horizontal, 20).padding(.vertical, 6).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .overlay {
            let text = query.trimmingCharacters(in: .whitespaces)
            if text.isEmpty {
                ContentUnavailableView("Find your people", systemImage: "magnifyingglass",
                                       description: Text("Search by username or name to follow friends, hosts and DJs."))
            } else if let error, results.isEmpty {
                ListMessage(text: error)
            } else if results.isEmpty && searched == text {
                ContentUnavailableView("No one found", systemImage: "person.fill.questionmark",
                                       description: Text("Nobody matches \"\(text)\". Check the spelling or try their name."))
            }
        }
        .background(AppBackground())
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search people")
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
        .navigationTitle("Search")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: query) {
            let text = query.trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty else {
                results = []
                return
            }
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            do {
                results = try await app.api.searchUsers(String(text.prefix(60)))
                error = nil
            } catch is CancellationError {
                return
            } catch {
                self.error = error.userMessage
            }
            searched = text
        }
    }
}

/// People you blocked, with a way to undo it.
struct BlockedView: View {
    @Environment(AppModel.self) private var app
    @State private var people: [ListedPerson]?
    @State private var error: String?

    var body: some View {
        List {
            ForEach(people ?? []) { person in
                HStack {
                    PersonRow(person: person)
                    Button("Unblock") { unblock(person) }
                        .buttonStyle(.bordered)
                        .tint(Color.appText)
                        .controlSize(.small)
                        .fixedSize()
                }
                .listRowBackground(Color.appField)
            }
        }
        .scrollContentBackground(.hidden)
        .overlay {
            if people == nil, let error {
                ListMessage(text: error) { Task { await load() } }
            } else if people == nil {
                ProgressView()
            } else if people?.isEmpty == true {
                ContentUnavailableView("No one blocked", systemImage: "hand.raised",
                                       description: Text("People you block can't see your posts or message you. They show up here so you can undo it."))
            }
        }
        .background(AppBackground())
        .navigationTitle("Blocked accounts")
        .navigationBarTitleDisplayMode(.inline)
        .task { if people == nil { await load() } }
    }

    private func load() async {
        do {
            people = try await app.api.blockedUsers()
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.userMessage
        }
    }

    private func unblock(_ person: ListedPerson) {
        Task {
            do {
                try await app.api.setBlocked(person.id, blocked: false)
                withAnimation { people?.removeAll { $0.id == person.id } }
                app.show("Unblocked \(person.name)")
            } catch {
                app.show(error.userMessage)
            }
        }
    }
}

/// What you saved: posts in a grid, parties as cards. Only you can see it.
struct SavedView: View {
    @Environment(AppModel.self) private var app
    @State private var showParties = false
    @State private var posts: Paged<Post>?
    @State private var events: [Event]?
    @State private var eventsError: String?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 3), count: 3)

    var body: some View {
        ScrollView {
            Picker("Show", selection: $showParties) {
                Text("Posts").tag(false)
                Text("Parties").tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
            if showParties {
                parties
            } else if let posts {
                LazyVGrid(columns: columns, spacing: 3) {
                    ForEach(posts.items) { post in
                        NavigationLink(value: Route.post(post.id)) { GridTile(post: post) }
                            .buttonStyle(.plain)
                            .onAppear { posts.onAppear(post, threshold: 6) }
                    }
                }
                if posts.loadedOnce && posts.items.isEmpty {
                    if let error = posts.error {
                        ListMessage(text: error) { Task { await posts.refresh() } }
                    } else {
                        ContentUnavailableView("No saved posts yet", systemImage: "bookmark",
                                               description: Text("Tap the bookmark under a post to keep it here. Only you can see what you save."))
                    }
                } else if !posts.loadedOnce {
                    ProgressView().padding(48)
                }
            }
        }
        .refreshable {
            if showParties { await loadEvents() } else { await posts?.refresh() }
        }
        .background(AppBackground())
        .navigationTitle("Saved")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard posts == nil else { return }
            let api = app.api
            let loader = Paged<Post> { cursor in
                let page = try await api.savedPosts(cursor: cursor)
                return (page.posts, page.nextCursor)
            }
            posts = loader
            await loader.refresh()
        }
        .onChange(of: showParties) { _, show in
            if show && events == nil { Task { await loadEvents() } }
        }
    }

    @ViewBuilder private var parties: some View {
        if let events {
            if events.isEmpty {
                ContentUnavailableView("No saved parties yet", systemImage: "bookmark",
                                       description: Text("Tap the bookmark on a party to keep it here for later."))
            } else {
                LazyVStack(spacing: 20) {
                    ForEach(events) { event in
                        NavigationLink(value: Route.event(event.id)) { EventCard(event: event) }.buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        } else if let eventsError {
            ListMessage(text: eventsError) { Task { await loadEvents() } }
        } else {
            ProgressView().padding(48)
        }
    }

    private func loadEvents() async {
        do {
            events = try await app.api.savedEvents()
            eventsError = nil
        } catch is CancellationError {
        } catch {
            eventsError = error.userMessage
        }
    }
}
