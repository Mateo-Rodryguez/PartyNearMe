import SwiftUI

/// Someone's followers, or who they follow.
struct PeopleListView: View {
    @Environment(AppModel.self) private var app
    let userId: String
    let followers: Bool
    let title: String

    @State private var paged: Paged<ListedPerson>?

    var body: some View {
        Group {
            if let paged {
                List(paged.items) { person in
                    NavigationLink(value: Route.user(person.id)) { PersonRow(person: person) }
                        .listRowBackground(Color.clear)
                        .onAppear { paged.onAppear(person) }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .overlay {
                    if paged.items.isEmpty {
                        if !paged.loadedOnce {
                            ProgressView()
                        } else if let error = paged.error {
                            ListMessage(text: error) { Task { await paged.refresh() } }
                        } else {
                            ContentUnavailableView(followers ? "No followers yet" : "Not following anyone yet",
                                                   systemImage: "person.2")
                        }
                    }
                }
                .refreshable { await paged.refresh() }
            }
        }
        .background(AppBackground())
        .navigationTitle(followers ? "Followers" : "Following")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard paged == nil else { return }
            let api = app.api
            let id = userId
            let followers = followers
            let loader = Paged<ListedPerson> { cursor in
                let page: PeoplePage
                if followers {
                    page = try await api.followers(id, cursor: cursor)
                } else {
                    page = try await api.following(id, cursor: cursor)
                }
                return (page.users, page.nextCursor)
            }
            paged = loader
            await loader.refresh()
        }
    }
}

/// Someone in a list: picture, name with their heart, and @username.
struct PersonRow: View {
    let person: ListedPerson

    var body: some View {
        HStack(spacing: 12) {
            Avatar(url: person.avatarUrl, name: person.name, size: 44)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(person.name).font(.subheadline.weight(.semibold)).foregroundStyle(Color.appText)
                    RelationshipHeart(status: person.relationshipStatus, size: 13)
                }
                if let username = person.username {
                    Text("@\(username)").font(.caption).foregroundStyle(Color.appSecondaryText)
                }
            }
            Spacer()
            if person.isFollowing == true {
                Text("Following").font(.caption.weight(.semibold)).foregroundStyle(Color.appSecondaryText)
            }
        }
        .padding(.vertical, 2)
    }
}
