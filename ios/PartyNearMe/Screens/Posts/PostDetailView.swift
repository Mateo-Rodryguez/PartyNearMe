import SwiftUI

/// One post on its own, opened from a profile grid, a notification or a link.
struct PostDetailView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let id: String

    @State private var post: Post?
    @State private var error: String?

    var body: some View {
        ScrollView {
            if let binding = Binding($post) {
                PostCard(post: binding, onDeleted: { dismiss() })
                    .padding(.top, 8)
            } else if let error {
                ListMessage(text: error)
            } else {
                ProgressView().padding(48)
            }
        }
        .background(AppBackground())
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard post == nil else { return }
            do {
                post = try await app.api.post(id)
                app.interactions.open(id)
            } catch {
                self.error = error.userMessage
            }
        }
    }
}
