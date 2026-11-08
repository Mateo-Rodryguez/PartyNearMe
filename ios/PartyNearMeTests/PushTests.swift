import XCTest
@testable import PartyNearMe

final class PushTests: XCTestCase {
    func testTokenIsLowercaseHex() {
        XCTAssertEqual(PushDelegate.hex(Data([0x00, 0xab, 0x10, 0xff])), "00ab10ff")
    }

    func testCustomKeysAreKeptAndApsIsDropped() {
        let info: [AnyHashable: Any] = ["aps": ["alert": "hi"], "type": "message", "conversation_id": "c1", "count": 3]
        XCTAssertEqual(PushDelegate.strings(info), ["type": "message", "conversation_id": "c1"])
    }

    func testNotificationsOpenTheSameScreensAsOnAndroid() {
        XCTAssertEqual(PushTarget(["type": "message", "conversation_id": "c1"]), .chat("c1"))
        XCTAssertEqual(PushTarget(["type": "comment", "post_id": "p1"]), .comments("p1"))
        XCTAssertEqual(PushTarget(["type": "tag", "post_id": "p1"]), .post("p1"))
        XCTAssertEqual(PushTarget(["type": "event_reminder", "event_id": "e1"]), .party("e1"))
        XCTAssertNil(PushTarget(["type": "message"]))
        XCTAssertNil(PushTarget(["type": "something_new", "event_id": "e1"]))
    }
}
