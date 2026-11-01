import SwiftUI

/// Signed out: the sign-in screen. Signed in: load the profile, then either finish
/// setting up a new account or open the app.
struct RootView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        ZStack {
            AppBackground()
            #if DEBUG
            if let screen = app.demoScreen {
                Demo.screen(screen)
            } else {
                content
            }
            #else
            content
            #endif
        }
    }

    @ViewBuilder private var content: some View {
        if let userId = app.sessions.session?.userId {
            SignedInView().id(userId)
        } else {
            SignInView()
        }
    }
}

/// Loads the user's profile. New accounts pick a username, then go through
/// interests and location once, before the main app.
struct SignedInView: View {
    @Environment(AppModel.self) private var app
    @State private var me: OwnProfile?
    @State private var error: String?
    @State private var attempt = 0
    @State private var onboarding = false

    var body: some View {
        Group {
            if let profile = me {
                if profile.username == nil {
                    ProfileSetupView(profile: profile) { updated in
                        me = updated
                        onboarding = true
                    }
                } else if onboarding {
                    OnboardingView { onboarding = false }
                } else {
                    MainView(me: profile)
                }
            } else if let error {
                ContentUnavailableView {
                    Label("Can't connect right now", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error)
                } actions: {
                    PrimaryButton("Try again", compact: true) { attempt += 1 }
                }
            } else {
                VStack(spacing: 20) {
                    Wordmark()
                    ProgressView()
                }
            }
        }
        .animation(.default, value: me)
        .task(id: attempt) {
            error = nil
            do {
                me = try await app.api.me()
            } catch {
                self.error = error.userMessage
            }
        }
    }
}
