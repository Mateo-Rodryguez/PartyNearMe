import MapKit
import PhotosUI
import SwiftUI

/// A party's page: poster-style cover, when and where, who's going, the photos
/// people posted there, and Going / Interested at the bottom. The host gets
/// edit, cover, cancel and delete, and the guest list on private parties.
struct EventView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let id: String

    @State private var event: Event?
    @State private var error: String?
    @State private var posts: Paged<Post>?
    @State private var busy = false
    @State private var editing = false
    @State private var coverItem: PhotosPickerItem?
    @State private var pickingCover = false
    @State private var hostAction: HostAction?
    @State private var reporting: (ReportTarget, String)?

    init(id: String) {
        self.id = id
    }

    private var isHost: Bool { event?.organiser.id == app.myId }
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 3), count: 3)

    var body: some View {
        ScrollView {
            if let event {
                content(event)
            } else if let error {
                ListMessage(text: error) { Task { await load() } }.padding(.top, 120)
            } else {
                ProgressView().padding(.top, 200)
            }
        }
        .ignoresSafeArea(edges: event == nil ? [] : .top)
        .refreshable { await load() }
        .background(AppBackground())
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar { toolbar }
        .safeAreaInset(edge: .bottom) {
            if let event { bottomBar(event) }
        }
        .task { if event == nil { await load() } }
        // Back from the guest list or a new post: pick up the new counts.
        .onAppear { if event != nil { Task { await refresh() } } }
        .sheet(isPresented: $editing) {
            if let event {
                NavigationStack {
                    EventFormView(editing: event) { self.event = $0 }
                }
            }
        }
        .photosPicker(isPresented: $pickingCover, selection: $coverItem, matching: .images)
        .onChange(of: coverItem) { _, item in
            if let item { Task { await changeCover(item) } }
        }
        .confirmationDialog(hostAction?.title ?? "", isPresented: Binding(get: { hostAction != nil }, set: { if !$0 { hostAction = nil } }),
                            titleVisibility: .visible, presenting: hostAction) { action in
            Button(action.button, role: action == .restore ? nil : .destructive) { perform(action) }
        } message: { action in
            Text(action.message)
        }
        .reportDialog($reporting, app: app)
    }

    // MARK: Layout

    @ViewBuilder private func content(_ event: Event) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            cover(event)
            VStack(alignment: .leading, spacing: 18) {
                if event.isCancelled {
                    Label("This party was cancelled", systemImage: "xmark.octagon.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.appError)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.appError.opacity(0.12)))
                }
                info(event)
                host(event)
                if !event.friendsGoing.isEmpty || event.goingCount + event.interestedCount > 0 {
                    VStack(alignment: .leading, spacing: 8) {
                        FriendsGoing(friends: event.friendsGoing, count: event.friendsGoingCount)
                        Text(counts(event)).font(.footnote).foregroundStyle(Color.appSecondaryText)
                    }
                }
                actions(event)
                if let about = event.description, !about.isEmpty {
                    section("About") {
                        Text(about).font(.body).foregroundStyle(Color.appText).fixedSize(horizontal: false, vertical: true)
                    }
                }
                if !event.detailsHidden { map(event) }
                photos(event)
            }
            .padding(20)
        }
    }

    private func cover(_ event: Event) -> some View {
        PartyCover(url: event.coverUrl, title: event.title, showsTitle: false)
            .frame(height: 420)
            .frame(maxWidth: .infinity)
            .overlay { Brand.scrim }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        if event.isPrivate { Pill(text: "Private", systemImage: "lock.fill") }
                        if let rsvp = event.myRsvp, !event.isCancelled {
                            Pill(text: rsvpLabel(rsvp), systemImage: "checkmark.circle.fill", tint: .appAccent)
                        }
                    }
                    Text(event.title)
                        .font(.display)
                        .foregroundStyle(.white)
                        .lineLimit(3)
                        .minimumScaleFactor(0.7)
                    Text("\(Formatting.dayLabel(event.startsAt)) · \(Formatting.timeRange(event.startsAt, event.endsAt))")
                        .font(.headline)
                        .foregroundStyle(.white.opacity(0.85))
                }
                .padding(20)
            }
            .clipped()
    }

    private func info(_ event: Event) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            InfoRow(systemImage: "calendar",
                    title: Formatting.date(event.startsAt).map { $0.formatted(.dateTime.weekday(.wide).day().month(.wide)) } ?? "",
                    subtitle: Formatting.timeRange(event.startsAt, event.endsAt))
            if event.detailsHidden {
                InfoRow(systemImage: "lock.fill", title: "Location hidden",
                        subtitle: "The host shares where it is once you're let in")
            } else {
                InfoRow(systemImage: "mappin.and.ellipse", title: event.venueName ?? "Pinned on the map",
                        subtitle: event.distanceM.map { Formatting.distance($0) })
            }
        }
    }

    private func host(_ event: Event) -> some View {
        NavigationLink(value: Route.user(event.organiser.id)) {
            HStack(spacing: 12) {
                Avatar(url: event.organiser.avatarUrl, name: event.organiser.name, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Hosted by").font(.caption).foregroundStyle(Color.appSecondaryText)
                    Text(isHost ? "You" : event.organiser.name).font(.subheadline.weight(.semibold)).foregroundStyle(Color.appText)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.appSecondaryText)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.appField))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func actions(_ event: Event) -> some View {
        let tickets = event.ticketUrl.flatMap { URL(string: $0) }
        let guestList = isHost && event.isPrivate
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                if event.isPublished {
                    NavigationLink(value: Route.invite(eventId: event.id, title: event.title)) {
                        pill("Invite friends", systemImage: "paperplane.fill")
                    }
                    .buttonStyle(PressStyle())
                }
                // The host and everyone going share a group chat.
                if let chat = event.chatId {
                    NavigationLink(value: Route.chat(id: chat, title: event.title)) {
                        pill("Party chat", systemImage: "bubble.left.and.bubble.right.fill")
                    }
                    .buttonStyle(PressStyle())
                }
            }
            if let tickets {
                Link(destination: tickets) {
                    Label("Get tickets", systemImage: "ticket.fill")
                        .font(.body.weight(.bold))
                        .foregroundStyle(Color.appText)
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .background(Capsule().fill(Color.appRaised))
                }
            }
            if guestList {
                NavigationLink(value: Route.guests(eventId: event.id, title: event.title)) {
                    HStack {
                        Label("Guest list", systemImage: "person.2.fill")
                        if event.requestedCount > 0 {
                            Text("\(event.requestedCount) waiting")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(Color.appAccent))
                        }
                    }
                    .font(.body.weight(.bold))
                    .foregroundStyle(Color.appText)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Capsule().fill(Color.appRaised))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func pill(_ title: String, systemImage: String) -> some View {
        Label(title, systemImage: systemImage)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(Color.appText)
            .lineLimit(1)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Capsule().fill(Color.appRaised))
    }

    private func map(_ event: Event) -> some View {
        let place = CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng)
        return section("Where") {
            Map(initialPosition: .region(MKCoordinateRegion(center: place, latitudinalMeters: 800, longitudinalMeters: 800)),
                interactionModes: []) {
                Marker(event.venueName ?? event.title, systemImage: "party.popper.fill", coordinate: place)
                    .tint(Color.appAccent)
            }
            .frame(height: 180)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(alignment: .bottomTrailing) {
                Button {
                    let item = MKMapItem(placemark: MKPlacemark(coordinate: place))
                    item.name = event.venueName ?? event.title
                    item.openInMaps()
                } label: {
                    Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                        .font(.footnote.weight(.bold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.regularMaterial, in: Capsule())
                }
                .foregroundStyle(Color.appText)
                .padding(10)
            }
        }
    }

    @ViewBuilder private func photos(_ event: Event) -> some View {
        let canPost = isHost || event.myRsvp == "going"
        section("Photos") {
            if let posts, !posts.items.isEmpty {
                LazyVGrid(columns: columns, spacing: 3) {
                    ForEach(posts.items) { post in
                        NavigationLink(value: Route.post(post.id)) { GridTile(post: post) }
                            .buttonStyle(.plain)
                            .onAppear { posts.onAppear(post, threshold: 6) }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else if posts?.loadedOnce == true {
                Text(canPost ? "No photos yet. Be the first to post one." : "Photos people take here show up after the party starts.")
                    .font(.subheadline).foregroundStyle(Color.appSecondaryText)
            }
        } trailing: {
            if canPost && !event.isCancelled {
                NavigationLink(value: Route.newPost(eventId: event.id, title: event.title)) {
                    Label("Add yours", systemImage: "plus")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Color.appAccent)
                }
            }
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        section(title, content: content) { EmptyView() }
    }

    private func section<Content: View, Trailing: View>(_ title: String, @ViewBuilder content: () -> Content,
                                                       @ViewBuilder trailing: () -> Trailing) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title.uppercased()).font(.overline).tracking(1).foregroundStyle(Color.appSecondaryText)
                Spacer()
                trailing()
            }
            content()
        }
        .padding(.top, 6)
    }

    private func counts(_ event: Event) -> String {
        var parts = ["\(Formatting.compactCount(event.goingCount)) going"]
        if event.interestedCount > 0 { parts.append("\(Formatting.compactCount(event.interestedCount)) interested") }
        return parts.joined(separator: " · ")
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            if let event {
                Button { setSaved(!event.savedByMe) } label: {
                    Image(systemName: event.savedByMe ? "bookmark.fill" : "bookmark")
                }
                .accessibilityLabel(event.savedByMe ? "Unsave" : "Save")
                ShareLink(item: AppConfig.partyLink(event.id), subject: Text(event.title),
                          message: Text("\(event.title) on PartyNearMe")) {
                    Image(systemName: "square.and.arrow.up")
                }
                .simultaneousGesture(TapGesture().onEnded {
                    app.interactions.share(eventId: event.id)
                    app.analytics.capture("link_shared", ["kind": "party"])
                })
                Menu {
                    if isHost {
                        Button("Edit party", systemImage: "pencil") { editing = true }
                        Button(event.coverUrl == nil ? "Add cover" : "Change cover", systemImage: "photo") { pickingCover = true }
                        if event.coverUrl != nil {
                            Button("Remove cover", systemImage: "photo.badge.minus") { removeCover() }
                        }
                        if event.isCancelled {
                            Button("Restore party", systemImage: "arrow.uturn.backward") { hostAction = .restore }
                        } else {
                            Button("Cancel party", systemImage: "xmark.circle") { hostAction = .cancel }
                        }
                        Button("Delete party", systemImage: "trash", role: .destructive) { hostAction = .delete }
                    } else {
                        Button("Report", systemImage: "exclamationmark.bubble") { reporting = (.event, event.id) }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More")
            }
        }
    }

    @ViewBuilder private func bottomBar(_ event: Event) -> some View {
        HStack(spacing: 10) {
            if isHost {
                SecondaryButton("Edit party", systemImage: "pencil") { editing = true }
            } else if event.isCancelled {
                Text("This party was cancelled").font(.subheadline.weight(.semibold)).foregroundStyle(Color.appSecondaryText)
                    .frame(maxWidth: .infinity, minHeight: 52)
            } else {
                switch event.myRsvp {
                case "going"?:
                    PrimaryButton("Going", systemImage: "checkmark", busy: busy) { rsvp(nil) }
                case "requested"?:
                    SecondaryButton("Requested · tap to withdraw", systemImage: "hourglass") { rsvp(nil) }
                default:
                    PrimaryButton(event.isPrivate ? "Ask to join" : "Going", systemImage: event.isPrivate ? "hand.raised.fill" : nil,
                                  busy: busy) { rsvp("going") }
                }
                if event.myRsvp != "requested" {
                    Button { rsvp(event.myRsvp == "interested" ? nil : "interested") } label: {
                        Image(systemName: event.myRsvp == "interested" ? "star.fill" : "star")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(event.myRsvp == "interested" ? Color.appAccent : Color.appText)
                            .frame(width: 52, height: 52)
                            .background(Circle().fill(Color.appRaised))
                    }
                    .buttonStyle(PressStyle())
                    .disabled(busy)
                    .accessibilityLabel(event.myRsvp == "interested" ? "Not interested" : "Interested")
                    .sensoryFeedback(.selection, trigger: event.myRsvp)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(.bar)
    }

    // MARK: Loading and actions

    private func load() async {
        error = nil
        do {
            event = try await app.api.event(id)
            if posts == nil {
                let api = app.api, eventId = id
                posts = Paged { cursor in
                    let page = try await api.eventPosts(eventId, cursor: cursor)
                    return (page.posts, page.nextCursor)
                }
            }
            await posts?.refresh()
        } catch is CancellationError {
        } catch {
            if event == nil { self.error = error.userMessage } else { app.show(error.userMessage) }
        }
    }

    /// Quietly picks up new counts and photos, keeping what's on screen if it fails.
    private func refresh() async {
        if let fresh = try? await app.api.event(id) { event = fresh }
        await posts?.refresh()
    }

    private func rsvp(_ status: String?) {
        guard !busy else { return }
        busy = true
        Task {
            do {
                event = try await app.api.rsvp(id, status: status)
                app.analytics.capture("rsvp_changed", ["status": status ?? "none"])
                if status == "going", event?.myRsvp == "requested" { app.show("Asked. You'll get a notification when the host lets you in.") }
            } catch {
                app.show(error.userMessage)
            }
            busy = false
        }
    }

    private func setSaved(_ saved: Bool) {
        event?.savedByMe = saved
        Task {
            do {
                try await app.api.setEventSaved(id, saved: saved)
                if saved { app.show("Saved") }
            } catch {
                event?.savedByMe = !saved
                app.show(error.userMessage)
            }
        }
    }

    private func changeCover(_ item: PhotosPickerItem) async {
        coverItem = nil
        guard let data = try? await item.loadTransferable(type: Data.self),
              let photo = await Task.detached(priority: .userInitiated, operation: { PickedPhoto.make(from: data) }).value else {
            app.show("Couldn't open that photo")
            return
        }
        do {
            let upload = try await app.api.uploadPhoto(photo.jpeg)
            try await app.api.setCover(id, uploadId: upload)
            app.show("New cover shows once the photo is checked")
        } catch {
            app.show(error.userMessage)
        }
    }

    private func removeCover() {
        let old = event?.coverUrl
        event?.coverUrl = nil
        Task {
            do {
                try await app.api.removeCover(id)
            } catch {
                event?.coverUrl = old
                app.show(error.userMessage)
            }
        }
    }

    private func perform(_ action: HostAction) {
        Task {
            do {
                switch action {
                case .cancel:
                    event = try await app.api.updateEvent(id, EventUpdate(status: "cancelled"))
                    app.show("Party cancelled. Guests were told.")
                case .restore:
                    event = try await app.api.updateEvent(id, EventUpdate(status: "published"))
                    app.show("Party is back on")
                case .delete:
                    try await app.api.deleteEvent(id)
                    app.show("Party deleted")
                    dismiss()
                }
            } catch {
                app.show(error.userMessage)
            }
        }
    }
}

/// The host's actions that need a second tap.
private enum HostAction: Identifiable {
    case cancel, restore, delete

    var id: Self { self }

    var title: String {
        switch self {
        case .cancel: return "Cancel this party?"
        case .restore: return "Put this party back on?"
        case .delete: return "Delete this party?"
        }
    }

    var button: String {
        switch self {
        case .cancel: return "Cancel party"
        case .restore: return "Restore party"
        case .delete: return "Delete"
        }
    }

    var message: String {
        switch self {
        case .cancel: return "Everyone going or interested gets a notification. You can put it back on later."
        case .restore: return "It shows up on Nearby again."
        case .delete: return "The party and its guest list disappear for everyone. Photos posted there stay on people's profiles."
        }
    }
}

/// An icon with a line or two of detail, like Calendar's event rows.
private struct InfoRow: View {
    let systemImage: String
    let title: String
    var subtitle: String?

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.body.weight(.semibold))
                .foregroundStyle(Color.appAccent)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.appField))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.appText)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle).font(.footnote).foregroundStyle(Color.appSecondaryText)
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}
