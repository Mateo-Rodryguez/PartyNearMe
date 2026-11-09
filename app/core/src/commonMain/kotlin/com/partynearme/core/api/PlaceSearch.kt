package com.partynearme.core.api

import com.partynearme.core.model.LatLng
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** A place found by search: where it is, and how to show it in a list. */
data class Place(
    val id: String,
    val name: String,
    /** Street, town and country, whatever is known beyond the name. */
    val detail: String,
    val spot: LatLng,
)

/**
 * Finds places and addresses for the party map with Photon: free OpenStreetMap
 * search made for search-as-you-type, no key or account. The web app uses the
 * same service (web/src/lib/places.ts), so results match across platforms.
 */
class PlaceSearch(private val http: HttpClient, private val host: String = HOST) {
    /** Places matching [text], those nearest [near] first. Throws when the service can't be reached. */
    suspend fun search(text: String, near: LatLng? = null, language: String? = null): List<Place> {
        val response = http.get("$host/api/") {
            parameter("q", text.trim())
            parameter("limit", 6)
            // Photon names places in English, German, French or the local language.
            language?.takeIf { it in setOf("en", "de", "fr") }?.let { parameter("lang", it) }
            near?.let {
                parameter("lat", it.lat)
                parameter("lon", it.lng)
            }
        }
        if (!response.status.isSuccess()) throw IllegalStateException("Place search failed (${response.status.value})")
        return parse(response.bodyAsText())
    }

    companion object {
        const val HOST = "https://photon.komoot.io"
        private val json = Json { ignoreUnknownKeys = true }

        /** Photon's answer as places, order kept, unnamed and duplicate ones dropped. */
        fun parse(body: String): List<Place> {
            val seen = mutableSetOf<String>()
            return json.decodeFromString<Answer>(body).features.mapNotNull { f ->
                val p = f.properties
                val street = listOfNotNull(p.street, p.housenumber).joinToString(" ")
                val name = p.name ?: street.ifEmpty { return@mapNotNull null }
                val detail = listOf(street.takeIf { it != name }, p.district, p.city.takeIf { it != name }, p.country)
                    .filterNot { it.isNullOrEmpty() }
                    .joinToString(", ")
                if (!seen.add("$name|$detail") || f.geometry.coordinates.size < 2) return@mapNotNull null
                val (lng, lat) = f.geometry.coordinates
                Place(id = "${p.osm_type.orEmpty()}${p.osm_id ?: "$lng,$lat"}", name = name, detail = detail, spot = LatLng(lat, lng))
            }
        }
    }

    @Serializable private class Answer(val features: List<Feature> = emptyList())
    @Serializable private class Feature(val geometry: Geometry, val properties: Properties = Properties())
    @Serializable private class Geometry(val coordinates: List<Double> = emptyList())

    @Suppress("PropertyName")
    @Serializable
    private class Properties(
        val osm_type: String? = null,
        val osm_id: Long? = null,
        val name: String? = null,
        val housenumber: String? = null,
        val street: String? = null,
        val district: String? = null,
        val city: String? = null,
        val country: String? = null,
    )
}
