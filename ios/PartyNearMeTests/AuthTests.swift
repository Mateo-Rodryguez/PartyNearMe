import XCTest
@testable import PartyNearMe

final class AuthTests: XCTestCase {
    func testPkceChallengeIsBase64UrlSha256OfTheVerifier() {
        // Worked out separately with Python's hashlib and base64.urlsafe_b64encode, padding dropped.
        let pkce = PKCE(verifier: "dBjftJeZ4CVP-mJ92K9GJQBXcNmpypEEpqAn7XRVnYpUSEFg")
        XCTAssertEqual(pkce.challenge, "631VVsMrC9p6eUv3QurezgHPrzIBCMoEkEAyPXTnZxU")
    }

    func testRandomVerifiersAreLongEnoughAndDiffer() {
        let first = PKCE.randomVerifier()
        XCTAssertGreaterThanOrEqual(first.count, 43)
        XCTAssertNotEqual(first, PKCE.randomVerifier())
        XCTAssertNil(first.rangeOfCharacter(from: CharacterSet(charactersIn: "+/=")))
    }

    func testCallbackWithCodeGivesTheCode() throws {
        let url = URL(string: "partynearme://auth-callback?code=abc123")!
        XCTAssertEqual(try AuthClient.parseCallback(url).get(), "abc123")
    }

    func testCallbackErrorsComeFromQueryOrFragment() {
        let query = URL(string: "partynearme://auth-callback?error=access_denied&error_description=User+said+no")!
        let fragment = URL(string: "partynearme://auth-callback#error=server_error&error_description=Something%20broke")!
        XCTAssertEqual(message(AuthClient.parseCallback(query)), "User said no")
        XCTAssertEqual(message(AuthClient.parseCallback(fragment)), "Something broke")
        XCTAssertEqual(message(AuthClient.parseCallback(URL(string: "partynearme://auth-callback")!)), "Sign-in failed")
    }

    func testAuthMessagesAreFriendly() {
        XCTAssertEqual(AuthClient.authMessage(Data(#"{"error_description":"Invalid login credentials"}"#.utf8)),
                       "Wrong email or password")
        XCTAssertEqual(AuthClient.authMessage(Data(#"{"msg":"Email not confirmed"}"#.utf8)),
                       "Confirm your email first, using the link we sent you")
        XCTAssertEqual(AuthClient.authMessage(Data(#"{"message":"Password is too weak"}"#.utf8)), "Password is too weak")
        XCTAssertEqual(AuthClient.authMessage(Data("not json".utf8)), "Sign-in failed")
    }

    func testAuthorizeUrlCarriesTheChallenge() {
        let pkce = PKCE(verifier: "dBjftJeZ4CVP-mJ92K9GJQBXcNmpypEEpqAn7XRVnYpUSEFg")
        let url = AuthClient().authorizeURL(provider: "google", redirectTo: AppConfig.authCallback, pkce: pkce)
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertTrue(url.absoluteString.hasPrefix("\(AppConfig.supabaseBase)/auth/v1/authorize?"))
        XCTAssertEqual(items.first { $0.name == "provider" }?.value, "google")
        XCTAssertEqual(items.first { $0.name == "redirect_to" }?.value, "partynearme://auth-callback")
        XCTAssertEqual(items.first { $0.name == "code_challenge" }?.value, pkce.challenge)
        XCTAssertEqual(items.first { $0.name == "code_challenge_method" }?.value, "s256")
    }

    @MainActor
    func testFreshTokenIsUsedWithoutRefreshing() async throws {
        let session = Session(accessToken: "fresh", refreshToken: "r", expiresAt: Date().timeIntervalSince1970 + 3600,
                              userId: "u", email: nil)
        let store = MemorySessionStore(session)
        let manager = SessionManager(store: store)
        let token = try await manager.accessToken()
        XCTAssertEqual(token, "fresh")
    }

    @MainActor
    func testSignedOutHasNoToken() async {
        let manager = SessionManager(store: MemorySessionStore())
        do {
            _ = try await manager.accessToken()
            XCTFail("Expected SignedOutError")
        } catch {
            XCTAssertTrue(error is SignedOutError)
            XCTAssertEqual(error.userMessage, "Please sign in again")
        }
    }

    private func message(_ result: Result<String, APIError>) -> String? {
        if case .failure(let error) = result { return error.message }
        return nil
    }
}
