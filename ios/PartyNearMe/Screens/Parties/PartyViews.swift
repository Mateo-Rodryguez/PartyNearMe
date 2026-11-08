import SwiftUI

/// A party's cover photo, or its title on a gradient when it has none.
struct PartyCover: View {
    let url: String?
    let title: String
    /// Draw the title on the gradient when there's no photo.
    var showsTitle = true

    var body: some View {
        ZStack {
            Covers.gradient(for: title)
            if let url, let link = URL(string: url) {
                RemoteImage(url: link)
            } else if showsTitle {
                Text(title)
                    .font(.system(size: 26, weight: .black))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white.opacity(0.9))
                    .padding(24)
            } else {
                Image(systemName: "party.popper.fill").font(.title2).foregroundStyle(.white.opacity(0.9))
            }
        }
        .clipped()
    }
}

/// The calendar tile on a party: "OCT" over "19".
struct DateTile: View {
    let iso: String

    var body: some View {
        let tile = Formatting.calendarTile(iso)
        VStack(spacing: 0) {
            Text(tile.month).font(.system(size: 11, weight: .heavy)).foregroundStyle(Color.appAccent)
            Text(tile.day).font(.system(size: 22, weight: .heavy)).foregroundStyle(Color.appText)
        }
        .frame(width: 52, height: 56)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.regularMaterial))
        .accessibilityElement(children: .combine)
    }
}

/// Small overlapping pictures of friends going, and who they are.
struct FriendsGoing: View {
    let friends: [Person]
    let count: Int

    var body: some View {
        if !friends.isEmpty {
            HStack(spacing: 8) {
                HStack(spacing: -8) {
                    ForEach(friends.prefix(3)) { friend in
                        Avatar(url: friend.avatarUrl, name: friend.name, size: 24)
                            .overlay(Circle().strokeBorder(Color.appBackground, lineWidth: 2))
                    }
                }
                Text(text).font(.footnote).foregroundStyle(Color.appSecondaryText).lineLimit(1)
            }
        }
    }

    private var text: String {
        let first = friends[0].displayName ?? friends[0].username ?? "A friend"
        let others = max(count, friends.count) - 1
        switch others {
        case 0: return "\(first) is going"
        case 1: return "\(first) and 1 friend are going"
        default: return "\(first) and \(others) friends are going"
        }
    }
}

/// A party in a list: cover with its date and distance, your RSVP, title, time and venue.
struct EventCard: View {
    let event: Event

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            PartyCover(url: event.coverUrl, title: event.title)
                .frame(height: 190)
                .overlay(alignment: .topLeading) { DateTile(iso: event.startsAt).padding(12) }
                .overlay(alignment: .topTrailing) {
                    if let distance = event.distanceM {
                        Pill(text: Formatting.distance(distance), systemImage: "location.fill").padding(12)
                    }
                }
                .overlay(alignment: .bottomLeading) {
                    HStack(spacing: 6) {
                        if event.isCancelled {
                            Pill(text: "Cancelled", systemImage: "xmark.circle.fill", tint: .appError)
                        } else if let rsvp = event.myRsvp {
                            Pill(text: rsvpLabel(rsvp), systemImage: rsvp == "going" ? "checkmark.circle.fill" : "star.fill", tint: .appAccent)
                        }
                        if event.isPrivate { Pill(text: "Private", systemImage: "lock.fill") }
                    }
                    .padding(12)
                }
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(event.title).font(.headline).foregroundStyle(Color.appText).lineLimit(2)
                Text(subtitle).font(.subheadline).foregroundStyle(Color.appSecondaryText).lineLimit(1)
                HStack {
                    FriendsGoing(friends: event.friendsGoing, count: event.friendsGoingCount)
                    Spacer(minLength: 8)
                    if event.friendsGoing.isEmpty, event.goingCount > 0 {
                        Text("\(Formatting.compactCount(event.goingCount)) going")
                            .font(.footnote).foregroundStyle(Color.appSecondaryText)
                    }
                }
                .padding(.top, 2)
            }
            .padding(.horizontal, 4)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private var subtitle: String {
        let place = event.detailsHidden ? "Location after you're in" : event.venueName
        return [Formatting.dayLabel(event.startsAt) + " · " + Formatting.clockTime(event.startsAt), place]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

func rsvpLabel(_ rsvp: String) -> String {
    switch rsvp {
    case "going": return "Going"
    case "requested": return "Requested"
    default: return "Interested"
    }
}

/// A short label on top of a photo.
struct Pill: View {
    let text: String
    var systemImage: String?
    var tint: Color?

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage { Image(systemName: systemImage).font(.caption2.weight(.bold)) }
            Text(text).font(.caption.weight(.semibold)).lineLimit(1)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background {
            if let tint { Capsule().fill(tint) } else { Capsule().fill(.black.opacity(0.55)) }
        }
    }
}
