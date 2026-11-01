import CoreLocation
import PhotosUI
import SwiftUI

/// The "+" tab: pick or take up to ten photos, write a caption, and share.
struct NewPostView: View {
    @Environment(AppModel.self) private var app
    /// Called once the post is made, so Home can refresh and show it.
    let onPosted: () -> Void

    static let maxPhotos = 10

    @State private var picked: [PhotosPickerItem] = []
    @State private var photos: [PickedPhoto] = []
    @State private var caption = ""
    @State private var place = ""
    @State private var addLocation = true
    @State private var showCamera = false
    @State private var loadingPhotos = false
    @State private var progress: Double?
    @State private var error: String?

    private var sharing: Bool { progress != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if photos.isEmpty {
                    emptyPicker
                } else {
                    photoStrip
                }
                PartyField("Caption", text: $caption, prompt: "Write a caption…")
                    .textInputAutocapitalization(.sentences)
                    .onChange(of: caption) { _, new in if new.count > 2200 { caption = String(new.prefix(2200)) } }
                PartyField("Place (optional)", text: $place, prompt: "e.g. Fabric, London")
                    .textInputAutocapitalization(.words)
                    .onChange(of: place) { _, new in if new.count > 120 { place = String(new.prefix(120)) } }
                Toggle(isOn: $addLocation) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Show it to people nearby").font(.subheadline.weight(.semibold))
                        Text("Adds where you are to the post").font(.caption).foregroundStyle(Color.appSecondaryText)
                    }
                }
                .tint(Color.appAccent)
                .padding(.vertical, 4)
                ErrorText(message: error)
            }
            .padding(20)
            .padding(.bottom, 96)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(AppBackground())
        .safeAreaInset(edge: .bottom) { shareBar }
        .navigationTitle("New post")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: picked) { _, items in Task { await load(items) } }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                if photos.count < Self.maxPhotos, let photo = PickedPhoto.make(from: image) { photos.append(photo) }
            }
            .ignoresSafeArea()
        }
    }

    private var emptyPicker: some View {
        VStack(spacing: 12) {
            Circle()
                .fill(Brand.gradient)
                .frame(width: 64, height: 64)
                .overlay { Image(systemName: "plus").font(.title.weight(.semibold)).foregroundStyle(.white) }
            Text("Share your night").headingStyle(.headline2)
            Text("Add up to \(Self.maxPhotos) photos.").secondaryStyle()
            HStack(spacing: 10) {
                PhotosPicker(selection: $picked, maxSelectionCount: Self.maxPhotos, matching: .images) {
                    Label(loadingPhotos ? "Loading…" : "Choose photos", systemImage: "photo.on.rectangle")
                        .font(.body.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .frame(minHeight: 52)
                        .background(Capsule().fill(Brand.gradient))
                }
                if CameraPicker.isAvailable {
                    SecondaryButton("Camera", systemImage: "camera", fullWidth: false) { showCamera = true }
                }
            }
            .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.vertical, 32)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color.appField))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Color.appDivider))
    }

    private var photoStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Array(photos.enumerated()), id: \.element.id) { index, photo in
                    Image(uiImage: photo.preview)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 136, height: 170)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(alignment: .topTrailing) {
                            if !sharing {
                                Button { withAnimation { photos.removeAll { $0.id == photo.id } } } label: {
                                    Image(systemName: "xmark")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(.white)
                                        .frame(width: 28, height: 28)
                                        .background(.black.opacity(0.6), in: Circle())
                                }
                                .padding(6)
                                .accessibilityLabel("Remove photo \(index + 1)")
                            }
                        }
                }
                if photos.count < Self.maxPhotos && !sharing {
                    PhotosPicker(selection: $picked, maxSelectionCount: Self.maxPhotos - photos.count, matching: .images) {
                        addTile("Add more", systemImage: "plus")
                    }
                    if CameraPicker.isAvailable {
                        Button { showCamera = true } label: { addTile("Camera", systemImage: "camera") }
                    }
                }
            }
        }
    }

    private func addTile(_ title: String, systemImage: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: systemImage).font(.title3)
            Text(title).font(.caption.weight(.semibold))
        }
        .foregroundStyle(Color.appText)
        .frame(width: 104, height: 170)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.appField))
    }

    private var shareBar: some View {
        VStack(spacing: 10) {
            if let progress {
                ProgressView(value: progress).tint(Color.appAccent)
            }
            PrimaryButton(sharing ? "Sharing…" : "Share", busy: sharing, action: share)
                .disabled(photos.isEmpty && !sharing)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(.bar)
    }

    /// Turns the picker's choices into photos, then clears it so the same photo can be picked again.
    private func load(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        loadingPhotos = true
        for item in items where photos.count < Self.maxPhotos {
            if let data = try? await item.loadTransferable(type: Data.self),
               let photo = await Task.detached(priority: .userInitiated, operation: { PickedPhoto.make(from: data) }).value {
                photos.append(photo)
            }
        }
        picked = []
        loadingPhotos = false
    }

    private func share() {
        guard !photos.isEmpty, !sharing else { return }
        error = nil
        progress = 0
        let toSend = photos
        Task {
            do {
                var ids: [String] = []
                for photo in toSend {
                    ids.append(try await app.api.uploadPhoto(photo.jpeg))
                    progress = Double(ids.count) / Double(toSend.count + 1)
                }
                var here: CLLocationCoordinate2D?
                if addLocation { here = await app.location.current() }
                let trimmedCaption = caption.trimmingCharacters(in: .whitespacesAndNewlines)
                let trimmedPlace = place.trimmingCharacters(in: .whitespacesAndNewlines)
                _ = try await app.api.createPost(NewPost(
                    uploadIds: ids,
                    caption: trimmedCaption.isEmpty ? nil : trimmedCaption,
                    lat: here?.latitude,
                    lng: here?.longitude,
                    placeName: trimmedPlace.isEmpty ? nil : trimmedPlace
                ))
                photos = []
                caption = ""
                place = ""
                app.show("Posted. It shows up for everyone once the photo is checked.")
                onPosted()
            } catch {
                self.error = error.userMessage
            }
            progress = nil
        }
    }
}
