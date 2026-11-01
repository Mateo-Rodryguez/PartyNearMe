import SwiftUI

/// The steps after picking a username on a new account: what you're into (for the
/// feed and Nearby filters), then location, asked for with a reason before the
/// phone's own prompt, as Apple recommends. Both can be skipped.
struct OnboardingView: View {
    @State private var step: Int
    let onDone: () -> Void

    init(step: Int = 0, onDone: @escaping () -> Void) {
        _step = State(initialValue: step)
        self.onDone = onDone
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            StepDots(step: step, count: 2)
                .padding(.horizontal, 24)
                .padding(.top, 12)
            Group {
                if step == 0 {
                    InterestsStep { withAnimation(.snappy) { step = 1 } }
                        .transition(.asymmetric(insertion: .move(edge: .leading), removal: .move(edge: .leading)).combined(with: .opacity))
                } else {
                    LocationStep(onDone: onDone)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            .padding(.top, 24)
        }
    }
}

private struct InterestsStep: View {
    @Environment(AppModel.self) private var app
    let onNext: () -> Void

    @State private var all: [Interest] = []
    @State private var picked: Set<Int> = []
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 16) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("What are you into?").headingStyle()
                    Text("Pick a few. Your feed and Nearby show more of it, and you can change it in settings.")
                        .secondaryStyle()
                    FlowLayout(spacing: 8) {
                        ForEach(all) { interest in
                            ChoiceChip(title: interest.name, selected: picked.contains(interest.id)) { toggle(interest.id) }
                        }
                    }
                    .padding(.top, 8)
                    ErrorText(message: error)
                }
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            PrimaryButton(picked.isEmpty ? "Skip" : "Continue", busy: busy, action: next)
                .padding(.horizontal, 24)
                .padding(.bottom, 8)
        }
        .task { if all.isEmpty { all = (try? await app.api.interests()) ?? [] } }
    }

    private func toggle(_ id: Int) {
        if picked.contains(id) {
            picked.remove(id)
        } else if picked.count < 10 {
            picked.insert(id)
        }
    }

    private func next() {
        guard !picked.isEmpty else { return onNext() }
        busy = true
        error = nil
        Task {
            do {
                _ = try await app.api.setInterests(picked.sorted())
                onNext()
            } catch {
                self.error = error.userMessage
            }
            busy = false
        }
    }
}

private struct LocationStep: View {
    @Environment(AppModel.self) private var app
    let onDone: () -> Void
    @State private var asking = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            Circle()
                .fill(Brand.gradient)
                .frame(width: 96, height: 96)
                .overlay {
                    Image(systemName: "location.fill")
                        .font(.system(size: 40, weight: .semibold))
                        .foregroundStyle(.white)
                }
            Text("Find parties near you")
                .headingStyle()
                .multilineTextAlignment(.center)
                .padding(.top, 24)
            Text("PartyNearMe uses your location only while you use it, to show what's on nearby. It never keeps a history of where you go.")
                .secondaryStyle()
                .multilineTextAlignment(.center)
                .padding(.top, 8)
            Spacer()
            PrimaryButton("Allow location", busy: asking) {
                asking = true
                Task {
                    _ = await app.location.current()
                    asking = false
                    onDone()
                }
            }
            Button("Not now", action: onDone)
                .font(.body.weight(.semibold))
                .foregroundStyle(Color.appAccent)
                .disabled(asking)
                .padding(.top, 16)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 8)
    }
}
