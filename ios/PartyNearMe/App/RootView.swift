import SwiftUI

/// Signed out: the sign-in screen. Signed in: load the profile, then either finish
/// setting up a new account or open the app.
struct RootView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase

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
        // Usage stats: how long the app was open, the screen it was left on, and returns after a break.
        .onChange(of: scenePhase, initial: true) { _, phase in
            switch phase {
            case .active: app.analytics.foreground()
            case .background: Task { await app.analytics.background() }
            default: break
            }
        }
    }

    @ViewBuilder private var content: some View {
        if let userId = app.sessions.session?.userId {
            SignedInView().id(userId)
        } else {
            SignInView().analyticsScreen("sign_in")
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
    /// Just finished onboarding: the first time in the app.
    @State private var firstRun = false

    var body: some View {
        Group {
            if let profile = me {
                if profile.username == nil {
                    ProfileSetupView(profile: profile) { updated in
                        me = updated
                        onboarding = true
                        app.analytics.capture("account_created")
                    }
                    .analyticsScreen("profile_setup")
                } else if onboarding {
                    OnboardingView {
                        onboarding = false
                        firstRun = true
                    }
                } else {
                    MainView(me: profile, firstRun: firstRun)
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
            // Counted as this account from here, so profile setup and onboarding are in the funnel too.
            if let userId = app.sessions.session?.userId { app.analytics.identify(userId) }
            error = nil
            do {
                me = try await app.api.me()
            } catch {
                self.error = error.userMessage
            }
        }
    }
}
