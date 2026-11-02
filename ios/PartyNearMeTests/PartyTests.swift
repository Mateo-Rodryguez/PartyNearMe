import XCTest
@testable import PartyNearMe

final class PartyTests: XCTestCase {
    private var london: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/London")!
        return calendar
    }()

    private func date(_ iso: String) -> Date { Formatting.date(iso)! }

    func testEventDecodesAndFillsInMissingFields() throws {
        let json = #"""
        {"id":"e1","organiser":{"id":"u1","username":"sam","display_name":"Sam","avatar_url":null},
         "title":"Rooftop","starts_at":"2026-11-06T22:00:00Z","lat":51.5,"lng":-0.12,"status":"published",
         "going_count":3,"interested_count":1,"created_at":"2026-11-01T20:00:00Z","distance_m":640}
        """#
        let event = try JSON.decoder.decode(Event.self, from: Data(json.utf8))
        XCTAssertEqual(event.organiser.name, "Sam")
        XCTAssertFalse(event.isPrivate)
        XCTAssertFalse(event.detailsHidden)
        XCTAssertEqual(event.friendsGoing, [])
        XCTAssertEqual(event.distanceM, 640)
        XCTAssertTrue(event.isPublished)
    }

    func testNewEventLeavesOutEmptyFields() throws {
        let body = NewEvent(title: "Party", startsAt: "2026-11-06T22:00:00Z", isPrivate: false, lat: 1, lng: 2)
        let json = try XCTUnwrap(String(data: JSON.encoder.encode(body), encoding: .utf8))
        XCTAssertTrue(json.contains(#""starts_at":"2026-11-06T22:00:00Z""#))
        XCTAssertTrue(json.contains(#""is_private":false"#))
        XCTAssertFalse(json.contains("venue_name"))
        XCTAssertFalse(json.contains("interest_id"))
    }

    func testDistance() {
        XCTAssertEqual(Formatting.distance(nil), "")
        XCTAssertEqual(Formatting.distance(640, miles: false), "650 m away")
        XCTAssertEqual(Formatting.distance(10, miles: false), "50 m away")
        XCTAssertEqual(Formatting.distance(2300, miles: false), "2.3 km away")
        XCTAssertEqual(Formatting.distance(1960, miles: false), "2 km away")
        XCTAssertEqual(Formatting.distance(640, miles: true), "0.4 mi away")
        XCTAssertEqual(Formatting.distance(10, miles: true), "0.1 mi away")
        XCTAssertEqual(Formatting.distance(3219, miles: true), "2 mi away")
    }

    func testDayLabels() {
        let now = date("2026-11-04T15:00:00Z") // a Wednesday
        XCTAssertEqual(Formatting.dayLabel("2026-11-04T22:00:00Z", now: now, calendar: london), "Tonight")
        XCTAssertEqual(Formatting.dayLabel("2026-11-05T21:00:00Z", now: now, calendar: london), "Tomorrow")
        XCTAssertEqual(Formatting.dayLabel("2026-11-07T21:00:00Z", now: now, calendar: london), "Sat 7 Nov")
        let tile = Formatting.calendarTile("2026-09-19T21:00:00Z", calendar: london)
        XCTAssertEqual(tile.month, "SEP")
        XCTAssertEqual(tile.day, "19")
    }

    func testTonightRunsUntilSixInTheMorning() {
        let evening = PartyTime.tonight(now: date("2026-11-04T20:00:00Z"), calendar: london)
        XCTAssertEqual(evening.to, date("2026-11-05T06:00:00Z"))
        let lateNight = PartyTime.tonight(now: date("2026-11-05T02:00:00Z"), calendar: london)
        XCTAssertEqual(lateNight.to, date("2026-11-05T06:00:00Z"))
    }

    func testWeekendIsFridayEveningToMondayMorning() {
        let wednesday = PartyTime.weekend(now: date("2026-11-04T15:00:00Z"), calendar: london)
        XCTAssertEqual(wednesday.from, date("2026-11-06T17:00:00Z"))
        XCTAssertEqual(wednesday.to, date("2026-11-09T06:00:00Z"))
        // Under way: it starts now and ends the same Monday.
        let saturday = date("2026-11-07T13:00:00Z")
        let during = PartyTime.weekend(now: saturday, calendar: london)
        XCTAssertEqual(during.from, saturday)
        XCTAssertEqual(during.to, date("2026-11-09T06:00:00Z"))
        // Monday at 3am still counts as the weekend; Monday afternoon looks ahead.
        XCTAssertEqual(PartyTime.weekend(now: date("2026-11-09T03:00:00Z"), calendar: london).to, date("2026-11-09T06:00:00Z"))
        XCTAssertEqual(PartyTime.weekend(now: date("2026-11-09T15:00:00Z"), calendar: london).from, date("2026-11-13T17:00:00Z"))
    }

    func testNewPartiesDefaultToNineTonight() {
        let afternoon = EventFormView.defaultStart(now: date("2026-11-04T15:00:00Z"), calendar: london)
        XCTAssertEqual(afternoon, date("2026-11-04T21:00:00Z"))
        let late = EventFormView.defaultStart(now: date("2026-11-04T22:00:00Z"), calendar: london)
        XCTAssertEqual(late, date("2026-11-05T21:00:00Z"))
    }

    func testPartyLengthPicksTheClosestChoice() {
        let event = Event(id: "e", organiser: Person(id: "u"), title: "P", startsAt: "2026-11-04T21:00:00Z",
                          endsAt: "2026-11-05T02:30:00Z", lat: 0, lng: 0, createdAt: "2026-11-01T00:00:00Z")
        XCTAssertEqual(EventFormView.hours(of: event), 6)
    }
}
