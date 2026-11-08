import CoreLocation
import MapKit
import PhotosUI
import SwiftUI

/// Starts a party, or edits one when `editing` is set: cover, title, venue, kind,
/// when and for how long, where on the map, details, tickets and private.
struct EventFormView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let editing: Event?
    /// The party as the server now has it.
    let onDone: (Event) -> Void

    static let durations = [2, 4, 6, 8, 12]

    @State private var title: String
    @State private var venue: String
    @State private var kind: Int?
    @State private var start: Date
    @State private var hours: Int
    /// Nil means "where I am now", worked out when publishing.
    @State private var spot: CLLocationCoordinate2D?
    @State private var about: String
    @State private var tickets: String
    @State private var isPrivate: Bool
    @State private var kinds: [Interest] = []
    @State private var coverItem: PhotosPickerItem?
    @State private var cover: PickedPhoto?
    @State private var pickingSpot = false
    @State private var busy = false
    @State private var error: String?

    init(editing: Event?, onDone: @escaping (Event) -> Void) {
        self.editing = editing
        self.onDone = onDone
        _title = State(initialValue: editing?.title ?? "")
        _venue = State(initialValue: editing?.venueName ?? "")
        _kind = State(initialValue: editing?.interestId)
        _start = State(initialValue: editing.flatMap { Formatting.date($0.startsAt) } ?? Self.defaultStart())
        _hours = State(initialValue: editing.map { Self.hours(of: $0) } ?? 4)
        _spot = State(initialValue: editing.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) })
        _about = State(initialValue: editing?.description ?? "")
        _tickets = State(initialValue: editing?.ticketUrl ?? "")
        _isPrivate = State(initialValue: editing?.isPrivate ?? false)
    }

    /// Tonight at nine, or tomorrow at nine once it's later than that.
    static func defaultStart(now: Date = Date(), calendar: Calendar = .current) -> Date {
        let tonight = calendar.date(bySettingHour: 21, minute: 0, second: 0, of: now)!
        return tonight > now ? tonight : calendar.date(byAdding: .day, value: 1, to: tonight)!
    }

    /// The closest of the length choices to how long the party runs.
    static func hours(of event: Event) -> Int {
        guard let start = Formatting.date(event.startsAt), let end = event.endsAt.flatMap(Formatting.date) else { return 4 }
        let length = end.timeIntervalSince(start) / 3600
        return durations.min { abs(Double($0) - length) < abs(Double($1) - length) } ?? 4
    }

    private var trimmedTickets: String { tickets.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var ticketsInvalid: Bool { !trimmedTickets.isEmpty && !trimmedTickets.hasPrefix("https://") }
    private var canSave: Bool { !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !ticketsInvalid && !busy }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                coverPicker
                PartyField("Title", text: $title, prompt: "What's the party?")
                    .textInputAutocapitalization(.words)
                    .onChange(of: title) { _, new in if new.count > 120 { title = String(new.prefix(120)) } }
                PartyField("Venue (optional)", text: $venue, prompt: "e.g. The Roof, Peckham")
                    .textInputAutocapitalization(.words)
                    .onChange(of: venue) { _, new in if new.count > 120 { venue = String(new.prefix(120)) } }
                if !kinds.isEmpty {
                    label("What kind of party?")
                    FlowLayout(spacing: 8) {
                        ForEach(kinds) { interest in
                            ChoiceChip(title: interest.name, selected: kind == interest.id) {
                                kind = kind == interest.id ? nil : interest.id
                            }
                        }
                    }
                }
                label("When")
                DatePicker("Starts", selection: $start, in: Date().addingTimeInterval(-3600)..., displayedComponents: [.date, .hourAndMinute])
                    .font(.subheadline.weight(.semibold))
                    .tint(Color.appAccent)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 54)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.appField))
                Text("Lasts about \(hours) hours").font(.footnote).foregroundStyle(Color.appSecondaryText)
                HStack(spacing: 8) {
                    ForEach(Self.durations, id: \.self) { h in
                        ChoiceChip(title: "\(h)h", selected: hours == h) { hours = h }
                    }
                }
                label("Where")
                Button { pickingSpot = true } label: { spotRow }
                    .buttonStyle(.plain)
                label("Details")
                PartyField("About (optional)", text: $about, prompt: "Dress code, music, what to bring")
                    .onChange(of: about) { _, new in if new.count > 2000 { about = String(new.prefix(2000)) } }
                PartyField("Ticket link (optional)", text: $tickets, prompt: "https://",
                           footnote: ticketsInvalid ? "Starts with https://" : nil, isError: ticketsInvalid)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Toggle(isOn: $isPrivate) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Private party").font(.subheadline.weight(.semibold))
                        Text("Not on Nearby. You approve who comes, and only they see the venue.")
                            .font(.caption).foregroundStyle(Color.appSecondaryText)
                    }
                }
                .tint(Color.appAccent)
                .padding(.vertical, 4)
                ErrorText(message: error)
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(AppBackground())
        .navigationTitle(editing == nil ? "New party" : "Edit party")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        }
        .safeAreaInset(edge: .bottom) {
            PrimaryButton(editing == nil ? "Publish party" : "Save changes", busy: busy, action: submit)
                .disabled(!canSave && !busy)
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 8)
                .background(.bar)
        }
        .task { if kinds.isEmpty, let loaded = try? await app.api.interests() { kinds = loaded } }
        .onChange(of: coverItem) { _, item in if let item { Task { await loadCover(item) } } }
        .sheet(isPresented: $pickingSpot) {
            NavigationStack { MapPinPicker(start: spot, chosen: $spot) }
        }
        .interactiveDismissDisabled(busy)
        .analyticsScreen(editing == nil ? "new_party" : "edit_party")
    }

    private var coverPicker: some View {
        PhotosPicker(selection: $coverItem, matching: .images) {
            ZStack {
                if let cover {
                    Image(uiImage: cover.preview).resizable().scaledToFill()
                } else {
                    PartyCover(url: editing?.coverUrl, title: title.isEmpty ? "New party" : title, showsTitle: false)
                }
                Brand.scrim
                VStack(alignment: .leading, spacing: 6) {
                    Spacer()
                    Text(title.trimmingCharacters(in: .whitespaces).isEmpty ? "Your party" : title)
                        .font(.headline2)
                        .foregroundStyle(.white)
                        .lineLimit(2)
                    Label(cover != nil || editing?.coverUrl != nil ? "Change cover" : "Add a cover photo", systemImage: "photo")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.85))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
            }
            .frame(height: 200)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(PressStyle())
        .disabled(busy)
    }

    private var spotRow: some View {
        HStack(spacing: 14) {
            Image(systemName: spot == nil ? "location.fill" : "mappin.and.ellipse")
                .font(.body.weight(.semibold))
                .foregroundStyle(Color.appAccent)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.appRaised))
            VStack(alignment: .leading, spacing: 2) {
                Text(spotTitle).font(.subheadline.weight(.semibold)).foregroundStyle(Color.appText)
                Text(spot == nil ? "Tap to pick a different spot on the map" : "Tap to change it on the map")
                    .font(.caption).foregroundStyle(Color.appSecondaryText)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.appSecondaryText)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.appField))
    }

    private var spotTitle: String {
        guard let spot else { return "Where you are now" }
        if let editing, spot.latitude == editing.lat, spot.longitude == editing.lng { return editing.venueName ?? "The party's spot" }
        return "The spot you picked"
    }

    private func label(_ text: String) -> some View {
        Text(text).font(.footnote.weight(.semibold)).foregroundStyle(Color.appSecondaryText).padding(.top, 4)
    }

    private func loadCover(_ item: PhotosPickerItem) async {
        if let data = try? await item.loadTransferable(type: Data.self),
           let photo = await Task.detached(priority: .userInitiated, operation: { PickedPhoto.make(from: data) }).value {
            cover = photo
        }
    }

    private func submit() {
        guard canSave else { return }
        busy = true
        error = nil
        Task {
            do {
                var saved: Event?
                if let editing {
                    saved = try await save(editing)
                } else {
                    saved = try await publish()
                }
                if let saved { finish(saved) }
            } catch {
                self.error = error.userMessage
            }
            busy = false
        }
    }

    private func clean(_ text: String) -> String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func publish() async throws -> Event? {
        var here = spot
        if here == nil { here = await app.location.current() }
        guard let here else {
            error = "Turn on location, or pick the spot on the map, so people can find your party."
            return nil
        }
        let made = try await app.api.createEvent(NewEvent(
            title: clean(title),
            description: clean(about).isEmpty ? nil : clean(about),
            startsAt: Formatting.iso(start),
            endsAt: Formatting.iso(start.addingTimeInterval(Double(hours) * 3600)),
            venueName: clean(venue).isEmpty ? nil : clean(venue),
            interestId: kind,
            isPrivate: isPrivate,
            ticketUrl: trimmedTickets.isEmpty ? nil : trimmedTickets,
            lat: here.latitude,
            lng: here.longitude
        ))
        app.analytics.capture("party_created", ["has_cover": cover != nil, "has_kind": made.interestId != nil])
        await uploadCover(to: made.id, failure: "Your party is live, but the cover didn't upload. Try again from its page.")
        app.show("Your party is live")
        return made
    }

    private func save(_ event: Event) async throws -> Event? {
        let here = spot ?? CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng)
        // Empty strings clear these on the server.
        var saved = try await app.api.updateEvent(event.id, EventUpdate(
            title: clean(title),
            description: clean(about),
            startsAt: Formatting.iso(start),
            endsAt: Formatting.iso(start.addingTimeInterval(Double(hours) * 3600)),
            venueName: clean(venue),
            interestId: kind,
            isPrivate: isPrivate,
            ticketUrl: trimmedTickets,
            lat: here.latitude,
            lng: here.longitude
        ))
        if kind == nil, event.interestId != nil, let cleared = try? await app.api.clearEventKind(event.id) { saved = cleared }
        await uploadCover(to: event.id, failure: "Saved, but the cover didn't upload. Try again from the party's menu.")
        app.show("Changes saved")
        return saved
    }

    private func uploadCover(to eventId: String, failure: String) async {
        guard let cover else { return }
        do {
            try await app.api.setCover(eventId, uploadId: try await app.api.uploadPhoto(cover.jpeg))
        } catch {
            app.show(failure)
        }
    }

    private func finish(_ event: Event) {
        onDone(event)
        dismiss()
    }
}

/// Uber-style spot picking: move the map under a fixed pin, then confirm.
struct MapPinPicker: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var chosen: CLLocationCoordinate2D?
    @State private var position: MapCameraPosition
    @State private var center: CLLocationCoordinate2D?
    @State private var moving = false

    init(start: CLLocationCoordinate2D?, chosen: Binding<CLLocationCoordinate2D?>) {
        _chosen = chosen
        _center = State(initialValue: start)
        if let start {
            _position = State(initialValue: .region(MKCoordinateRegion(center: start, latitudinalMeters: 600, longitudinalMeters: 600)))
        } else {
            _position = State(initialValue: .userLocation(fallback: .automatic))
        }
    }

    var body: some View {
        Map(position: $position) {
            UserAnnotation()
        }
        .mapStyle(.standard(pointsOfInterest: .including([.nightlife, .restaurant, .stadium, .park])))
        .mapControls { MapUserLocationButton() }
        .onMapCameraChange(frequency: .continuous) { _ in moving = true }
        .onMapCameraChange(frequency: .onEnd) { context in
            center = context.region.center
            moving = false
        }
        .overlay {
            Image(systemName: "mappin")
                .font(.system(size: 40, weight: .bold))
                .foregroundStyle(Brand.gradient)
                .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                .offset(y: moving ? -30 : -20)
                .animation(.snappy, value: moving)
                .allowsHitTesting(false)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 6) {
                Text("Move the map to put the pin on the party").font(.footnote).foregroundStyle(Color.appSecondaryText)
                PrimaryButton("Use this spot", systemImage: "checkmark") {
                    chosen = center
                    dismiss()
                }
                .disabled(center == nil)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 8)
            .background(.bar)
        }
        .navigationTitle("Pick the spot")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        }
    }
}
