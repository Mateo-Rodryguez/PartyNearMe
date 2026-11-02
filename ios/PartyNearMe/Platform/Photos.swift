import SwiftUI
import UIKit

/// A photo picked for posting, already scaled down and re-encoded.
struct PickedPhoto: Identifiable, Equatable {
    let id = UUID()
    let jpeg: Data
    let preview: UIImage

    /// Longest side in pixels, the same limit as Android: plenty for a phone screen,
    /// and the server makes smaller copies itself.
    static let maxEdge: CGFloat = 2048

    /// Decodes, scales down and re-encodes as JPEG, which also drops the photo's
    /// location metadata. Nil when the data isn't an image.
    static func make(from data: Data) -> PickedPhoto? {
        guard let image = UIImage(data: data) else { return nil }
        return make(from: image)
    }

    static func make(from image: UIImage) -> PickedPhoto? {
        let size = scaled(image.size, maxEdge: maxEdge)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let jpeg = resized.jpegData(compressionQuality: 0.85) else { return nil }
        return PickedPhoto(jpeg: jpeg, preview: resized)
    }

    /// Fits `size` within `maxEdge` on its longest side, never scaling up.
    static func scaled(_ size: CGSize, maxEdge: CGFloat) -> CGSize {
        let longest = max(size.width, size.height)
        guard longest > maxEdge, longest > 0 else { return CGSize(width: size.width.rounded(), height: size.height.rounded()) }
        let factor = maxEdge / longest
        return CGSize(width: (size.width * factor).rounded(), height: (size.height * factor).rounded())
    }
}

/// The system camera, for taking a photo to post. Only on phones that have one.
struct CameraPicker: UIViewControllerRepresentable {
    let onTaken: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    static var isAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onTaken(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}
