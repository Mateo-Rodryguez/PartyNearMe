import Foundation

/// Everything the screens ask the server for. The real one is `APIClient`; the
/// screenshot demo swaps in sample data.
@MainActor
protocol PartyAPI: AnyObject {
    func me() async throws -> OwnProfile
    func updateMe(_ update: ProfileUpdate) async throws -> OwnProfile
    func interests() async throws -> [Interest]
    func setInterests(_ ids: [Int]) async throws -> OwnProfile
    func registerDevice(token: String, platform: String) async throws
    func unregisterDevice(token: String) async throws
}

/// The PartyNearMe API. Every call is signed in; a 401 triggers one token refresh and a retry.
@MainActor
final class APIClient: PartyAPI {
    private let sessions: SessionManager

    init(sessions: SessionManager) {
        self.sessions = sessions
    }

    // MARK: People

    func me() async throws -> OwnProfile { try await call("GET", "/me") }

    func updateMe(_ update: ProfileUpdate) async throws -> OwnProfile {
        try await call("PATCH", "/me", body: update)
    }

    func interests() async throws -> [Interest] { try await call("GET", "/interests") }

    func setInterests(_ ids: [Int]) async throws -> OwnProfile {
        try await call("PUT", "/me/interests", body: InterestIds(interestIds: ids))
    }

    // MARK: Push

    func registerDevice(token: String, platform: String) async throws {
        try await callUnit("PUT", "/devices/\(token.pathEscaped)", body: DeviceBody(platform: platform))
    }

    func unregisterDevice(token: String) async throws {
        try await callUnit("DELETE", "/devices/\(token.pathEscaped)")
    }

    // MARK: Plumbing

    private func call<T: Decodable>(_ method: String, _ path: String, query: [URLQueryItem] = []) async throws -> T {
        try JSON.decoder.decode(T.self, from: try await send(method, path, query: query, body: nil))
    }

    private func call<T: Decodable, B: Encodable>(_ method: String, _ path: String, body: B) async throws -> T {
        try JSON.decoder.decode(T.self, from: try await send(method, path, query: [], body: try JSON.encoder.encode(body)))
    }

    private func callUnit(_ method: String, _ path: String, query: [URLQueryItem] = []) async throws {
        _ = try await send(method, path, query: query, body: nil)
    }

    private func callUnit<B: Encodable>(_ method: String, _ path: String, body: B) async throws {
        _ = try await send(method, path, query: [], body: try JSON.encoder.encode(body))
    }

    private func send(_ method: String, _ path: String, query: [URLQueryItem], body: Data?) async throws -> Data {
        var components = URLComponents(string: AppConfig.apiBase + path)!
        let items = query.filter { $0.value != nil }
        if !items.isEmpty { components.queryItems = items }
        let url = components.url!

        func attempt(_ token: String) async throws -> (Data, Int) {
            var request = URLRequest(url: url)
            request.httpMethod = method
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            if let body {
                request.httpBody = body
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            }
            return try await HTTP.send(request)
        }

        let token = try await sessions.accessToken()
        var (data, status) = try await attempt(token)
        if status == 401 { (data, status) = try await attempt(try await sessions.refresh(stale: token)) }
        guard (200..<300).contains(status) else { throw APIError(status: status, message: Self.errorMessage(status: status, data: data)) }
        return data
    }

    nonisolated static func errorMessage(status: Int, data: Data) -> String {
        if status >= 500 { return "Something went wrong on our side. Try again in a moment." }
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        if let message = object?["message"] as? String { return message }
        return "Request failed (\(status))"
    }

    private struct InterestIds: Encodable { let interestIds: [Int] }
    private struct DeviceBody: Encodable { let platform: String }
}
