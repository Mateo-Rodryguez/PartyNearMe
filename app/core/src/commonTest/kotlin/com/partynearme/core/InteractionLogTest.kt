package com.partynearme.core

import com.partynearme.core.api.InteractionLog
import com.partynearme.core.model.Interaction
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

class InteractionLogTest {
    @Test
    fun batchesAndCountsEachImpressionOnce() = runTest {
        val sent = mutableListOf<List<Interaction>>()
        val log = InteractionLog({ sent += it }, batchSize = 3)
        log.impression("p1")
        log.impression("p1")
        log.dwell("p1", 200) // too short to count
        log.impression("p2")
        assertEquals(0, sent.size)
        log.dwell("p2", 5_000)
        assertEquals(listOf("impression", "impression", "dwell"), sent.single().map { it.kind })
        log.flush()
        assertEquals(1, sent.size)
    }

    @Test
    fun countsAnImpressionOncePerListAndKeepsWhereItWas() = runTest {
        val sent = mutableListOf<Interaction>()
        val log = InteractionLog({ sent += it })
        log.impression(eventId = "e1", surface = "for_you_parties", serveId = "s1", position = 0)
        log.impression(eventId = "e1", surface = "for_you_parties", serveId = "s1", position = 0)
        log.impression(eventId = "e1", surface = "nearby", position = 3)
        log.open(eventId = "e1", surface = "for_you_parties", serveId = "s1", position = 0)
        log.flush()
        assertEquals(listOf("impression", "impression", "open"), sent.map { it.kind })
        assertEquals(listOf("for_you_parties", "nearby", "for_you_parties"), sent.map { it.surface })
        assertEquals(listOf("s1", null, "s1"), sent.map { it.serveId })
        assertEquals(listOf(0, 3, 0), sent.map { it.position })
    }

    @Test
    fun notInterestedIsSentRightAwayAndFailuresAreDropped() = runTest {
        var calls = 0
        val log = InteractionLog({ calls++; error("offline") })
        log.notInterested("p1")
        log.flush()
        assertEquals(1, calls)
    }
}
