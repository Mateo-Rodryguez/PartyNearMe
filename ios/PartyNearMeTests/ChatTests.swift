import XCTest
@testable import PartyNearMe

@MainActor
final class ChatTests: XCTestCase {
    private let id = "3f1c2a9e-5b7d-4c1e-9a2b-6d8e0f1a2b3c"

    func testDeepLinks() {
        XCTAssertEqual(DeepLink.parse(URL(string: "partynearme://party/\(id)")!), .party(id))
        XCTAssertEqual(DeepLink.parse(URL(string: "partynearme://post/\(id)")!), .post(id))
        XCTAssertEqual(DeepLink.parse(URL(string: "https://partynearme-api.onrender.com/e/\(id)")!), .party(id))
        XCTAssertEqual(DeepLink.parse(URL(string: "https://partynearme-api.onrender.com/p/\(id)?ref=share")!), .post(id))
        XCTAssertNil(DeepLink.parse(URL(string: "partynearme://auth-callback?code=abc")!))
        XCTAssertNil(DeepLink.parse(URL(string: "partynearme://party/not-an-id")!))
        XCTAssertNil(DeepLink.parse(URL(string: "https://example.com/x/\(id)")!))
    }

    func testRealtimeInsertBecomesAMessage() throws {
        let frame = #"""
        {"event":"postgres_changes","topic":"realtime:messages:all","payload":{"data":{"type":"INSERT",
         "record":{"id":42,"conversation_id":"c1","sender_id":"u1","body":"hi","created_at":"2026-10-12 19:00:00.123+00","event_id":null}}}}
        """#
        let message = try XCTUnwrap(Phoenix.parseInsert(frame))
        XCTAssertEqual(message.id, "42")
        XCTAssertEqual(message.conversationId, "c1")
        XCTAssertEqual(message.body, "hi")
        XCTAssertEqual(message.createdAt, "2026-10-12T19:00:00.123Z")
        XCTAssertNil(message.eventId)
    }

    func testRealtimeIgnoresOtherFrames() {
        XCTAssertNil(Phoenix.parseInsert(#"{"event":"phx_reply","payload":{"status":"ok"}}"#))
        XCTAssertNil(Phoenix.parseInsert("not json"))
    }

    func testJoinAsksForOneConversationsInserts() throws {
        let text = Phoenix.join(topic: "realtime:messages:c1", conversationId: "c1", token: "t")
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any])
        XCTAssertEqual(json["event"] as? String, "phx_join")
        let payload = try XCTUnwrap(json["payload"] as? [String: Any])
        XCTAssertEqual(payload["access_token"] as? String, "t")
        let changes = try XCTUnwrap((payload["config"] as? [String: Any])?["postgres_changes"] as? [[String: Any]])
        XCTAssertEqual(changes.first?["filter"] as? String, "conversation_id=eq.c1")
        XCTAssertEqual(changes.first?["table"] as? String, "messages")
    }

    func testConversationDecodesWithDefaults() throws {
        let json = #"{"id":"c1","other":{"id":"u1","username":"sam"},"unread_count":2}"#
        let conversation = try JSON.decoder.decode(Conversation.self, from: Data(json.utf8))
        XCTAssertEqual(conversation.title, "@sam")
        XCTAssertEqual(conversation.members, [])
        XCTAssertEqual(conversation.unreadCount, 2)
    }

    func testMessagesOrderByNumericId() {
        let nine = ChatMessage(id: "9", conversationId: "c", senderId: "u", body: "", createdAt: "")
        let ten = ChatMessage(id: "10", conversationId: "c", senderId: "u", body: "", createdAt: "")
        XCTAssertGreaterThan(ten.order, nine.order)
    }

    func testNotificationsDecode() throws {
        let json = #"{"notifications":[{"id":"n1","type":"like","actor":{"id":"u1","display_name":"Sam"},"created_at":"2026-10-12T19:00:00Z","unread":true}],"unread_count":1}"#
        let page = try JSON.decoder.decode(NotificationPage.self, from: Data(json.utf8))
        XCTAssertEqual(page.unreadCount, 1)
        XCTAssertEqual(page.notifications.first?.actor?.name, "Sam")
        XCTAssertTrue(page.notifications.first?.unread ?? false)
    }

    func testInviteResultText() {
        XCTAssertEqual(InviteView.resultText(sent: 1, skipped: 0), "Invite sent")
        XCTAssertEqual(InviteView.resultText(sent: 3, skipped: 1), "3 invites sent. 1 person can't get messages from you.")
        XCTAssertEqual(InviteView.resultText(sent: 0, skipped: 2), "No invites sent. 2 people can't get messages from you.")
    }
}
