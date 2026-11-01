import CryptoKit
import Foundation

/// Proof Key for Code Exchange (RFC 7636): signing in through the browser hands
/// back a one-time code, which only the app that started the sign-in can swap
/// for a session, because only it knows `verifier`.
struct PKCE {
    let verifier: String
    let challenge: String

    init(verifier: String = PKCE.randomVerifier()) {
        self.verifier = verifier
        challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
    }

    /// 32 bytes from the system's secure random: 43 characters (43 to 128 are allowed).
    static func randomVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URL
    }
}

extension Data {
    /// Base64url without padding, as PKCE wants it.
    var base64URL: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
