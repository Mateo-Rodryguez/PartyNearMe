package com.example.partynearme

import okhttp3.*

class WebSocketClient(private val url: String, private val listener: WebSocketListener) {
    private val client = OkHttpClient()
    fun connect(): WebSocket {
        val request = Request.Builder().url(url).build()
        return client.newWebSocket(request, listener)
    }
}