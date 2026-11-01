import Foundation

/// Where the app talks to. Every value here is public: the publishable key is meant
/// to ship in apps, and row-level security in Postgres protects the data.
enum AppConfig {
    /// The PartyNearMe API on Render, without a trailing slash.
    static let apiBase = "https://partynearme-api.onrender.com"
    /// The Supabase project, for sign-in.
    static let supabaseBase = "https://vvkckzrhzgdrazhjitse.supabase.co"
    static let supabaseKey = "sb_publishable_lU8CqYjRgUy5kr9Y8QbBNQ_NiPtoCil"
    /// Crash reports go to the Sentry project partynearme-app (the DSN is public).
    static let sentryDSN = "https://7a9348ef5e13ce90b731507e7b463137@o4512272125394944.ingest.de.sentry.io/4512272236609616"

    /// Links starting with this open the app: browser sign-in coming back, shared parties and posts.
    static let appScheme = "partynearme"
    /// Where browser sign-in (Google, later Apple) returns to. Supabase allows it under Redirect URLs.
    static let authCallback = "partynearme://auth-callback"
    /// The web page the password reset email leads to.
    static let resetPasswordPage = "\(apiBase)/reset-password"

    static let privacyURL = URL(string: "\(apiBase)/privacy")!
    static let termsURL = URL(string: "\(apiBase)/terms")!
}
