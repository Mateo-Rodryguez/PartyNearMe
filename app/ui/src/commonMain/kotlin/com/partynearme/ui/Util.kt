package com.partynearme.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.partynearme.core.ApiException
import com.partynearme.core.SignedOutException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock
import kotlin.time.Instant

/** Like runCatching, but never swallows coroutine cancellation. */
suspend fun <T> attempt(block: suspend () -> T): Result<T> =
    try {
        Result.success(block())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        Result.failure(e)
    }

val Throwable.userMessage: String
    get() = when (this) {
        is ApiException, is SignedOutException -> message ?: "Something went wrong"
        else -> "Can't reach PartyNearMe. Check your connection and try again."
    }

/** A list that loads page by page; [load] gets the cursor and returns items plus the next cursor. */
class Paged<T>(
    private val scope: CoroutineScope,
    private val load: suspend (cursor: String?) -> Pair<List<T>, String?>,
) {
    val items = mutableStateListOf<T>()
    var loading by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var loadedOnce by mutableStateOf(false)
        private set
    private var cursor: String? = null
    private var ended = false
    private var job: Job? = null

    fun refresh() {
        job?.cancel()
        cursor = null
        ended = false
        fetch(replace = true)
    }

    fun loadMore() {
        if (loading || ended || error != null) return
        fetch(replace = false)
    }

    fun update(transform: (T) -> T) {
        for (i in items.indices) items[i] = transform(items[i])
    }

    fun remove(predicate: (T) -> Boolean) {
        items.removeAll(predicate)
    }

    private fun fetch(replace: Boolean) {
        loading = true
        error = null
        job = scope.launch {
            attempt { load(cursor) }
                .onSuccess { (page, next) ->
                    if (replace) items.clear()
                    items.addAll(page)
                    cursor = next
                    ended = next == null
                }
                .onFailure { error = it.userMessage }
            loading = false
            loadedOnce = true
        }
    }
}

private val zone get() = TimeZone.currentSystemDefault()

/** "now", "5m", "3h", "2d", then a date: the Instagram style for post times. */
fun timeAgo(iso: String, now: Instant = Clock.System.now()): String {
    val then = runCatching { Instant.parse(iso) }.getOrNull() ?: return ""
    val minutes = (now - then).inWholeMinutes
    return when {
        minutes < 1 -> "now"
        minutes < 60 -> "${minutes}m"
        minutes < 24 * 60 -> "${minutes / 60}h"
        minutes < 7 * 24 * 60 -> "${minutes / (24 * 60)}d"
        else -> then.toLocalDateTime(zone).date.let { "${it.day} ${monthName(it.month.ordinal)}" }
    }
}

/** "Sat 14 Oct, 21:00" in the phone's time zone. */
fun eventTime(iso: String): String {
    val t = runCatching { Instant.parse(iso) }.getOrNull()?.toLocalDateTime(zone) ?: return ""
    val day = t.date.dayOfWeek.name.take(3).lowercase().replaceFirstChar { it.uppercase() }
    return "$day ${t.date.day} ${monthName(t.date.month.ordinal)}, ${t.hour.pad()}:${t.minute.pad()}"
}

fun distance(meters: Int?): String = when {
    meters == null -> ""
    meters < 1000 -> "${(meters / 50 + 1) * 50} m away"
    else -> "${(meters + 50) / 100 / 10.0} km away".replace(".0 ", " ")
}

private fun Int.pad() = toString().padStart(2, '0')
private fun monthName(index: Int) =
    listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")[index]
