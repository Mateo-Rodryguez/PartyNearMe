package com.example.partynearme

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import android.content.Context

object RetrofitInstance {
    private const val BASE_URL = "https://10.0.2.2:5000"

    private fun getRetrofit(context: Context): Retrofit {
        return Retrofit.Builder()
            .baseUrl(BASE_URL)
            .addConverterFactory(GsonConverterFactory.create())
            .client(CustomOkHttpClient.getClient(context))
            .build()
    }

    fun getApiService(context: Context): ApiService {
        return getRetrofit(context).create(ApiService::class.java)
    }
    fun getAuthService(context: Context): AuthService {
        return getRetrofit(context).create(AuthService::class.java)
    }
}