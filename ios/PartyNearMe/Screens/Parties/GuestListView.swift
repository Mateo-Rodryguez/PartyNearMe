import SwiftUI

/// A private party's guest list, for its host: people asking to join (let in or
/// decline) and people going (take them off).
struct GuestListView: View {
    @Environment(AppModel.self) private var app
    let eventId: String
    let title: String

    @State private var guests: GuestList?
    @State private var error: String?
    @State private var removing: Person?

    init(eventId: String, title: String) {
        self.eventId = eventId
        self.title = title
    }

    var body: some View {
        List {
            if let guests {
                Section {
                    if guests.requested.isEmpty {
                        Text("No one is waiting.").foregroundStyle(Color.appSecondaryText)
                    }
                    ForEach(guests.requested) { person in
                        GuestRow(person: person) {
                            Button("Decline") { decline(person) }
                                .buttonStyle(.bordered)
                                .tint(Color.appSecondaryText)
                            Button("Let in") { approve(person) }
                                .buttonStyle(.borderedProminent)
                                .tint(Color.appAccent)
                        }
                    }
                } header: {
                    Text("Asking to join · \(guests.requested.count)")
                }
                Section {
                    if guests.going.isEmpty {
                        Text("No one yet. People you let in show up here.").foregroundStyle(Color.appSecondaryText)
                    }
                    ForEach(guests.going) { person in
                        GuestRow(person: person) { EmptyView() }
                            .swipeActions {
                                Button("Remove", role: .destructive) { removing = person }
                            }
                    }
                } header: {
                    Text("Going · \(guests.going.count)")
                } footer: {
                    Text("Swipe left on someone to take them off the list.")
                }
            } else if let error {
                ListMessage(text: error) { Task { await load() } }
                    .listRowBackground(Color.clear)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(40).listRowBackground(Color.clear)
            }
        }
        .scrollContentBackground(.hidden)
        .background(AppBackground())
        .refreshable { await load() }
        .navigationTitle("Guest list")
        .navigationBarTitleDisplayMode(.inline)
        .task { if guests == nil { await load() } }
        .confirmationDialog("Take \(removing?.name ?? "them") off the list?",
                            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                            titleVisibility: .visible, presenting: removing) { person in
            Button("Remove", role: .destructive) { remove(person) }
        } message: { _ in
            Text("They won't see where \(title) is any more.")
        }
    }

    private func load() async {
        error = nil
        do {
            guests = try await app.api.guests(eventId)
        } catch is CancellationError {
        } catch {
            if guests == nil { self.error = error.userMessage } else { app.show(error.userMessage) }
        }
    }

    private func approve(_ person: Person) {
        let before = guests
        withAnimation {
            guests?.requested.removeAll { $0.id == person.id }
            guests?.going.insert(person, at: 0)
        }
        Task {
            do {
                try await app.api.approveGuest(eventId, userId: person.id)
            } catch {
                guests = before
                app.show(error.userMessage)
            }
        }
    }

    private func decline(_ person: Person) {
        let before = guests
        withAnimation { guests?.requested.removeAll { $0.id == person.id } }
        send(before) { try await app.api.removeGuest(eventId, userId: person.id) }
    }

    private func remove(_ person: Person) {
        let before = guests
        withAnimation { guests?.going.removeAll { $0.id == person.id } }
        send(before) { try await app.api.removeGuest(eventId, userId: person.id) }
    }

    /// Runs the change on the server, putting the list back if it fails.
    private func send(_ before: GuestList?, _ change: @escaping () async throws -> Void) {
        Task {
            do {
                try await change()
            } catch {
                guests = before
                app.show(error.userMessage)
            }
        }
    }
}

private struct GuestRow<Actions: View>: View {
    let person: Person
    @ViewBuilder let actions: () -> Actions

    var body: some View {
        HStack(spacing: 12) {
            Avatar(url: person.avatarUrl, name: person.name, size: 44)
            VStack(alignment: .leading, spacing: 1) {
                Text(person.displayName ?? person.name).font(.subheadline.weight(.semibold)).foregroundStyle(Color.appText)
                if let username = person.username {
                    Text("@\(username)").font(.caption).foregroundStyle(Color.appSecondaryText)
                }
            }
            .lineLimit(1)
            Spacer(minLength: 8)
            HStack(spacing: 8) { actions() }
                .font(.footnote.weight(.semibold))
                .controlSize(.small)
        }
        .listRowBackground(Color.appField)
        .padding(.vertical, 2)
    }
}
