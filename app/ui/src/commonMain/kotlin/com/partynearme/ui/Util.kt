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
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toInstant
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
    /** True while [items] is a saved copy shown until the first fresh page arrives. */
    var saved by mutableStateOf(false)
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

    /** Shows a saved copy straight away; the next refresh replaces it. */
    fun seed(copy: List<T>) {
        if (loadedOnce || items.isNotEmpty() || copy.isEmpty()) return
        items.addAll(copy)
        saved = true
        ended = true
    }

    /** Tries again after an error: the first page again for a saved copy, else the next page. */
    fun retry() {
        if (saved) {
            refresh()
        } else {
            error = null
            loadMore()
        }
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
                    if (replace) saved = false
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
/** Null for text the server would never send; callers treat it as "unknown". */
fun parseInstant(iso: String): Instant? = runCatching { Instant.parse(iso) }.getOrNull()

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

/** "Tonight", "Tomorrow", or "Wed 21 Oct": how people talk about when a party is. */
fun dayLabel(iso: String, now: Instant = Clock.System.now()): String {
    val day = parseInstant(iso)?.toLocalDateTime(zone)?.date ?: return ""
    val today = now.toLocalDateTime(zone).date
    return when ((day.toEpochDays() - today.toEpochDays()).toInt()) {
        0 -> "Tonight"
        1 -> "Tomorrow"
        else -> "${day.dayOfWeek.name.take(3).lowercase().replaceFirstChar { it.uppercase() }} ${day.day} ${monthName(day.month.ordinal)}"
    }
}

/** From now until 6 the next morning: what people mean by "tonight". */
fun tonightWindow(now: Instant = Clock.System.now(), tz: TimeZone = zone): Pair<Instant, Instant> {
    val local = now.toLocalDateTime(tz)
    val endDay = if (local.hour < 6) local.date else local.date.plus(1, DateTimeUnit.DAY)
    return now to LocalDateTime(endDay, LocalTime(6, 0)).toInstant(tz)
}

/** Friday 17:00 to Monday 6:00 of this weekend, or the next one; from now if it has started. */
fun weekendWindow(now: Instant = Clock.System.now(), tz: TimeZone = zone): Pair<Instant, Instant> {
    val local = now.toLocalDateTime(tz)
    val sinceFriday = (local.date.dayOfWeek.isoDayNumber - 5 + 7) % 7
    val stillOn = sinceFriday <= 2 || (sinceFriday == 3 && local.hour < 6)
    val friday = if (stillOn) local.date.minus(sinceFriday, DateTimeUnit.DAY) else local.date.plus(7 - sinceFriday, DateTimeUnit.DAY)
    val start = LocalDateTime(friday, LocalTime(17, 0)).toInstant(tz)
    val end = LocalDateTime(friday.plus(3, DateTimeUnit.DAY), LocalTime(6, 0)).toInstant(tz)
    return maxOf(start, now) to end
}

/** "21:00" in the phone's time zone. */
fun clockTime(iso: String): String {
    val t = parseInstant(iso)?.toLocalDateTime(zone) ?: return ""
    return "${t.hour.pad()}:${t.minute.pad()}"
}

/** The two lines of a calendar tile: "OCT" and "19". */
fun calendarTile(iso: String): Pair<String, String> {
    val d = parseInstant(iso)?.toLocalDateTime(zone)?.date ?: return "" to ""
    return monthName(d.month.ordinal).uppercase() to d.day.toString()
}

/** "650 m away", "2.3 km away", or in [miles] "0.4 mi away". */
fun distance(meters: Int?, miles: Boolean = false): String = when {
    meters == null -> ""
    miles -> "${(maxOf(1, (meters / 160.934 + 0.5).toInt())) / 10.0} mi away".replace(".0 ", " ")
    meters < 1000 -> "${(meters / 50 + 1) * 50} m away"
    else -> "${(meters + 50) / 100 / 10.0} km away".replace(".0 ", " ")
}

/** A search radius as people say it: "25 km", or "16 mi" in [miles]. */
fun radiusLabel(km: Int, miles: Boolean): String = if (miles) "${(km / 1.609 + 0.5).toInt()} mi" else "$km km"

private fun Int.pad() = toString().padStart(2, '0')
private fun monthName(index: Int) =
    listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")[index]
