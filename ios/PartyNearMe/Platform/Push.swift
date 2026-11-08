import UIKit
import UserNotifications

/// Push notifications, straight from Apple (APNs): no Firebase SDK. The server sends
/// iPhone tokens to APNs itself (backend/src/worker/push.ts).
///
/// The app delegate is where iOS hands over the device token and tapped notifications.
/// Both can arrive before the signed-in screens exist (a tap that launched the app), so
/// the last of each waits here until a handler is set.
@MainActor
final class PushDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static private(set) var shared: PushDelegate?

    /// Called with this phone's APNs token, as hex.
    var onToken: ((String) -> Void)? {
        didSet { if let token = pendingToken, let onToken { pendingToken = nil; onToken(token) } }
    }
    /// Called with a tapped notification's data, such as type and conversation_id.
    var onOpen: (([String: String]) -> Void)? {
        didSet { if let data = pendingOpen, let onOpen { pendingOpen = nil; onOpen(data) } }
    }
    private var pendingToken: String?
    private var pendingOpen: [String: String]?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        PushDelegate.shared = self
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = PushDelegate.hex(deviceToken)
        if let onToken { onToken(token) } else { pendingToken = token }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Simulators and builds without the push entitlement land here; the app works on without push.
    }

    /// Shows notifications while the app is open too, like Android does.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification)
        async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let data = PushDelegate.strings(response.notification.request.content.userInfo)
        await MainActor.run {
            if let onOpen { onOpen(data) } else { pendingOpen = data }
        }
    }

    /// The token as APNs wants it in the URL: lowercase hex.
    nonisolated static func hex(_ token: Data) -> String {
        token.map { String(format: "%02x", $0) }.joined()
    }

    /// The custom keys the server puts next to "aps" (type, conversation_id, event_id, post_id).
    nonisolated static func strings(_ userInfo: [AnyHashable: Any]) -> [String: String] {
        var out: [String: String] = [:]
        for (key, value) in userInfo {
            guard let key = key as? String, key != "aps", let value = value as? String else { continue }
            out[key] = value
        }
        return out
    }
}

/// Where a tapped notification leads, matching the Android app's MainActivity.
enum PushTarget: Equatable {
    case chat(String)
    case comments(String)
    case post(String)
    case party(String)

    init?(_ data: [String: String]) {
        switch data["type"] {
        case "message": guard let id = data["conversation_id"] else { return nil }; self = .chat(id)
        case "comment": guard let id = data["post_id"] else { return nil }; self = .comments(id)
        case "tag": guard let id = data["post_id"] else { return nil }; self = .post(id)
        case "rsvp", "event_reminder", "event_cancelled": guard let id = data["event_id"] else { return nil }; self = .party(id)
        default: return nil
        }
    }
}
