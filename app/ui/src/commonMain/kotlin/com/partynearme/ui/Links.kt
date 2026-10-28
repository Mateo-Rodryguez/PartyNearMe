package com.partynearme.ui

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
