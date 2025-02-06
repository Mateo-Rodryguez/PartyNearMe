package com.example.partynearme
import io.socket.client.Socket
import io.socket.client.IO
import java.net.URISyntaxException
class SocketHandler {
    lateinit var socket: Socket

    @Synchronized
    fun setupSocket() {
        try {
            socket = IO.socket("http://10.0.2.2:2000")
        } catch (e: URISyntaxException) {
            e.printStackTrace()
        }
    }
    @Synchronized
    fun retreiveSocket(): Socket {
        return socket
    }
}