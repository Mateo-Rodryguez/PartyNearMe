import Foundation

/// Talks to Supabase Auth (GoTrue) directly; the API only checks the tokens it issues.
struct AuthClient {
    var now: () -> TimeInterval = { Date().timeIntervalSince1970 }

    enum SignUpResult: Equatable {
        case signedIn(Session)
        /// The project requires email confirmation; the user must tap the link first.
        case checkEmail
    }

    func signUp(email: String, password: String) async throws -> SignUpResult {
        let data = try await post("signup", body: Credentials(email: email, password: password))
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        if object?["access_token"] != nil { return .signedIn(try session(from: data)) }
        return .checkEmail
    }

    func signIn(email: String, password: String) async throws -> Session {
        let data = try await post("token", query: [URLQueryItem(name: "grant_type", value: "password")],
                                  body: Credentials(email: email, password: password))
        return try session(from: data)
    }

    /// Emails a link for choosing a new password. Supabase answers the same whether
    /// or not the address has an account, so this doesn't reveal who signed up.
    func recover(email: String, redirectTo: String) async throws {
        _ = try await post("recover", query: [URLQueryItem(name: "redirect_to", value: redirectTo)], body: ["email": email])
    }

    /// The sign-in providers switched on in Supabase, such as "google" or "apple".
    func providers() async throws -> Set<String> {
        var request = URLRequest(url: url("settings"))
        request.setValue(AppConfig.supabaseKey, forHTTPHeaderField: "apikey")
        let data = try await checked(request)
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let external = object?["external"] as? [String: Any] ?? [:]
        return Set(external.compactMap { key, value in (value as? Bool) == true ? key : nil })
    }

    /// Where to send the browser to sign in with `provider`; it comes back to `redirectTo` with a code.
    func authorizeURL(provider: String, redirectTo: String, pkce: PKCE) -> URL {
        url("authorize", query: [
            URLQueryItem(name: "provider", value: provider),
            URLQueryItem(name: "redirect_to", value: redirectTo),
            URLQueryItem(name: "code_challenge", value: pkce.challenge),
            URLQueryItem(name: "code_challenge_method", value: "s256"),
        ])
    }

    /// Swaps the code from a browser sign-in for a session.
    func exchangeCode(_ code: String, pkce: PKCE) async throws -> Session {
        let data = try await post("token", query: [URLQueryItem(name: "grant_type", value: "pkce")],
                                  body: CodeExchange(authCode: code, codeVerifier: pkce.verifier))
        return try session(from: data)
    }

    /// Returns nil when the refresh token is no longer valid.
    func refresh(_ refreshToken: String) async throws -> Session? {
        do {
            let data = try await post("token", query: [URLQueryItem(name: "grant_type", value: "refresh_token")],
                                      body: ["refresh_token": refreshToken])
            return try session(from: data)
        } catch let error as APIError where (400..<500).contains(error.status) {
            return nil
        }
    }

    /// Best effort: the local session is cleared either way.
    func signOut(accessToken: String) async {
        var request = URLRequest(url: url("logout"))
        request.httpMethod = "POST"
        request.setValue(AppConfig.supabaseKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        _ = try? await HTTP.send(request)
    }

    // MARK: - Plumbing

    private func url(_ path: String, query: [URLQueryItem] = []) -> URL {
        var components = URLComponents(string: "\(AppConfig.supabaseBase)/auth/v1/\(path)")!
        if !query.isEmpty { components.queryItems = query }
        return components.url!
    }

    private func post<Body: Encodable>(_ path: String, query: [URLQueryItem] = [], body: Body) async throws -> Data {
        var request = URLRequest(url: url(path, query: query))
        request.httpMethod = "POST"
        request.setValue(AppConfig.supabaseKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSON.encoder.encode(body)
        return try await checked(request)
    }

    private func checked(_ request: URLRequest) async throws -> Data {
        let (data, status) = try await HTTP.send(request)
        guard (200..<300).contains(status) else { throw APIError(status: status, message: Self.authMessage(data)) }
        return data
    }

    private func session(from data: Data) throws -> Session {
        let token = try JSON.decoder.decode(TokenResponse.self, from: data)
        return Session(
            accessToken: token.accessToken,
            refreshToken: token.refreshToken,
            expiresAt: token.expiresAt ?? (now() + token.expiresIn),
            userId: token.user.id,
            email: token.user.email
        )
    }

    private struct Credentials: Encodable { let email: String; let password: String }
    private struct CodeExchange: Encodable { let authCode: String; let codeVerifier: String }
    private struct TokenResponse: Decodable {
        let accessToken: String
        let refreshToken: String
        let expiresIn: TimeInterval
        let expiresAt: TimeInterval?
        let user: User
    }
    private struct User: Decodable { let id: String; let email: String? }

    // MARK: - Reading Supabase's answers

    /// Reads where a browser sign-in came back to: the code on success, or the
    /// provider's error. Supabase puts errors in the query or the fragment.
    static func parseCallback(_ url: URL) -> Result<String, APIError> {
        let failed = APIError(status: 400, message: "Sign-in failed")
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return .failure(failed) }
        let query = components.queryItems ?? []
        var fragment = URLComponents()
        fragment.percentEncodedQuery = components.percentEncodedFragment
        let hash = fragment.queryItems ?? []
        func value(_ name: String, _ items: [URLQueryItem]) -> String? { items.first { $0.name == name }?.value }

        if let code = value("code", query) { return .success(code) }
        let error = value("error_description", query) ?? value("error_description", hash)
            ?? value("error", query) ?? value("error", hash)
        return .failure(APIError(status: 400, message: error?.replacingOccurrences(of: "+", with: " ") ?? failed.message))
    }

    /// Supabase uses a few error shapes over its versions; pick whichever message is there.
    static func authMessage(_ data: Data) -> String {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return "Sign-in failed" }
        guard let raw = ["msg", "error_description", "message", "error"].lazy.compactMap({ object[$0] as? String }).first else {
            return "Sign-in failed"
        }
        if raw.range(of: "Invalid login credentials", options: .caseInsensitive) != nil { return "Wrong email or password" }
        if raw.range(of: "Email not confirmed", options: .caseInsensitive) != nil {
            return "Confirm your email first, using the link we sent you"
        }
        return raw
    }
}
