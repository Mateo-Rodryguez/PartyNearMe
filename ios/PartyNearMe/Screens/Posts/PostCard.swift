import SwiftUI

/// One post: author, swipeable photos with rounded corners, likes, comments and caption.
/// Likes, saves and caption edits show at once and are put back if the server refuses.
struct PostCard: View {
    @Environment(AppModel.self) private var app
    @Binding var post: Post
    /// The post is gone: take it off the list (or leave the screen).
    var onDeleted: () -> Void = {}
    /// Feed only: hide the post and show fewer like it.
    var onNotInterested: (() -> Void)?

    @State private var bursts = 0
    @State private var confirmDelete = false
    @State private var editingCaption = false
    @State private var showTags = false
    @State private var reporting: (ReportTarget, String)?

    private var isMine: Bool { post.author.id == app.myId }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            ZStack(alignment: .topLeading) {
                PhotoPager(media: post.media, pending: !post.isVisible, bursts: bursts) {
                    guard post.isVisible else { return }
                    bursts += 1
                    if !post.likedByMe { setLiked(true) }
                }
                if let eventTitle = post.eventTitle {
                    Label(eventTitle, systemImage: "mappin.and.ellipse")
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.black.opacity(0.55), in: Capsule())
                        .padding(12)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .padding(.horizontal, 12)
            actions
            details
        }
        .padding(.bottom, 24)
        .confirmationDialog("Delete this post?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive, action: delete)
        } message: {
            Text("It disappears for everyone.")
        }
        .sheet(isPresented: $editingCaption) {
            CaptionEditor(caption: post.caption ?? "") { saveCaption($0) }
        }
        .sheet(isPresented: $showTags) {
            TaggedPeopleSheet(post: $post)
        }
        .reportDialog($reporting, app: app)
    }

    private var header: some View {
        HStack(spacing: 10) {
            NavigationLink(value: Route.user(post.author.id)) {
                HStack(spacing: 10) {
                    Avatar(url: post.author.avatarUrl, name: post.author.name, size: 38)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(post.author.name).font(.subheadline.weight(.semibold)).foregroundStyle(Color.appText)
                        let subtitle = [post.placeName, Formatting.timeAgo(post.createdAt)]
                            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                        if !subtitle.isEmpty {
                            Text(subtitle).font(.caption).foregroundStyle(Color.appSecondaryText).lineLimit(1)
                        }
                    }
                }
            }
            .buttonStyle(.plain)
            Spacer()
            Menu {
                if isMine {
                    Button(post.caption?.isEmpty == false ? "Edit caption" : "Add caption", systemImage: "pencil") {
                        editingCaption = true
                    }
                    Button("Delete post", systemImage: "trash", role: .destructive) { confirmDelete = true }
                } else {
                    if let onNotInterested {
                        Button("Not interested", systemImage: "eye.slash", action: onNotInterested)
                    }
                    Button("Report", systemImage: "exclamationmark.bubble") { reporting = (.post, post.id) }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.appSecondaryText)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("More")
        }
        .padding(.leading, 16)
        .padding(.trailing, 4)
        .padding(.bottom, 10)
    }

    private var actions: some View {
        HStack(spacing: 2) {
            Button { setLiked(!post.likedByMe) } label: {
                Image(systemName: post.likedByMe ? "heart.fill" : "heart")
                    .font(.system(size: 23))
                    .foregroundStyle(post.likedByMe ? Color.appAccent : Color.appText)
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(post.likedByMe ? "Unlike" : "Like")
            .sensoryFeedback(.impact(weight: .light), trigger: post.likedByMe) { _, liked in liked }

            NavigationLink(value: Route.comments(postId: post.id)) {
                Image(systemName: "bubble.right")
                    .font(.system(size: 21))
                    .foregroundStyle(Color.appText)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Comments")

            if let link = URL(string: "\(AppConfig.apiBase)/p/\(post.id)") {
                ShareLink(item: link, message: Text("\(post.author.name) on PartyNearMe")) {
                    Image(systemName: "paperplane")
                        .font(.system(size: 21))
                        .foregroundStyle(Color.appText)
                        .frame(width: 44, height: 44)
                }
                .simultaneousGesture(TapGesture().onEnded { app.interactions.share(postId: post.id) })
                .accessibilityLabel("Share")
            }

            if !(AppPrefs.shared.hideLikeCounts && !isMine) {
                Text(likesText)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(post.likeCount == 0 ? Color.appSecondaryText : Color.appText)
                    .contentTransition(.numericText())
                    .padding(.leading, 4)
            }
            Spacer()
            Button { setSaved(!post.savedByMe) } label: {
                Image(systemName: post.savedByMe ? "bookmark.fill" : "bookmark")
                    .font(.system(size: 21))
                    .foregroundStyle(Color.appText)
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(post.savedByMe ? "Remove from saved" : "Save")
        }
        .disabled(!post.isVisible)
        .padding(.horizontal, 6)
    }

    @ViewBuilder private var details: some View {
        if !post.tags.isEmpty {
            Button { showTags = true } label: {
                Label("with \(Formatting.tagged(post.tags.map(\.name)))", systemImage: "person.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 4)
        }
        if let caption = post.caption, !caption.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            (Text(post.author.name).fontWeight(.semibold) + Text("  ") + Text(caption))
                .font(.subheadline)
                .foregroundStyle(Color.appText)
                .padding(.horizontal, 16)
        }
        if post.isVisible {
            NavigationLink(value: Route.comments(postId: post.id)) {
                Text(commentsText).font(.subheadline).foregroundStyle(Color.appSecondaryText)
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
        }
    }

    private var likesText: String {
        switch post.likeCount {
        case 0: "Be the first to like this"
        case 1: "1 like"
        default: "\(Formatting.compactCount(post.likeCount)) likes"
        }
    }

    private var commentsText: String {
        switch post.commentCount {
        case 0: "Add a comment…"
        case 1: "View 1 comment"
        default: "View all \(post.commentCount) comments"
        }
    }

    // MARK: Actions

    private func setLiked(_ liked: Bool) {
        let before = post
        withAnimation(.snappy) { post.setLiked(liked) }
        Task {
            do { try await app.api.setLiked(before.id, liked: liked) } catch {
                post.setLiked(!liked)
                app.show(error.userMessage)
            }
        }
    }

    private func setSaved(_ saved: Bool) {
        post.savedByMe = saved
        Task {
            do {
                try await app.api.setSaved(post.id, saved: saved)
                if saved { app.show("Saved. Find it under Saved on your profile.") }
            } catch {
                post.savedByMe = !saved
                app.show(error.userMessage)
            }
        }
    }

    private func saveCaption(_ caption: String) {
        let before = post.caption
        post.caption = caption.isEmpty ? nil : caption
        Task {
            do {
                post = try await app.api.updateCaption(post.id, caption: caption)
            } catch {
                post.caption = before
                app.show(error.userMessage)
            }
        }
    }

    private func delete() {
        Task {
            do {
                try await app.api.deletePost(post.id)
                app.show("Post deleted")
                onDeleted()
            } catch {
                app.show(error.userMessage)
            }
        }
    }
}

/// A post's photos, swiped sideways, with page dots and the heart that pops on a double tap.
private struct PhotoPager: View {
    let media: [Media]
    let pending: Bool
    let bursts: Int
    let onDoubleTap: () -> Void

    @State private var page = 0
    @State private var heart: CGFloat = 0

    var body: some View {
        let ratio = media.first?.aspectRatio ?? 1
        ZStack {
            Color.appRaised
            if pending || media.isEmpty {
                VStack(spacing: 10) {
                    ProgressView()
                    Text("Checking your photo. It appears for everyone once it's approved.")
                        .font(.subheadline)
                        .foregroundStyle(Color.appSecondaryText)
                        .multilineTextAlignment(.center)
                }
                .padding(32)
            } else {
                TabView(selection: $page) {
                    ForEach(Array(media.enumerated()), id: \.offset) { index, item in
                        RemoteImage(url: item.url(minWidth: 1080), blurHash: item.blurhash)
                            .accessibilityLabel("Photo \(index + 1) of \(media.count)")
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                if media.count > 1 {
                    VStack {
                        Spacer()
                        HStack(spacing: 5) {
                            ForEach(0..<media.count, id: \.self) { index in
                                Circle().fill(.white.opacity(index == page ? 1 : 0.45)).frame(width: 6, height: 6)
                            }
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(.black.opacity(0.4), in: Capsule())
                        .padding(.bottom, 12)
                    }
                }
            }
            Image(systemName: "heart.fill")
                .font(.system(size: 96))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.25), radius: 12)
                .scaleEffect(heart)
                .opacity(Double(min(heart, 1)))
                .allowsHitTesting(false)
        }
        .aspectRatio(ratio, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture(count: 2, perform: onDoubleTap)
        .onChange(of: bursts) {
            heart = 0.4
            withAnimation(.spring(response: 0.35, dampingFraction: 0.5)) {
                heart = 1
            } completion: {
                withAnimation(.easeIn(duration: 0.18).delay(0.3)) { heart = 0 }
            }
        }
    }
}

/// Writes or changes a post's caption.
struct CaptionEditor: View {
    @Environment(\.dismiss) private var dismiss
    let original: String
    let onSave: (String) -> Void
    @State private var text: String

    init(caption: String, onSave: @escaping (String) -> Void) {
        original = caption
        self.onSave = onSave
        _text = State(initialValue: caption)
    }

    var body: some View {
        NavigationStack {
            TextField("Write a caption…", text: $text, axis: .vertical)
                .lineLimit(3...10)
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.appField))
                .padding(20)
                .frame(maxHeight: .infinity, alignment: .top)
                .background(AppBackground())
                .navigationTitle("Edit caption")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            onSave(String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(2200)))
                            dismiss()
                        }
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines) == original)
                    }
                }
        }
        .presentationDetents([.medium])
    }
}

/// Who is tagged in a post, each opening their profile, and a way to take yourself off.
private struct TaggedPeopleSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @Binding var post: Post

    var body: some View {
        NavigationStack {
            List {
                ForEach(post.tags) { person in
                    HStack(spacing: 12) {
                        Avatar(url: nil, name: person.name, size: 36)
                        VStack(alignment: .leading) {
                            Text(person.name).font(.subheadline.weight(.semibold))
                            if let username = person.username {
                                Text("@\(username)").font(.caption).foregroundStyle(Color.appSecondaryText)
                            }
                        }
                    }
                }
                if post.tags.contains(where: { $0.id == app.myId }) {
                    Button("Remove me from this post", role: .destructive, action: untagMe)
                }
            }
            .navigationTitle("In this photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func untagMe() {
        let before = post.tags
        post.tags.removeAll { $0.id == app.myId }
        dismiss()
        Task {
            do {
                try await app.api.untagMe(post.id)
                app.show("You're no longer tagged")
            } catch {
                post.tags = before
                app.show(error.userMessage)
            }
        }
    }
}
