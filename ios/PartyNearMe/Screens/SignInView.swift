import AuthenticationServices
import SwiftUI

/// Sign in, create an account, or ask for a password reset link: one screen, three modes.
struct SignInView: View {
    enum Mode { case signIn, create, reset }

    @Environment(AppModel.self) private var app
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession

    @State private var mode: Mode
    @State private var email = ""
    @State private var password = ""
    @State private var showPassword = false
    @State private var busy = false
    @State private var error: String?
    /// "Check your inbox": after signing up with email confirmation on, or asking for a reset link.
    @State private var sentTo: (email: String, reset: Bool)?
    /// Google sign-in shows once it's switched on in Supabase.
    @State private var google = false
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    init(mode: Mode = .signIn) {
        _mode = State(initialValue: mode)
    }

    private var ready: Bool {
        !busy && email.contains("@") && (mode == .reset || password.count >= (mode == .create ? 8 : 1))
    }

    var body: some View {
        ZStack {
            AppBackground()
            Glow()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Spacer(minLength: 56)
                    Wordmark(size: 40)
                    if let sentTo {
                        inbox(sentTo)
                    } else {
                        form
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .animation(.snappy, value: mode)
        .animation(.snappy, value: error)
        .task { google = await app.providers().contains("google") }
    }

    @ViewBuilder private var form: some View {
        Text(heading)
            .headingStyle()
            .padding(.top, 8)
        Text(subheading)
            .secondaryStyle()
            .padding(.bottom, 12)

        PartyField("Email", text: $email, prompt: "you@example.com")
            .textContentType(.emailAddress)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(mode == .reset ? .go : .next)
            .focused($focus, equals: .email)
            .onSubmit { if mode == .reset { submit() } else { focus = .password } }

        if mode != .reset {
            PartyField(label: "Password", text: $password, secure: !showPassword,
                       footnote: mode == .create ? "At least 8 characters" : nil) {
                Button(showPassword ? "Hide" : "Show") { showPassword.toggle() }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.appAccent)
            }
            .textContentType(mode == .create ? .newPassword : .password)
            .submitLabel(.go)
            .focused($focus, equals: .password)
            .onSubmit(submit)
        }

        if mode == .signIn {
            Button("Forgot password?") { switchTo(.reset) }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.appAccent)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }

        ErrorText(message: error)

        PrimaryButton(primaryTitle, busy: busy, action: submit)
            .disabled(!ready && !busy)
            .padding(.top, 4)

        if google && mode != .reset {
            SecondaryButton("Continue with Google", systemImage: "globe", action: signInWithGoogle)
                .disabled(busy)
        }

        HStack(spacing: 4) {
            if mode == .reset {
                Button("Back to sign in") { switchTo(.signIn) }.fontWeight(.bold)
            } else {
                Text(mode == .create ? "Already have an account?" : "New here?").foregroundStyle(Color.appSecondaryText)
                Button(mode == .create ? "Sign in" : "Create an account") { switchTo(mode == .create ? .signIn : .create) }
                    .fontWeight(.bold)
            }
        }
        .font(.subheadline)
        .foregroundStyle(Color.appAccent)
        .frame(maxWidth: .infinity)
        .padding(.top, 4)

        legal.padding(.top, 24)
    }

    private func inbox(_ sent: (email: String, reset: Bool)) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Check your inbox").headingStyle(.headline2).padding(.top, 8)
            Text(sent.reset
                 ? "If \(sent.email) has an account, we sent it a link to choose a new password. Open it on this phone, then come back and sign in."
                 : "We sent a link to \(sent.email). Tap it, then come back and sign in.")
                .secondaryStyle()
            PrimaryButton("Back to sign in") {
                sentTo = nil
                password = ""
                switchTo(.signIn)
            }
        }
    }

    private var legal: some View {
        VStack(spacing: 8) {
            Text("PartyNearMe is for people aged 18 and over. By continuing you agree to our Terms and Privacy policy.")
                .font(.footnote)
                .foregroundStyle(Color.appSecondaryText)
                .multilineTextAlignment(.center)
            HStack(spacing: 20) {
                Link("Terms", destination: AppConfig.termsURL)
                Link("Privacy policy", destination: AppConfig.privacyURL)
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Color.appAccent)
        }
        .frame(maxWidth: .infinity)
    }

    private var heading: String {
        switch mode {
        case .reset: "Forgot your password?"
        case .create: "Join the party."
        case .signIn: "Find the party.\nShare the night."
        }
    }

    private var subheading: String {
        switch mode {
        case .reset: "Enter your email and we'll send you a link to choose a new one."
        case .create: "Create your account to see what's on near you."
        case .signIn: "Sign in to see what's on near you tonight."
        }
    }

    private var primaryTitle: String {
        switch mode {
        case .reset: "Send reset link"
        case .create: "Create account"
        case .signIn: "Sign in"
        }
    }

    private func switchTo(_ next: Mode) {
        mode = next
        error = nil
    }

    private func submit() {
        guard ready else { return }
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        busy = true
        error = nil
        focus = nil
        Task {
            do {
                switch mode {
                case .reset:
                    try await app.sendPasswordReset(email: address)
                    sentTo = (address, true)
                case .create:
                    let signedIn = try await app.sessions.signUp(email: address, password: password)
                    if !signedIn { sentTo = (address, false) }
                case .signIn:
                    try await app.sessions.signIn(email: address, password: password)
                }
            } catch {
                self.error = error.userMessage
            }
            busy = false
        }
    }

    private func signInWithGoogle() {
        busy = true
        error = nil
        Task {
            do {
                _ = try await app.sessions.signIn(with: "google") { url in
                    do {
                        return try await webAuthenticationSession.authenticate(using: url, callbackURLScheme: AppConfig.appScheme)
                    } catch ASWebAuthenticationSessionError.canceledLogin {
                        return nil
                    }
                }
            } catch {
                self.error = error.userMessage
            }
            busy = false
        }
    }
}

/// Soft coloured light behind the sign-in screen, like stage lights at night or a sunset by day.
private struct Glow: View {
    var body: some View {
        GeometryReader { proxy in
            ZStack {
                RadialGradient(colors: [Brand.glow.0, .clear], center: .center, startRadius: 0, endRadius: 190)
                    .frame(width: 380, height: 380)
                    .position(x: 70, y: 110)
                RadialGradient(colors: [Brand.glow.1, .clear], center: .center, startRadius: 0, endRadius: 180)
                    .frame(width: 360, height: 360)
                    .position(x: proxy.size.width + 40, y: 240)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}
