import Foundation
import Security

struct Session: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    /// Seconds since 1970 when `accessToken` stops working.
    let expiresAt: TimeInterval
    let userId: String
    let email: String?
}

/// Keeps the session across app restarts.
protocol SessionStore {
    func load() -> Session?
    func save(_ session: Session?)
}

/// The session lives in the Keychain, the place iOS keeps secrets, not in plain settings.
struct KeychainSessionStore: SessionStore {
    private let service = "com.partynearme.app"
    private let account = "session"

    init() {
        // Keychain items outlive the app. After a reinstall start signed out, as people expect.
        let installedKey = "installed"
        if !UserDefaults.standard.bool(forKey: installedKey) {
            SecItemDelete(baseQuery as CFDictionary)
            UserDefaults.standard.set(true, forKey: installedKey)
        }
    }

    func load() -> Session? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(Session.self, from: data)
    }

    func save(_ session: Session?) {
        SecItemDelete(baseQuery as CFDictionary)
        guard let session, let data = try? JSONEncoder().encode(session) else { return }
        var query = baseQuery
        query[kSecValueData as String] = data
        // Readable after the first unlock, so a background refresh still works.
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(query as CFDictionary, nil)
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

/// For tests and the screenshot demo.
final class MemorySessionStore: SessionStore {
    private var session: Session?
    init(_ session: Session? = nil) { self.session = session }
    func load() -> Session? { session }
    func save(_ session: Session?) { self.session = session }
}
