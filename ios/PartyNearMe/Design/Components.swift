import SwiftUI

// The app's building blocks, so every screen shares one look. New screens reuse these.

/// "PartyNearMe" in the brand gradient.
struct Wordmark: View {
    var size: CGFloat = 34

    var body: some View {
        Text("PartyNearMe")
            .font(.system(size: size, weight: .black))
            .tracking(-size * 0.03)
            .foregroundStyle(Brand.sunset)
            .accessibilityAddTraits(.isHeader)
    }
}

/// The main action on a screen: a full pill in the brand gradient.
struct PrimaryButton: View {
    let title: String
    var systemImage: String?
    var busy = false
    var compact = false
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

    init(_ title: String, systemImage: String? = nil, busy: Bool = false, compact: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.busy = busy
        self.compact = compact
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy {
                    ProgressView().tint(.white).controlSize(.small)
                } else if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title).font(.body.weight(.bold)).lineLimit(1)
            }
            .foregroundStyle(isEnabled ? Color.white : Color.appSecondaryText)
            .frame(maxWidth: compact ? nil : .infinity, minHeight: compact ? 40 : 52)
            .padding(.horizontal, compact ? 18 : 20)
            .background {
                if isEnabled { Capsule().fill(Brand.gradient) } else { Capsule().fill(Color.appRaised) }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(PressStyle())
        .disabled(busy)
    }
}

/// A quieter action next to or below the main one.
struct SecondaryButton: View {
    let title: String
    var systemImage: String?
    var fullWidth = true
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

    init(_ title: String, systemImage: String? = nil, fullWidth: Bool = true, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.fullWidth = fullWidth
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title).font(.body.weight(.semibold)).lineLimit(1)
            }
            .foregroundStyle(isEnabled ? Color.appText : Color.appSecondaryText)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 48)
            .padding(.horizontal, 18)
            .background(Capsule().fill(Color.appRaised))
            .contentShape(Capsule())
        }
        .buttonStyle(PressStyle())
    }
}

/// Buttons shrink a touch while pressed, like the system's own.
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.snappy(duration: 0.15), value: configuration.isPressed)
    }
}

/// One choice in a group of options; the chosen one lights up in the brand gradient.
struct ChoiceChip: View {
    let title: String
    let selected: Bool
    /// Stretches across the screen, for a list of answers.
    var fullWidth = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .foregroundStyle(selected ? Color.white : Color.appText)
                .padding(.horizontal, 16)
                .frame(maxWidth: fullWidth ? .infinity : nil)
                .frame(height: 40)
                .background {
                    if selected { Capsule().fill(Brand.gradient) } else { Capsule().fill(Color.appRaised) }
                }
        }
        .buttonStyle(PressStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
        .sensoryFeedback(.selection, trigger: selected)
    }
}

/// A filled, rounded text field with its label above: no outline boxes, the way
/// current social apps draw forms.
struct PartyField<Trailing: View>: View {
    let label: String
    @Binding var text: String
    var prompt: String?
    var prefix: String?
    var secure = false
    var footnote: String?
    var isError = false
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.footnote.weight(.semibold)).foregroundStyle(Color.appSecondaryText)
            HStack(spacing: 4) {
                if let prefix { Text(prefix).foregroundStyle(Color.appSecondaryText) }
                Group {
                    if secure {
                        SecureField(label, text: $text, prompt: prompt.map { Text($0) })
                    } else {
                        TextField(label, text: $text, prompt: prompt.map { Text($0) })
                    }
                }
                .foregroundStyle(Color.appText)
                .tint(Color.appAccent)
                trailing()
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 54)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.appField))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(isError ? Color.appError : .clear, lineWidth: 1.5)
            }
            if let footnote {
                Text(footnote).font(.footnote).foregroundStyle(isError ? Color.appError : Color.appSecondaryText)
            }
        }
    }
}

extension PartyField where Trailing == EmptyView {
    init(_ label: String, text: Binding<String>, prompt: String? = nil, prefix: String? = nil, secure: Bool = false,
         footnote: String? = nil, isError: Bool = false) {
        self.init(label: label, text: text, prompt: prompt, prefix: prefix, secure: secure, footnote: footnote,
                  isError: isError, trailing: { EmptyView() })
    }
}

/// A short error under a form.
struct ErrorText: View {
    let message: String?

    var body: some View {
        if let message {
            Label(message, systemImage: "exclamationmark.circle.fill")
                .font(.subheadline)
                .foregroundStyle(Color.appError)
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.opacity)
        }
    }
}

/// Lays its children out in rows, wrapping onto the next row when one is full: chip groups.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.last.map { $0.y + $0.height } ?? 0
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
        }
    }

    private struct Row {
        var indices: [Int] = []
        var y: CGFloat = 0
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = row.indices.isEmpty ? size.width : row.width + spacing + size.width
            if needed > width && !row.indices.isEmpty {
                rows.append(row)
                row = Row(y: row.y + row.height + spacing)
            }
            row.width = row.indices.isEmpty ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
            row.indices.append(index)
        }
        if !row.indices.isEmpty { rows.append(row) }
        return rows
    }
}

/// The step dots at the top of onboarding: the current one stretches into a bar.
struct StepDots: View {
    let step: Int
    let count: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<count, id: \.self) { index in
                Capsule()
                    .fill(index <= step ? AnyShapeStyle(Brand.gradient) : AnyShapeStyle(Color.appRaised))
                    .frame(width: index == step ? 24 : 6, height: 6)
            }
        }
        .animation(.snappy, value: step)
        .accessibilityElement()
        .accessibilityLabel("Step \(step + 1) of \(count)")
    }
}

/// Fills the screen with the app's background colour.
struct AppBackground: View {
    var body: some View { Color.appBackground.ignoresSafeArea() }
}
