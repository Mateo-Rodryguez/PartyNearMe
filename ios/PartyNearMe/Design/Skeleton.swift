import SwiftUI

/// Grey shapes in the layout of what's loading, with a soft light sweeping across,
/// like Instagram and Facebook use instead of a spinner. The screen looks ready at
/// once and the real content drops into place. Still when Reduce Motion is on.
struct Shimmer: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = -1

    func body(content: Content) -> some View {
        content
            .overlay {
                if !reduceMotion {
                    GeometryReader { geo in
                        LinearGradient(colors: [.clear, .white.opacity(0.18), .clear],
                                       startPoint: .leading, endPoint: .trailing)
                            .frame(width: geo.size.width * 0.6)
                            .offset(x: phase * geo.size.width * 1.6)
                    }
                    .mask(content)
                    .allowsHitTesting(false)
                }
            }
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.linear(duration: 1.3).repeatForever(autoreverses: false)) { phase = 1 }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Loading")
    }
}

extension View {
    func shimmer() -> some View { modifier(Shimmer()) }
}

/// One grey block of a skeleton.
struct Bone: View {
    var width: CGFloat?
    var height: CGFloat = 12
    var radius: CGFloat = 6

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Color.appRaised)
            .frame(width: width, height: height)
    }
}

/// A post while the feed loads: author row, a 4:5 photo, action row and caption lines.
struct PostSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Circle().fill(Color.appRaised).frame(width: 38, height: 38)
                VStack(alignment: .leading, spacing: 6) {
                    Bone(width: 120)
                    Bone(width: 80, height: 10)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 10)
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.appRaised)
                .aspectRatio(0.8, contentMode: .fit)
                .padding(.horizontal, 12)
            HStack(spacing: 14) {
                ForEach(0..<3, id: \.self) { _ in Circle().fill(Color.appRaised).frame(width: 24, height: 24) }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            VStack(alignment: .leading, spacing: 8) {
                Bone(width: 220)
                Bone(width: 160)
            }
            .padding(.horizontal, 16)
        }
        .padding(.bottom, 24)
        .shimmer()
    }
}

/// A list row while a list loads: a picture (round for people, rounded square for
/// parties) and two lines of text.
struct RowSkeleton: View {
    var square = false
    var size: CGFloat = 48

    var body: some View {
        HStack(spacing: 12) {
            if square {
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.appRaised).frame(width: size, height: size)
            } else {
                Circle().fill(Color.appRaised).frame(width: size, height: size)
            }
            VStack(alignment: .leading, spacing: 8) {
                Bone(width: 170)
                Bone(width: 110, height: 10)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
        .shimmer()
    }
}

/// Several skeleton rows, for a whole list that's loading.
struct ListSkeleton: View {
    var rows = 8
    var square = false
    var size: CGFloat = 48

    var body: some View {
        VStack(spacing: 8) {
            ForEach(0..<rows, id: \.self) { _ in RowSkeleton(square: square, size: size) }
        }
        .padding(.horizontal, 16)
        .frame(maxHeight: .infinity, alignment: .top)
        .padding(.top, 8)
    }
}

/// A party card while Nearby loads: the cover, then title and details.
struct PartySkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color.appRaised).frame(height: 190)
            VStack(alignment: .leading, spacing: 8) {
                Bone(width: 200, height: 14)
                Bone(width: 140)
            }
        }
        .shimmer()
    }
}

/// A profile while it loads: picture, name, the three counts and a grid of photos.
struct ProfileSkeleton: View {
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 3), count: 3)

    var body: some View {
        VStack(spacing: 14) {
            Circle().fill(Color.appRaised).frame(width: 96, height: 96)
            Bone(width: 150, height: 18, radius: 8)
            HStack(spacing: 36) {
                ForEach(0..<3, id: \.self) { _ in
                    VStack(spacing: 6) {
                        Bone(width: 28, height: 16)
                        Bone(width: 56, height: 10)
                    }
                }
            }
            LazyVGrid(columns: columns, spacing: 3) {
                ForEach(0..<9, id: \.self) { _ in
                    Rectangle().fill(Color.appRaised).aspectRatio(0.8, contentMode: .fit)
                }
            }
            .padding(.top, 10)
        }
        .padding(.top, 16)
        .shimmer()
    }
}
