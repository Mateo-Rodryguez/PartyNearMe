package com.example.partynearme

import android.content.Context
import okhttp3.OkHttpClient
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

object CustomOkHttpClient {
    fun getClient(context: Context): OkHttpClient {
        val certificateFactory = CertificateFactory.getInstance("X.509")
        val inputStream = context.resources.openRawResource(R.raw.server)
        val certificate = certificateFactory.generateCertificate(inputStream) as X509Certificate
        inputStream.close()

        val keyStore = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
            load(null, null)
            setCertificateEntry("server", certificate)
        }
        val trustManagerFactory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply {
            init(keyStore)
        }

        val trustManagers = trustManagerFactory.trustManagers
        val sslContext = SSLContext.getInstance("TLS").apply {
            init(null, trustManagers, null)
        }

        val trustManager = trustManagers[0] as X509TrustManager

        return OkHttpClient.Builder()
            .sslSocketFactory(sslContext.socketFactory, trustManager)
            .build()

    }
}