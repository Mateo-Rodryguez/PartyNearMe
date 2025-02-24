package com.example.partynearme

import android.content.Context
import android.content.SharedPreferences
import android.content.Intent
import androidx.navigation.NavController

private const val PREFS_NAME = "PartyNearMePrefs"
private const val KEY_USER_ID = "userId"

fun saveUserIdToPrefs(context: Context, userId: Int) {
    val sharedPreferences: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    sharedPreferences.edit().putInt(KEY_USER_ID, userId).apply()
}

fun getUserIdFromPrefs(context: Context): Int {
    val sharedPreferences = context.getSharedPreferences("MyAppPrefs", Context.MODE_PRIVATE)
    return sharedPreferences.getInt("userId", -1) // Default value is -1 if not found
}


fun clearUserIdFromPrefs(context: Context) {
    val sharedPreferences: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    sharedPreferences.edit().remove(KEY_USER_ID).apply()
}
fun logout(context: Context, navController: NavController) {
    clearUserIdFromPrefs(context)
    navController.navigate("loginSignup") {
        popUpTo("login"){
            inclusive = true
        }
    }
}