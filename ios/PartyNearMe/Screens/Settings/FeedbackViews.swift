import SwiftUI

/// Settings > Send feedback: what people love, what got in their way, or what
/// they wish the app did. Goes to the feedback table, which only we can read.
struct FeedbackView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var kind: Feedback.Kind
    @State private var text = ""
    @State private var busy = false
    @FocusState private var focused: Bool

    init(kind: Feedback.Kind = .love) {
        _kind = State(initialValue: kind)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("We read every message. Tell us what you love, what got in your way, or what you wish PartyNearMe did, and we'll keep making it better.")
                    .secondaryStyle()
                FlowLayout(spacing: 8) {
                    ChoiceChip(title: "I love something", selected: kind == .love) { kind = .love }
                    ChoiceChip(title: "Something's wrong", selected: kind == .problem) { kind = .problem }
                    ChoiceChip(title: "I have an idea", selected: kind == .idea) { kind = .idea }
                }
                TextField(prompt, text: $text, axis: .vertical)
                    .lineLimit(5...12)
                    .focused($focused)
                    .padding(16)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.appField))
                    .onChange(of: text) { _, new in if new.count > 2000 { text = String(new.prefix(2000)) } }
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(AppBackground())
        .navigationTitle("Send feedback")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            PrimaryButton("Send", busy: busy, action: send)
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
                .padding(.horizontal, 20)
                .padding(.vertical, 8)
        }
    }

    private var prompt: String {
        switch kind {
        case .problem: return "What happened, and what were you trying to do?"
        case .idea: return "What should PartyNearMe do?"
        default: return "What do you love?"
        }
    }

    private func send() {
        busy = true
        focused = false
        Task {
            do {
                try await app.sendFeedback(kind, body: text)
                app.show("Thanks! We read every one.")
                dismiss()
            } catch {
                app.show(error.userMessage)
            }
            busy = false
        }
    }
}

/// "How likely are you to recommend PartyNearMe to a friend?" (0-10), the Net
/// Promoter Score, shown at the top of Home at most every 90 days once someone
/// knows the app (AppPrefs.recommendDue). The app grows by word of mouth, so this
/// is the number that matters most. A score can come with an optional reason.
struct RecommendCard: View {
    @Environment(AppModel.self) private var app
    let onDone: () -> Void
    @State private var score: Int?
    @State private var reason = ""
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                Text("How likely are you to recommend PartyNearMe to a friend?")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.appText)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Button {
                    app.analytics.capture("recommend_dismissed")
                    onDone()
                } label: {
                    Image(systemName: "xmark")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(Color.appSecondaryText)
                        .frame(width: 28, height: 28)
                }
                .accessibilityLabel("Not now")
            }
            HStack(spacing: 4) {
                ForEach(0...10, id: \.self) { n in
                    Button { score = n } label: {
                        Text("\(n)")
                            .font(.footnote.weight(n == score ? .bold : .regular))
                            .monospacedDigit()
                            .foregroundStyle(n == score ? Color.white : Color.appText)
                            .frame(maxWidth: .infinity)
                            .frame(height: 36)
                            .background {
                                if n == score {
                                    RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Brand.gradient)
                                } else {
                                    RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.appRaised)
                                }
                            }
                    }
                    .buttonStyle(PressStyle())
                    .accessibilityAddTraits(n == score ? .isSelected : [])
                }
            }
            .sensoryFeedback(.selection, trigger: score)
            HStack {
                Text("Not likely")
                Spacer()
                Text("Very likely")
            }
            .font(.caption)
            .foregroundStyle(Color.appSecondaryText)
            if let score {
                TextField(score >= 9 ? "What do you love most? (optional)" : "What would make it a 10? (optional)",
                          text: $reason, axis: .vertical)
                    .lineLimit(2...5)
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.appField))
                    .onChange(of: reason) { _, new in if new.count > 2000 { reason = String(new.prefix(2000)) } }
                HStack {
                    Spacer()
                    Button(busy ? "Sending…" : "Send") { send(score) }
                        .font(.body.weight(.bold))
                        .foregroundStyle(Color.appAccent)
                        .disabled(busy)
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color.appField))
        .animation(.snappy, value: score)
        .onAppear { app.analytics.capture("recommend_shown") }
    }

    private func send(_ picked: Int) {
        busy = true
        Task {
            do {
                try await app.sendFeedback(.recommend, body: reason, score: picked)
                app.show(picked >= 9 ? "Thank you! Tell a friend tonight" : "Thanks, this helps us improve")
                onDone()
            } catch {
                app.show(error.userMessage)
            }
            busy = false
        }
    }
}

/// A step in onboarding: how did you find us? Word of mouth is how this app means
/// to grow, so we measure it. The answers' wire values match the backend's HEARD_FROM.
struct HeardFromStep: View {
    struct Answer: Identifiable {
        let id: String
        let label: String
    }

    static let answers = [
        Answer(id: "friend", label: "A friend told me"),
        Answer(id: "shared_link", label: "Someone shared a party or post"),
        Answer(id: "social_media", label: "Social media"),
        Answer(id: "venue_or_event", label: "At a venue or party"),
        Answer(id: "app_store", label: "Browsing the App Store"),
        Answer(id: "other", label: "Somewhere else"),
    ]

    @Environment(AppModel.self) private var app
    let onNext: () -> Void
    @State private var picked: String?

    var body: some View {
        VStack(spacing: 16) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("How did you hear about PartyNearMe?").headingStyle()
                    Text("It helps us know what's working.").secondaryStyle()
                    VStack(spacing: 8) {
                        ForEach(Self.answers) { answer in
                            ChoiceChip(title: answer.label, selected: picked == answer.id, fullWidth: true) { picked = answer.id }
                        }
                    }
                    .padding(.top, 8)
                }
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            PrimaryButton(picked == nil ? "Skip" : "Continue", action: next)
                .padding(.horizontal, 24)
                .padding(.bottom, 8)
        }
    }

    private func next() {
        if let answer = picked {
            app.analytics.capture("heard_about_us", ["source": answer])
            // Never holds up onboarding: sent in the background, and a failure is dropped.
            Task { try? await app.sendFeedback(.heardFrom, body: answer) }
        }
        onNext()
    }
}
