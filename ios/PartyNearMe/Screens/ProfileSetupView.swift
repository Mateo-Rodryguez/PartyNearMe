import SwiftUI

/// New accounts pick a username before anything else, so posts and chats have a name on them.
struct ProfileSetupView: View {
    @Environment(AppModel.self) private var app
    let profile: OwnProfile
    let onDone: (OwnProfile) -> Void

    @State private var username = ""
    @State private var displayName = ""
    @State private var busy = false
    @State private var error: String?

    init(profile: OwnProfile, onDone: @escaping (OwnProfile) -> Void) {
        self.profile = profile
        self.onDone = onDone
    }

    static func isValid(_ username: String) -> Bool {
        username.range(of: "^[a-z0-9_.]{3,30}$", options: .regularExpression) != nil
    }

    /// Lowercase letters, digits, _ and . only, at most 30: what the server accepts.
    static func clean(_ text: String) -> String {
        String(text.lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == ".") }.prefix(30))
    }

    private var valid: Bool { Self.isValid(username) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Spacer(minLength: 48)
                Wordmark(size: 30)
                Text("Pick a username").headingStyle()
                Text("It's how people find you and see who posted.").secondaryStyle()
                PartyField("Username", text: $username, prompt: "yourname", prefix: "@",
                           footnote: "3 to 30 letters, numbers, _ or .", isError: !username.isEmpty && !valid)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onChange(of: username) { _, new in
                        let cleaned = Self.clean(new)
                        if cleaned != new { username = cleaned }
                    }
                PartyField("Your name (optional)", text: $displayName)
                    .textContentType(.name)
                    .onChange(of: displayName) { _, new in
                        if new.count > 60 { displayName = String(new.prefix(60)) }
                    }
                ErrorText(message: error)
                PrimaryButton("Continue", busy: busy, action: save)
                    .disabled(!valid && !busy)
                Button("Sign out") { Task { await app.signOut() } }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.appAccent)
                    .frame(maxWidth: .infinity)
            }
            .padding(24)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear { if displayName.isEmpty { displayName = profile.displayName ?? "" } }
    }

    private func save() {
        guard valid, !busy else { return }
        busy = true
        error = nil
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                onDone(try await app.api.updateMe(ProfileUpdate(username: username, displayName: name.isEmpty ? nil : name)))
            } catch {
                self.error = error.userMessage
            }
            busy = false
        }
    }
}
