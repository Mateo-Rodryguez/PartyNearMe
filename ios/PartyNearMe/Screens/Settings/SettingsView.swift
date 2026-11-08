import PhotosUI
import SwiftUI

/// Settings, iOS style: account, privacy, notifications, appearance, Nearby,
/// moderation for moderators, about, sign out and delete account.
struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Bindable private var prefs = AppPrefs.shared

    @State private var me: OwnProfile?
    @State private var account: AccountSettings?
    @State private var interests: [Interest] = []
    @State private var editing = false
    @State private var avatarItem: PhotosPickerItem?
    @State private var confirmSignOut = false
    @State private var confirmDelete = false
    @State private var deleting = false

    var body: some View {
        Form {
            accountSection
            privacySection
            notificationsSection
            Section("Appearance") {
                Picker("Theme", selection: $prefs.theme) {
                    ForEach(AppPrefs.Theme.allCases) { Text($0.label).tag($0) }
                }
                Toggle("Hide like counts", isOn: $prefs.hideLikeCounts)
            }
            .listRowBackground(Color.appField)
            Section {
                Picker("Search distance", selection: $prefs.radiusKm) {
                    ForEach(AppPrefs.radiusChoices, id: \.self) { Text(prefs.radiusLabel($0)).tag($0) }
                }
                Picker("Distances in", selection: $prefs.miles) {
                    Text("Kilometres").tag(false)
                    Text("Miles").tag(true)
                }
            } header: {
                Text("Nearby")
            } footer: {
                Text("How far Nearby looks for parties.")
            }
            .listRowBackground(Color.appField)
            if me?.isModerator == true {
                Section("Moderation") {
                    NavigationLink(value: Route.moderation) { Label("Reports to review", systemImage: "shield.lefthalf.filled") }
                }
                .listRowBackground(Color.appField)
            }
            Section("About") {
                Link(destination: AppConfig.privacyURL) { Label("Privacy policy", systemImage: "hand.raised") }
                Link(destination: AppConfig.termsURL) { Label("Terms", systemImage: "doc.text") }
                LabeledContent("Version", value: Self.version)
            }
            .listRowBackground(Color.appField)
            Section {
                Button("Sign out", role: .destructive) { confirmSignOut = true }
                Button(role: .destructive) { confirmDelete = true } label: {
                    HStack {
                        Text("Delete account")
                        if deleting { Spacer(); ProgressView() }
                    }
                }
                .disabled(deleting)
            } footer: {
                Text("Deleting your account permanently removes your profile, photos, parties and messages.")
            }
            .listRowBackground(Color.appField)
        }
        .tint(Color.appAccent)
        .scrollContentBackground(.hidden)
        .background(AppBackground())
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $editing) {
            if let me { EditProfileView(profile: me) { self.me = $0 } }
        }
        .onChange(of: avatarItem) { _, item in if let item { Task { await changeAvatar(item) } } }
        .confirmationDialog("Sign out?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await app.signOut() } }
        }
        .confirmationDialog("Delete your account?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete account", role: .destructive, action: deleteAccount)
        } message: {
            Text("Your profile, photos, parties and messages are deleted for good. This can't be undone.")
        }
    }

    // MARK: Sections

    private var accountSection: some View {
        Section("Account") {
            Button { editing = true } label: {
                HStack(spacing: 12) {
                    Avatar(url: me?.avatarUrl, name: me?.name ?? "?", size: 48)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(me?.name ?? "Your profile").font(.headline).foregroundStyle(Color.appText)
                        Text("Edit name, username and bio").font(.footnote).foregroundStyle(Color.appSecondaryText)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.appSecondaryText)
                }
            }
            .disabled(me == nil)
            PhotosPicker(selection: $avatarItem, matching: .images) {
                Label(me?.avatarUrl == nil ? "Add a profile picture" : "Change profile picture", systemImage: "camera")
            }
            if me?.avatarUrl != nil {
                Button("Remove profile picture", systemImage: "person.crop.circle.badge.minus", role: .destructive, action: removeAvatar)
            }
            Picker(selection: relationship) {
                Text("Don't show").tag(String?.none)
                ForEach(["taken", "talking", "single"], id: \.self) { status in
                    Label { Text(status.capitalized) } icon: { RelationshipHeart(status: status, size: 16) }
                        .tag(String?.some(status))
                }
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Relationship status")
                    Text("People see the heart, never the word").font(.caption).foregroundStyle(Color.appSecondaryText)
                }
            }
            .pickerStyle(.navigationLink)
            .disabled(me == nil)
            NavigationLink {
                InterestsPicker(all: interests, chosen: Set(me?.interestIds ?? [])) { me = $0 }
            } label: {
                LabeledContent("Interests", value: interestSummary)
            }
            .disabled(me == nil || interests.isEmpty)
        }
        .listRowBackground(Color.appField)
    }

    private var privacySection: some View {
        Section("Privacy and safety") {
            Picker("Who can message you", selection: accountBinding(\.messagesFrom)) {
                Text("Everyone").tag("everyone")
                Text("People you follow").tag("following")
            }
            .disabled(account == nil)
            NavigationLink(value: Route.blocked) { Text("Blocked accounts") }
        }
        .listRowBackground(Color.appField)
    }

    private var notificationsSection: some View {
        Section {
            Toggle("Messages", isOn: accountBinding(\.pushMessages))
            Toggle("Comments and tags", isOn: accountBinding(\.pushComments))
            Toggle("Guests for your parties", isOn: accountBinding(\.pushRsvps))
            Toggle("Party reminders", isOn: accountBinding(\.pushReminders))
        } header: {
            Text("Push notifications")
        } footer: {
            Text("Reminders come before parties you're going to, or if one is cancelled.")
        }
        .disabled(account == nil)
        .listRowBackground(Color.appField)
    }

    private var interestSummary: String {
        let names = interests.filter { (me?.interestIds ?? []).contains($0.id) }.map(\.name)
        return names.isEmpty ? "None" : names.count <= 2 ? names.joined(separator: ", ") : "\(names.count) picked"
    }

    static var version: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(version) (\(build))"
    }

    // MARK: Changes

    private var relationship: Binding<String?> {
        Binding(get: { me?.relationshipStatus }, set: { status in
            let before = me?.relationshipStatus
            me?.relationshipStatus = status
            Task {
                do {
                    me = try await app.api.setRelationshipStatus(status)
                } catch {
                    me?.relationshipStatus = before
                    app.show(error.userMessage)
                }
            }
        })
    }

    /// A setting that saves to the server when changed, and goes back if that fails.
    private func accountBinding<Value>(_ path: WritableKeyPath<AccountSettings, Value>) -> Binding<Value> {
        Binding(get: { (account ?? AccountSettings())[keyPath: path] }, set: { value in
            guard let before = account else { return }
            account?[keyPath: path] = value
            guard let changed = account else { return }
            Task {
                do {
                    account = try await app.api.updateSettings(changed)
                } catch {
                    account = before
                    app.show(error.userMessage)
                }
            }
        })
    }

    private func load() async {
        if let profile = try? await app.api.me() { me = profile }
        if let settings = try? await app.api.settings() { account = settings }
        if let kinds = try? await app.api.interests() { interests = kinds }
        if me == nil { app.show("Couldn't load your settings. Check your connection.") }
    }

    private func changeAvatar(_ item: PhotosPickerItem) async {
        defer { avatarItem = nil }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let photo = await Task.detached(operation: { PickedPhoto.make(from: data) }).value
        else { return app.show("That photo couldn't be opened") }
        do {
            try await app.api.setAvatar(uploadId: try await app.api.uploadPhoto(photo.jpeg))
            app.show("Your new picture shows once it's been checked")
        } catch {
            app.show(error.userMessage)
        }
    }

    private func removeAvatar() {
        let before = me?.avatarUrl
        me?.avatarUrl = nil
        Task {
            do {
                try await app.api.removeAvatar()
            } catch {
                me?.avatarUrl = before
                app.show(error.userMessage)
            }
        }
    }

    private func deleteAccount() {
        deleting = true
        Task {
            do {
                try await app.api.deleteAccount()
                app.pushToken = nil
                app.sessions.forget()
            } catch {
                app.show(error.userMessage)
            }
            deleting = false
        }
    }
}

/// Picks interests; the feed shows more of them.
private struct InterestsPicker: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let all: [Interest]
    let onSaved: (OwnProfile) -> Void
    @State private var picked: Set<Int>
    @State private var busy = false
    private let chosen: Set<Int>

    init(all: [Interest], chosen: Set<Int>, onSaved: @escaping (OwnProfile) -> Void) {
        self.all = all
        self.chosen = chosen
        self.onSaved = onSaved
        _picked = State(initialValue: chosen)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Pick what you're into. Your feed shows more of it.").secondaryStyle()
                FlowLayout(spacing: 8) {
                    ForEach(all) { interest in
                        ChoiceChip(title: interest.name, selected: picked.contains(interest.id)) {
                            if picked.contains(interest.id) { picked.remove(interest.id) } else { picked.insert(interest.id) }
                        }
                    }
                }
            }
            .padding(20)
        }
        .background(AppBackground())
        .navigationTitle("Interests")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            PrimaryButton("Save", busy: busy) {
                busy = true
                Task {
                    do {
                        onSaved(try await app.api.setInterests(all.map(\.id).filter(picked.contains)))
                        dismiss()
                    } catch {
                        app.show(error.userMessage)
                    }
                    busy = false
                }
            }
            .disabled(picked == chosen && !busy)
            .padding(.horizontal, 20)
            .padding(.vertical, 8)
            .background(.bar)
        }
    }
}
