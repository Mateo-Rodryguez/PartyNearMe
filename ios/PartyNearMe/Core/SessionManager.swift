import Foundation
import Observation

/// Owns the current session: hands out a fresh access token, refreshing it
/// shortly before it expires, with one refresh at a time.
@MainActor
@Observable
final class SessionManager {
    private(set) var session: Session?

    private let auth: AuthClient
    private let store: SessionStore
    @ObservationIgnored private var refreshing: Task<String, Error>?

    /// A token must stay valid for at least this long, or it's refreshed first.
    private let margin: TimeInterval = 60

    init(auth: AuthClient = AuthClient(), store: SessionStore) {
        self.auth = auth
        self.store = store
        session = store.load()
    }

    func signIn(email: String, password: String) async throws {
        set(try await auth.signIn(email: email, password: password))
    }

    /// Returns false when the user has to confirm their email before signing in.
    func signUp(email: String, password: String) async throws -> Bool {
        switch try await auth.signUp(email: email, password: password) {
        case .signedIn(let session):
            set(session)
            return true
        case .checkEmail:
            return false
        }
    }

    /// Signs in with Google (or another provider) in a browser sheet. `openBrowser` shows
    /// the page and returns the address it came back to, or nil if the user closed it.
    /// Returns false when they gave up.
    func signIn(with provider: String, openBrowser: (URL) async throws -> URL?) async throws -> Bool {
        let pkce = PKCE()
        guard let back = try await openBrowser(auth.authorizeURL(provider: provider, redirectTo: AppConfig.authCallback, pkce: pkce))
        else { return false }
        let code = try AuthClient.parseCallback(back).get()
        set(try await auth.exchangeCode(code, pkce: pkce))
        return true
    }

    func signOut() async {
        guard let current = session else { return }
        set(nil)
        await auth.signOut(accessToken: current.accessToken)
    }

    /// Drops the local session without telling the server, e.g. after the account was deleted.
    func forget() { set(nil) }

    /// A token that is valid for at least another minute.
    func accessToken() async throws -> String {
        guard let current = session else { throw SignedOutError() }
        if current.expiresAt - auth.now() > margin { return current.accessToken }
        return try await refresh(stale: current.accessToken)
    }

    /// Gets a new access token. `stale` is the token that just failed, so a caller
    /// that lost the race to another refresh reuses its result.
    func refresh(stale: String) async throws -> String {
        if let refreshing { return try await refreshing.value }
        guard let current = session else { throw SignedOutError() }
        if current.accessToken != stale && current.expiresAt - auth.now() > margin { return current.accessToken }
        let task = Task { () throws -> String in
            guard let renewed = try await auth.refresh(current.refreshToken) else {
                set(nil)
                throw SignedOutError()
            }
            set(renewed)
            return renewed.accessToken
        }
        refreshing = task
        defer { refreshing = nil }
        return try await task.value
    }

    private func set(_ session: Session?) {
        store.save(session)
        self.session = session
    }
}
