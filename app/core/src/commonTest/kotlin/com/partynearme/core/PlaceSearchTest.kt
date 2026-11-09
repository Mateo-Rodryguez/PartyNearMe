package com.partynearme.core

import com.partynearme.core.api.Place
import com.partynearme.core.api.PlaceSearch
import com.partynearme.core.model.LatLng
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails

class PlaceSearchTest {
    private fun feature(properties: String, lng: Double = 2.35, lat: Double = 48.85) =
        """{"geometry":{"coordinates":[$lng,$lat]},"properties":{$properties}}"""

    private fun answer(vararg features: String) = """{"features":[${features.joinToString(",")}]}"""

    @Test
    fun namesAVenueAndSaysWhereItIs() {
        val places = PlaceSearch.parse(
            answer(feature(""""osm_type":"N","osm_id":1,"name":"Rex Club","street":"Boulevard Poissonnière","housenumber":"5","city":"Paris","country":"France""""))
        )
        assertEquals(listOf(Place("N1", "Rex Club", "Boulevard Poissonnière 5, Paris, France", LatLng(48.85, 2.35))), places)
    }

    @Test
    fun usesTheStreetForAPlainAddressAndSkipsRepeats() {
        val places = PlaceSearch.parse(
            answer(
                feature(""""osm_type":"W","osm_id":2,"street":"Calle Mayor","housenumber":"10","city":"Madrid","country":"Spain""""),
                feature(""""osm_type":"R","osm_id":3,"name":"Berlin","city":"Berlin","country":"Germany""""),
                feature(""""osm_type":"N","osm_id":4"""),
                feature(""""osm_type":"N","osm_id":5,"name":"Berlin","city":"Berlin","country":"Germany""""),
            )
        )
        assertEquals(listOf("Calle Mayor 10" to "Madrid, Spain", "Berlin" to "Germany"), places.map { it.name to it.detail })
    }

    @Test
    fun asksNearTheMapAndFailsLoudly() = runTest {
        var asked = ""
        val ok = PlaceSearch(HttpClient(MockEngine { request ->
            asked = request.url.toString()
            respond(answer(), HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }))
        ok.search(" shoreditch ", LatLng(51.5, -0.07), language = "en")
        assertEquals("https://photon.komoot.io/api/?q=shoreditch&limit=6&lang=en&lat=51.5&lon=-0.07", asked)

        val down = PlaceSearch(HttpClient(MockEngine { respond("", HttpStatusCode.ServiceUnavailable) }))
        assertFails { down.search("x") }
    }
}
