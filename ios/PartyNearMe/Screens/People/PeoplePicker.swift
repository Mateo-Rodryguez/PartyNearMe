import SwiftUI

/// Picks people: the ones you follow first, or anyone by searching. Used to
/// invite people to a party.
struct PeoplePicker: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let title: String
    let button: String
    var max = 20
    /// Sends to the picked people; returns true to close the picker.
    let onDone: ([ListedPerson]) async -> Bool

    @State private var query = ""
    @State private var following: [ListedPerson] = []
    @State private var results: [ListedPerson] = []
    @State private var loaded = false
    @State private var picked: [ListedPerson] = []
    @State private var busy = false

    init(title: String, button: String, max: Int = 20, onDone: @escaping ([ListedPerson]) async -> Bool) {
        self.title = title
        self.button = button
        self.max = max
        self.onDone = onDone
    }

    private var shown: [ListedPerson] { query.trimmingCharacters(in: .whitespaces).isEmpty ? following : results }

    var body: some View {
        List {
            if !picked.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(picked) { person in
                            Button { toggle(person) } label: {
                                VStack(spacing: 4) {
                                    Avatar(url: person.avatarUrl, name: person.name, size: 52)
                                        .overlay(alignment: .topTrailing) {
                                            Image(systemName: "xmark.circle.fill")
                                                .symbolRenderingMode(.palette)
                                                .foregroundStyle(.white, Color.appSecondaryText)
                                        }
                                    Text(person.displayName ?? person.name).font(.caption2).lineLimit(1).frame(width: 60)
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Remove \(person.name)")
                        }
                    }
                    .padding(.vertical, 4)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            }
            Section(query.isEmpty ? "People you follow" : "Results") {
                ForEach(shown) { person in
                    Button { toggle(person) } label: { row(person) }
                        .buttonStyle(.plain)
                }
                if loaded && shown.isEmpty {
                    Text(query.isEmpty ? "Follow people to see them here, or search above." : "No one found.")
                        .foregroundStyle(Color.appSecondaryText)
                }
            }
            .listRowBackground(Color.appField)
        }
        .scrollContentBackground(.hidden)
        .background(AppBackground())
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search people")
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            PrimaryButton(picked.isEmpty ? button : "\(button) (\(picked.count))", busy: busy) {
                busy = true
                Task {
                    if await onDone(picked) { dismiss() }
                    busy = false
                }
            }
            .disabled(picked.isEmpty && !busy)
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 8)
            .background(.bar)
        }
        .task {
            if !loaded {
                following = (try? await app.api.following(app.myId, cursor: nil).users) ?? []
                loaded = true
            }
        }
        .task(id: query) {
            let text = query.trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty else { return results = [] }
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled, let found = try? await app.api.searchUsers(text) else { return }
            results = found.filter { $0.id != app.myId }
        }
    }

    private func row(_ person: ListedPerson) -> some View {
        let selected = picked.contains { $0.id == person.id }
        return HStack(spacing: 12) {
            Avatar(url: person.avatarUrl, name: person.name, size: 44)
            VStack(alignment: .leading, spacing: 1) {
                Text(person.displayName ?? person.name).font(.subheadline.weight(.semibold)).foregroundStyle(Color.appText)
                if let username = person.username {
                    Text("@\(username)").font(.caption).foregroundStyle(Color.appSecondaryText)
                }
            }
            .lineLimit(1)
            Spacer()
            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                .font(.title2)
                .foregroundStyle(selected ? Color.appAccent : Color.appDivider)
        }
        .contentShape(Rectangle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func toggle(_ person: ListedPerson) {
        if let index = picked.firstIndex(where: { $0.id == person.id }) {
            picked.remove(at: index)
        } else if picked.count < max {
            picked.append(person)
        } else {
            app.show("You can pick up to \(max) people at once")
        }
    }
}

/// Invites people to a party, as chat messages from you.
struct InviteView: View {
    @Environment(AppModel.self) private var app
    let eventId: String
    let title: String

    var body: some View {
        PeoplePicker(title: "Invite to \(title)", button: "Send invites") { people in
            do {
                let result = try await app.api.invite(eventId, userIds: people.map(\.id))
                app.show(Self.resultText(sent: result.sent, skipped: result.skipped))
                return result.sent > 0
            } catch {
                app.show(error.userMessage)
                return false
            }
        }
    }

    static func resultText(sent: Int, skipped: Int) -> String {
        let done = sent == 0 ? "No invites sent" : sent == 1 ? "Invite sent" : "\(sent) invites sent"
        switch skipped {
        case 0: return done
        case 1: return "\(done). 1 person can't get messages from you."
        default: return "\(done). \(skipped) people can't get messages from you."
        }
    }
}
