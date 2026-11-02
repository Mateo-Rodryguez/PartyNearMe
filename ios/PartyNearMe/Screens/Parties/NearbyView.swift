import CoreLocation
import MapKit
import SwiftUI

/// The parties near the user, kept while other tabs are open. Home's
/// "Happening near you" row shows the same list.
@MainActor
@Observable
final class NearbyModel {
    /// How far to look, from Settings.
    var radiusKm: Double { Double(AppPrefs.shared.radiusKm) }
    /// The radius the list was loaded with, so changing it in Settings reloads the list.
    @ObservationIgnored private var loadedRadius: Double?

    let paged: Paged<Event>
    private(set) var noLocation = false
    private(set) var here: CLLocationCoordinate2D?
    private(set) var time = PartyTime.anyTime
    /// Only parties of this kind (an interest id), or all of them.
    private(set) var kind: Int?
    /// The kinds to filter by, loaded with the first page.
    private(set) var kinds: [Interest] = []
    var showMap = false
    /// The new party form is open; Home's "Start one" opens it too.
    var creating = false

    var filtered: Bool { time != .anyTime || kind != nil }

    init(app: AppModel) {
        weak var model: NearbyModel?
        paged = Paged { cursor in
            guard let nearby = model else { return ([], nil) }
            return try await nearby.page(app: app, cursor: cursor)
        }
        model = self
    }

    func refreshIfRadiusChanged() {
        if paged.loadedOnce, let loadedRadius, loadedRadius != radiusKm { Task { await paged.refresh() } }
    }

    func filter(time: PartyTime? = nil, kind: Int?? = nil) {
        let newTime = time ?? self.time
        let newKind = kind ?? self.kind
        guard newTime != self.time || newKind != self.kind else { return }
        self.time = newTime
        self.kind = newKind
        Task { await paged.refresh() }
    }

    private func page(app: AppModel, cursor: String?) async throws -> ([Event], String?) {
        if kinds.isEmpty, let loaded = try? await app.api.interests() { kinds = loaded }
        if cursor == nil { loadedRadius = radiusKm }
        let location = await app.location.current()
        here = location
        noLocation = location == nil
        guard let location else { return ([], nil) }
        let window = time.window()
        let page = try await app.api.nearbyEvents(
            lat: location.latitude, lng: location.longitude, radiusKm: radiusKm, cursor: cursor,
            from: window.map { Formatting.iso($0.from) }, to: window.map { Formatting.iso($0.to) }, interestId: kind
        )
        return (page.events, page.nextCursor)
    }
}

/// The Nearby tab: parties by day in a list, or as pins on Apple Maps, with time and kind filters.
struct NearbyView: View {
    @Environment(AppModel.self) private var app
    @Bindable var model: NearbyModel
    /// Opens a party that was just made.
    var onCreated: (Event) -> Void = { _ in }

    var body: some View {
        VStack(spacing: 0) {
            header
            filters
            ZStack {
                if model.showMap {
                    PartyMap(model: model)
                } else {
                    list
                }
            }
            .frame(maxHeight: .infinity)
        }
        .background(AppBackground())
        .toolbar(.hidden, for: .navigationBar)
        .task { if !model.paged.loadedOnce && !model.paged.loading { await model.paged.refresh() } }
        .onAppear { model.refreshIfRadiusChanged() }
        .sheet(isPresented: $model.creating) {
            NavigationStack {
                EventFormView(editing: nil) { event in
                    Task { await model.paged.refresh() }
                    onCreated(event)
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Text("Near you").font(.headline1).foregroundStyle(Color.appText).accessibilityAddTraits(.isHeader)
            Spacer()
            Button {
                withAnimation(.snappy) { model.showMap.toggle() }
            } label: {
                Image(systemName: model.showMap ? "list.bullet" : "map")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.appText)
                    .frame(width: 42, height: 42)
                    .background(Circle().fill(Color.appRaised))
            }
            .accessibilityLabel(model.showMap ? "Show as list" : "Show on map")
            Button { model.creating = true } label: {
                Image(systemName: "plus")
                    .font(.body.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 42, height: 42)
                    .background(Circle().fill(Brand.gradient))
            }
            .accessibilityLabel("New party")
        }
        .padding(.horizontal, 20)
        .frame(height: 60)
    }

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(PartyTime.allCases) { time in
                    ChoiceChip(title: time.rawValue, selected: model.time == time) { model.filter(time: time) }
                }
                if !model.kinds.isEmpty {
                    Divider().frame(height: 24).padding(.horizontal, 4)
                    ForEach(model.kinds) { kind in
                        ChoiceChip(title: kind.name, selected: model.kind == kind.id) {
                            model.filter(kind: .some(model.kind == kind.id ? nil : kind.id))
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
    }

    private struct Day: Identifiable {
        let id: String
        var events: [Event]
    }

    /// The parties under "Tonight", "Tomorrow" and so on, in the server's order.
    private var days: [Day] {
        var groups: [Day] = []
        for event in model.paged.items {
            let day = Formatting.dayLabel(event.startsAt)
            if groups.last?.id == day {
                groups[groups.count - 1].events.append(event)
            } else {
                groups.append(Day(id: day, events: [event]))
            }
        }
        return groups
    }

    private var list: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20, pinnedViews: .sectionHeaders) {
                ForEach(days) { group in
                    Section {
                        ForEach(group.events) { event in
                            NavigationLink(value: Route.event(event.id)) { EventCard(event: event) }
                                .buttonStyle(.plain)
                                .onAppear { model.paged.onAppear(event, threshold: 3) }
                        }
                    } header: {
                        Text(group.id.uppercased())
                            .font(.overline)
                            .tracking(1)
                            .foregroundStyle(Color.appSecondaryText)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 6)
                            .background(Color.appBackground)
                    }
                }
                if let error = model.paged.error, !model.paged.items.isEmpty {
                    ListMessage(text: error) { Task { await model.paged.retry() } }
                }
                if model.paged.loading && !model.paged.items.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).padding(24)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .overlay { emptyState }
        .refreshable { await model.paged.refresh() }
    }

    @ViewBuilder private var emptyState: some View {
        let paged = model.paged
        if paged.items.isEmpty {
            if !paged.loadedOnce {
                ProgressView()
            } else if model.noLocation {
                ContentUnavailableView {
                    Label("Where are you?", systemImage: "location.slash")
                } description: {
                    Text("Allow location in Settings to see parties near you.")
                } actions: {
                    if let settings = URL(string: UIApplication.openSettingsURLString) {
                        Link("Open Settings", destination: settings).tint(Color.appAccent)
                    }
                }
            } else if let error = paged.error {
                ListMessage(text: error) { Task { await paged.refresh() } }
            } else if model.filtered {
                ContentUnavailableView {
                    Label("Nothing matches", systemImage: "line.3.horizontal.decrease.circle")
                } description: {
                    Text("Try another day or kind of party.")
                } actions: {
                    SecondaryButton("Show all parties", fullWidth: false) { model.filter(time: .anyTime, kind: .some(nil)) }
                }
            } else {
                ContentUnavailableView {
                    Label("No parties nearby yet", systemImage: "party.popper")
                } description: {
                    Text("Be the first: start one and invite your friends.")
                } actions: {
                    PrimaryButton("Start a party", systemImage: "plus", compact: true) { model.creating = true }
                }
            }
        }
    }
}

/// The parties as pins on Apple Maps. Tapping one shows its card at the bottom.
private struct PartyMap: View {
    @Bindable var model: NearbyModel
    @State private var position: MapCameraPosition = .automatic
    @State private var selected: String?

    init(model: NearbyModel) {
        self.model = model
    }

    private var selectedEvent: Event? { model.paged.items.first { $0.id == selected } }

    var body: some View {
        Map(position: $position, selection: $selected) {
            UserAnnotation()
            ForEach(model.paged.items) { event in
                Annotation(event.title, coordinate: CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng)) {
                    PartyPin(event: event, selected: selected == event.id)
                }
                .tag(event.id)
                .annotationTitles(.hidden)
            }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .mapControls {
            MapUserLocationButton()
            MapCompass()
        }
        .overlay(alignment: .bottom) {
            if let event = selectedEvent {
                NavigationLink(value: Route.event(event.id)) { MapCard(event: event) }
                    .buttonStyle(.plain)
                    .padding(16)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: selected)
        .onAppear { frame() }
        .onChange(of: model.paged.items.map(\.id)) { _, _ in frame() }
    }

    /// Fits the pins and the user on screen.
    private func frame() {
        guard let here = model.here else { return }
        let points = model.paged.items.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) } + [here]
        let lats = points.map(\.latitude), lngs = points.map(\.longitude)
        let center = CLLocationCoordinate2D(latitude: (lats.min()! + lats.max()!) / 2, longitude: (lngs.min()! + lngs.max()!) / 2)
        let span = MKCoordinateSpan(latitudeDelta: max(0.02, (lats.max()! - lats.min()!) * 1.5),
                                    longitudeDelta: max(0.02, (lngs.max()! - lngs.min()!) * 1.5))
        position = .region(MKCoordinateRegion(center: center, span: span))
    }
}

/// A party on the map: its cover in a round pin with the brand ring.
private struct PartyPin: View {
    let event: Event
    let selected: Bool

    var body: some View {
        let size: CGFloat = selected ? 58 : 44
        VStack(spacing: 0) {
            PartyCover(url: event.coverUrl, title: event.title, showsTitle: false)
                .frame(width: size - 8, height: size - 8)
                .clipShape(Circle())
                .padding(4)
                .background(Circle().fill(Brand.gradient))
                .shadow(color: .black.opacity(0.3), radius: 6, y: 3)
            Triangle()
                .fill(Brand.violet)
                .frame(width: 12, height: 8)
                .offset(y: -1)
        }
        .animation(.snappy, value: selected)
    }
}

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        Path { path in
            path.move(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
            path.closeSubpath()
        }
    }
}

/// The selected pin's party, over the bottom of the map.
private struct MapCard: View {
    let event: Event

    var body: some View {
        HStack(spacing: 12) {
            PartyCover(url: event.coverUrl, title: event.title, showsTitle: false)
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(event.title).font(.headline).foregroundStyle(Color.appText).lineLimit(1)
                Text("\(Formatting.dayLabel(event.startsAt)) · \(Formatting.clockTime(event.startsAt))")
                    .font(.subheadline).foregroundStyle(Color.appSecondaryText)
                Text([event.detailsHidden ? "Private" : event.venueName, event.distanceM.map { Formatting.distance($0) }]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.footnote).foregroundStyle(Color.appSecondaryText).lineLimit(1)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").foregroundStyle(Color.appSecondaryText)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(.regularMaterial))
        .shadow(color: .black.opacity(0.2), radius: 12, y: 4)
    }
}
