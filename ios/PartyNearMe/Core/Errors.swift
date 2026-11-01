import Foundation

/// A request the server turned down, with a message that is fine to show the user.
struct APIError: LocalizedError, Equatable {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

/// The session is gone (signed out elsewhere, or the refresh token expired).
struct SignedOutError: LocalizedError {
    var errorDescription: String? { "Please sign in again" }
}

extension Error {
    /// What to show the user: the server's own words, or a plain "no connection".
    var userMessage: String {
        switch self {
        case let error as APIError: return error.message
        case is SignedOutError: return "Please sign in again"
        default: return "Can't reach PartyNearMe. Check your connection and try again."
        }
    }
}
