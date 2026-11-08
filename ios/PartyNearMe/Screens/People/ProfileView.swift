import PhotosUI
import SwiftUI

/// A profile: picture, name, heart, counts, bio and their posts in a grid.
/// Your own has Edit profile and a tap on the picture to change it; someone
/// else's has Follow, Report and Block.
struct ProfileView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let userId: String

    @State private var profile: PublicProfile?
    @State private var me: OwnProfile?
    @State private var posts: Paged<Post>?
    @State private var error: String?
    @State private var editing = false
    @State private var avatarItem: PhotosPickerItem?
    @State private var confirmBlock = false
    @State private var confirmSignOut = false
    @State private var reporting: (ReportTarget, String)?

    private var isMe: Bool { userId == app.myId }
    private var title: String { profile?.username.map { "@\($0)" } ?? "Profile" }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 3), count: 3)

    var body: some View {
        ScrollView {
            if let profile {
                header(profile)
                grid
            } else if let error {
                ListMessage(text: error) { Task { await load() } }
            } else {
                ProgressView().padding(64)
            }
        }
        .refreshable { await load() }
        .background(AppBackground())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .task { if profile == nil { await load() } }
        .sheet(isPresented: $editing) {
            if let me {
                EditProfileView(profile: me) { updated in
                    self.me = updated
                    profile?.username = updated.username
                    profile?.displayName = updated.displayName
                    profile?.bio = updated.bio
                }
            }
        }
        .onChange(of: avatarItem) { _, item in
            if let item { Task { await changeAvatar(item) } }
        }
        .confirmationDialog("Block \(title)?", isPresented: $confirmBlock, titleVisibility: .visible) {
            Button("Block", role: .destructive) { setBlocked(true) }
        } message: {
            Text("They won't be able to see your posts or message you, and you won't see theirs.")
        }
        .confirmationDialog("Sign out?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await app.signOut() } }
        }
        .reportDialog($reporting, app: app)
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                if isMe {
                    Link(destination: AppConfig.termsURL) { Label("Terms", systemImage: "doc.text") }
                    Link(destination: AppConfig.privacyURL) { Label("Privacy policy", systemImage: "hand.raised") }
                    Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { confirmSignOut = true }
                } else {
                    Button("Report", systemImage: "exclamationmark.bubble") { reporting = (.user, userId) }
                    if profile?.isBlocked == true {
                        Button("Unblock", systemImage: "hand.raised.slash") { setBlocked(false) }
                    } else {
                        Button("Block", systemImage: "hand.raised", role: .destructive) { confirmBlock = true }
                    }
                }
            } label: {
                Image(systemName: isMe ? "gearshape" : "ellipsis.circle")
            }
            .accessibilityLabel(isMe ? "Settings" : "More")
        }
    }

    private func header(_ profile: PublicProfile) -> some View {
        VStack(spacing: 12) {
            avatar(profile)
            HStack(spacing: 8) {
                Text(profile.displayName ?? profile.username ?? "Someone").headingStyle(.headline2)
                RelationshipHeart(status: profile.relationshipStatus, size: 20)
            }
            HStack(spacing: 0) {
                stat(profile.parties ?? 0, "Parties", route: nil)
                Divider().frame(height: 28)
                stat(profile.followers, "Followers", route: .people(userId: userId, followers: true, title: title))
                Divider().frame(height: 28)
                stat(profile.following, "Following", route: .people(userId: userId, followers: false, title: title))
            }
            if let bio = profile.bio, !bio.trimmingCharacters(in: .whitespaces).isEmpty {
                Text(bio).font(.subheadline).foregroundStyle(Color.appSecondaryText).multilineTextAlignment(.center)
            }
            actions(profile).padding(.top, 4)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 20)
    }

    @ViewBuilder private func avatar(_ profile: PublicProfile) -> some View {
        let picture = Avatar(url: profile.avatarUrl, name: profile.displayName ?? profile.username ?? "?", size: 104, ring: true)
        if isMe {
            PhotosPicker(selection: $avatarItem, matching: .images) {
                picture.overlay(alignment: .bottomTrailing) {
                    Image(systemName: "camera.fill")
                        .font(.caption)
                        .foregroundStyle(.white)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(Brand.gradient))
                        .overlay(Circle().strokeBorder(Color.appBackground, lineWidth: 2))
                }
            }
            .accessibilityLabel("Change profile picture")
        } else {
            picture
        }
    }

    @ViewBuilder private func stat(_ count: Int, _ label: String, route: Route?) -> some View {
        let content = VStack(spacing: 1) {
            Text(Formatting.compactCount(count)).font(.title3.weight(.bold)).foregroundStyle(Color.appText)
            Text(label).font(.caption).foregroundStyle(Color.appSecondaryText)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        if let route {
            NavigationLink(value: route) { content }.buttonStyle(.plain)
        } else {
            content
        }
    }

    @ViewBuilder private func actions(_ profile: PublicProfile) -> some View {
        if isMe {
            SecondaryButton("Edit profile", systemImage: "pencil") { editing = true }
                .disabled(me == nil)
        } else if profile.isBlocked == true {
            SecondaryButton("Unblock", systemImage: "hand.raised.slash") { setBlocked(false) }
        } else {
            HStack(spacing: 10) {
                if profile.isFollowing {
                    SecondaryButton("Following", systemImage: "checkmark", action: toggleFollow)
                } else {
                    PrimaryButton("Follow", systemImage: "plus", action: toggleFollow)
                }
                NavigationLink(value: Route.chatWith(userId: userId, title: profile.displayName ?? profile.username ?? "Chat")) {
                    Label("Message", systemImage: "paperplane")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.appText)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Capsule().fill(Color.appRaised))
                }
                .buttonStyle(PressStyle())
            }
        }
    }

    @ViewBuilder private var grid: some View {
        if let posts {
            if posts.loadedOnce && posts.items.isEmpty {
                if let error = posts.error {
                    ListMessage(text: error)
                } else {
                    ContentUnavailableView("No posts yet", systemImage: "camera", description: Text("Photos from nights out show up here."))
                }
            } else {
                LazyVGrid(columns: columns, spacing: 3) {
                    ForEach(posts.items) { post in
                        NavigationLink(value: Route.post(post.id)) {
                            GridTile(post: post)
                        }
                        .buttonStyle(.plain)
                        .onAppear { posts.onAppear(post, threshold: 6) }
                    }
                }
            }
        }
    }

    // MARK: Loading and actions

    private func load() async {
        error = nil
        let api = app.api
        let id = userId
        let loader = posts ?? Paged<Post> { cursor in
            let page = try await api.userPosts(id, cursor: cursor)
            return (page.posts, page.nextCursor)
        }
        posts = loader
        do {
            profile = try await app.api.user(userId)
            if isMe { me = try await app.api.me() }
        } catch {
            if profile == nil { self.error = error.userMessage }
        }
        await loader.refresh()
    }

    private func toggleFollow() {
        guard let before = profile else { return }
        let now = !before.isFollowing
        profile?.isFollowing = now
        profile?.followers = max(0, before.followers + (now ? 1 : -1))
        Task {
            do { try await app.api.setFollowing(userId, following: now) } catch {
                profile = before
                app.show(error.userMessage)
            }
        }
    }

    private func setBlocked(_ blocked: Bool) {
        Task {
            do {
                try await app.api.setBlocked(userId, blocked: blocked)
                profile?.isBlocked = blocked
                if blocked { profile?.isFollowing = false }
                app.show(blocked ? "Blocked" : "Unblocked")
                if blocked { dismiss() }
            } catch {
                app.show(error.userMessage)
            }
        }
    }

    private func changeAvatar(_ item: PhotosPickerItem) async {
        defer { avatarItem = nil }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let photo = await Task.detached(operation: { PickedPhoto.make(from: data) }).value
        else { return app.show("That photo couldn't be opened") }
        do {
            try await app.api.setAvatar(uploadId: try await app.api.uploadPhoto(photo.jpeg))
            app.show("Your new picture shows once it's been checked")
            try? await Task.sleep(for: .seconds(5))
            profile = try await app.api.user(userId)
        } catch {
            app.show(error.userMessage)
        }
    }
}

/// One square of a profile's photo grid.
struct GridTile: View {
    let post: Post

    var body: some View {
        Color.appRaised
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                if let media = post.media.first, post.isVisible {
                    RemoteImage(url: media.url(minWidth: 320), blurHash: media.blurhash)
                } else {
                    Text("Checking…").font(.caption).foregroundStyle(Color.appSecondaryText)
                }
            }
            .overlay(alignment: .topTrailing) {
                if post.media.count > 1 {
                    Image(systemName: "square.on.square.fill")
                        .font(.caption)
                        .foregroundStyle(.white)
                        .shadow(radius: 2)
                        .padding(6)
                }
            }
            .clipped()
            .accessibilityLabel(post.caption ?? "Post")
    }
}

/// Changes your username, name and bio.
struct EditProfileView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let profile: OwnProfile
    let onSaved: (OwnProfile) -> Void

    @State private var username: String
    @State private var displayName: String
    @State private var bio: String
    @State private var busy = false
    @State private var error: String?

    init(profile: OwnProfile, onSaved: @escaping (OwnProfile) -> Void) {
        self.profile = profile
        self.onSaved = onSaved
        _username = State(initialValue: profile.username ?? "")
        _displayName = State(initialValue: profile.displayName ?? "")
        _bio = State(initialValue: profile.bio ?? "")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    PartyField("Username", text: $username, prefix: "@", footnote: "3 to 30 letters, numbers, _ or .",
                               isError: !ProfileSetupView.isValid(username))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: username) { _, new in
                            let cleaned = ProfileSetupView.clean(new)
                            if cleaned != new { username = cleaned }
                        }
                    PartyField("Name", text: $displayName)
                        .onChange(of: displayName) { _, new in if new.count > 60 { displayName = String(new.prefix(60)) } }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Bio").font(.footnote.weight(.semibold)).foregroundStyle(Color.appSecondaryText)
                        TextField("A line about you", text: $bio, axis: .vertical)
                            .lineLimit(2...5)
                            .padding(16)
                            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.appField))
                            .onChange(of: bio) { _, new in if new.count > 300 { bio = String(new.prefix(300)) } }
                    }
                    ErrorText(message: error)
                }
                .padding(20)
            }
            .background(AppBackground())
            .navigationTitle("Edit profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if busy {
                        ProgressView()
                    } else {
                        Button("Save", action: save).disabled(!ProfileSetupView.isValid(username))
                    }
                }
            }
        }
    }

    private func save() {
        busy = true
        error = nil
        Task {
            do {
                let updated = try await app.api.updateMe(ProfileUpdate(
                    username: username,
                    displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines),
                    bio: bio.trimmingCharacters(in: .whitespacesAndNewlines)
                ))
                onSaved(updated)
                dismiss()
            } catch {
                self.error = error.userMessage
            }
            busy = false
        }
    }
}
