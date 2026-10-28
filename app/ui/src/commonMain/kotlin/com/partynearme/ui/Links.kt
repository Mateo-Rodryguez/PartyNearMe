package com.partynearme.ui

import com.partynearme.core.model.Event
import com.partynearme.core.model.Post
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Opens the screen a link points at: partynearme://party/<id> and
 * partynearme://post/<id>, which the shared web pages link to, and those pages'
 * own addresses (…/e/<id> and …/p/<id>). Returns false for anything else.
 */
fun Navigator.openLink(url: String): Boolean {
    val match = LINK.find(url) ?: return false
    val (kind, id) = match.destructured
    when (kind) {
        "party", "e" -> { select(Tab.Nearby); open(Route.Event(id)) }
        else -> { select(Tab.Feed); open(Route.Post(id)) }
    }
    return true
}

private val LINK = Regex(
    "^(?:partynearme://|https://[^/]+/)(party|post|e|p)/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:[/?#].*)?$",
)

/** Opens the share sheet with a party's link, and notes the share for ranking. */
fun shareParty(ui: Ui, scope: CoroutineScope, event: Event) {
    ui.platform.share("${event.title} on PartyNearMe", ui.app.config.partyLink(event.id))
    scope.launch { ui.app.interactions.share(eventId = event.id) }
}

/** Opens the share sheet with a post's link, and notes the share for ranking. */
fun sharePost(ui: Ui, scope: CoroutineScope, post: Post) {
    ui.platform.share("${post.author.name} on PartyNearMe", ui.app.config.postLink(post.id))
    scope.launch { ui.app.interactions.share(postId = post.id) }
}
