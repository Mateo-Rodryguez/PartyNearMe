import Foundation

/// New chat messages as they're sent.
@MainActor
protocol LiveMessages: AnyObject {
    /// In one conversation, or in all of the user's chats when `conversationId` is nil.
    /// Reconnects by itself until the caller stops listening.
    func messages(in conversationId: String?) -> AsyncStream<ChatMessage>
}

/// Live chat through Supabase Realtime. The socket signs in with the user's own
/// token, so Postgres row-level security decides which messages arrive, exactly
/// as it does for the API.
@MainActor
final class Realtime: LiveMessages {
    private let sessions: SessionManager
    private static let heartbeat: Duration = .seconds(25)
    /// Its own session: the API's has a two-minute limit per task, and a socket stays open for hours.
    private static let socketSession = URLSession(configuration: .default)

    init(sessions: SessionManager) {
        self.sessions = sessions
    }

    private var url: URL {
        let base = AppConfig.supabaseBase.replacingOccurrences(of: "https://", with: "wss://")
        return URL(string: "\(base)/realtime/v1/websocket?apikey=\(AppConfig.supabaseKey)&vsn=1.0.0")!
    }

    func messages(in conversationId: String?) -> AsyncStream<ChatMessage> {
        AsyncStream { continuation in
            let task = Task { [weak self] in
                var failures = 0
                while !Task.isCancelled, let self {
                    do {
                        try await self.listen(conversationId: conversationId) { message in
                            failures = 0
                            continuation.yield(message)
                        }
                    } catch is SignedOutError {
                        break
                    } catch {
                        // Offline or the server restarted: try again after a pause.
                    }
                    if Task.isCancelled { break }
                    let wait = min(30, 1 << min(failures, 5))
                    failures += 1
                    try? await Task.sleep(for: .seconds(wait))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// One connection: joins the channel, keeps it alive, and hands on new messages until it drops.
    private func listen(conversationId: String?, onMessage: @escaping (ChatMessage) -> Void) async throws {
        let topic = "realtime:messages:\(conversationId ?? "all")"
        let socket = Self.socketSession.webSocketTask(with: url)
        socket.resume()
        defer { socket.cancel(with: .goingAway, reason: nil) }
        let token = try await sessions.accessToken()
        try await socket.send(.string(Phoenix.join(topic: topic, conversationId: conversationId, token: token)))

        let sessions = sessions
        let keepAlive = Task {
            var token = token
            var ref = 1
            while !Task.isCancelled {
                try await Task.sleep(for: Self.heartbeat)
                ref += 1
                try await socket.send(.string(Phoenix.heartbeat(ref: ref)))
                // Realtime drops the channel when the token expires, so hand it fresh ones.
                let fresh = try await sessions.accessToken()
                if fresh != token {
                    token = fresh
                    try await socket.send(.string(Phoenix.accessToken(topic: topic, token: fresh)))
                }
            }
        }
        defer { keepAlive.cancel() }

        try await withTaskCancellationHandler {
            while true {
                let frame = try await socket.receive()
                if case .string(let text) = frame, let message = Phoenix.parseInsert(text) { onMessage(message) }
            }
        } onCancel: {
            socket.cancel(with: .goingAway, reason: nil)
        }
    }
}

/// The bits of the Phoenix channel protocol that Supabase Realtime speaks.
enum Phoenix {
    static func join(topic: String, conversationId: String?, token: String) -> String {
        var change: [String: Any] = ["event": "INSERT", "schema": "public", "table": "messages"]
        if let conversationId { change["filter"] = "conversation_id=eq.\(conversationId)" }
        return encode([
            "topic": topic, "event": "phx_join", "ref": "1", "join_ref": "1",
            "payload": [
                "config": ["broadcast": ["self": false], "presence": ["key": ""], "postgres_changes": [change]],
                "access_token": token,
            ],
        ])
    }

    static func heartbeat(ref: Int) -> String {
        encode(["topic": "phoenix", "event": "heartbeat", "payload": [String: Any](), "ref": String(ref)])
    }

    static func accessToken(topic: String, token: String) -> String {
        encode(["topic": topic, "event": "access_token", "payload": ["access_token": token]])
    }

    /// The new message from a postgres_changes INSERT, or nil for anything else.
    static func parseInsert(_ text: String) -> ChatMessage? {
        guard let frame = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any],
              frame["event"] as? String == "postgres_changes",
              let data = (frame["payload"] as? [String: Any])?["data"] as? [String: Any],
              data["type"] as? String == "INSERT" || data["eventType"] as? String == "INSERT",
              let row = (data["record"] ?? data["new"]) as? [String: Any],
              let id = string(row["id"]), let conversationId = string(row["conversation_id"]),
              let senderId = string(row["sender_id"]), let body = row["body"] as? String,
              let createdAt = row["created_at"] as? String
        else { return nil }
        return ChatMessage(id: id, conversationId: conversationId, senderId: senderId, body: body,
                           createdAt: isoUTC(createdAt), eventId: string(row["event_id"]))
    }

    /// Ids may come as numbers or text.
    private static func string(_ value: Any?) -> String? {
        switch value {
        case let text as String: return text
        case let number as NSNumber: return number.stringValue
        default: return nil
        }
    }

    /// Postgres sends "2026-10-12 19:00:00.123456+00" style times; the app expects ISO-8601.
    static func isoUTC(_ value: String) -> String {
        var s = value.replacingOccurrences(of: " ", with: "T")
        if s.range(of: #"[+-]\d{2}$"#, options: .regularExpression) != nil { s += ":00" }
        return s.replacingOccurrences(of: "+00:00", with: "Z")
    }

    private static func encode(_ object: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return "{}" }
        return String(decoding: data, as: UTF8.self)
    }
}
