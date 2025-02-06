package com.example.partynearme

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.navigation.NavController
import kotlinx.coroutines.launch
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response
import android.widget.Toast
import androidx.compose.ui.tooling.preview.Preview
import android.content.SharedPreferences

@Composable
fun LoginSignupScreen(navController: NavController) {
    val (email, setUsername) = remember { mutableStateOf("") }
    val (password, setPassword) = remember { mutableStateOf("") }
    val (passwordVisible, setPasswordVisible) = remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()
    val context = LocalContext.current

    fun isValidEmail(email: String): Boolean {
        return email.contains("@")
    }

    fun registerUser(context: Context) {
        if (!isValidEmail(email)) {
            Toast.makeText(context, "Invalid email address", Toast.LENGTH_SHORT).show()
            return
        }
        val registerRequest = RegisterRequest(email, password)
        RetrofitInstance.getAuthService(context).registerUser(registerRequest).enqueue(object : Callback<User> {
            override fun onResponse(call: Call<User>, response: Response<User>) {
                if (response.isSuccessful) {
                    navController.navigate("forYou")
                } else {
                    val errorBody = response.errorBody()?.string()
                    val errorMessage = if (errorBody != null && errorBody.contains("User already exists")) {
                        "User already exists. Please use a different email."
                    } else {
                        "Registration failed. Please try again."
                    }
                    Toast.makeText(context, errorMessage, Toast.LENGTH_SHORT).show()
                    println("$errorBody")
                }
            }

            override fun onFailure(call: Call<User>, t: Throwable) {
                Toast.makeText(context, "Registration failed: ${t.message}", Toast.LENGTH_SHORT).show()
                println("${t.message}")
            }
        })
    }
    fun saveTokenToPrefs(context: Context, token: String) {
        val sharedPreferences: SharedPreferences = context.getSharedPreferences("MyPrefs", Context.MODE_PRIVATE)
        sharedPreferences.edit().putString("auth_token", token).apply()
    }

    fun saveUserIdToPrefs(context: Context, userId: Int) {
        val sharedPreferences = context.getSharedPreferences("MyAppPrefs", Context.MODE_PRIVATE)
        with(sharedPreferences.edit()) {
            putInt("userId", userId)
            apply()
        }
    }


    fun loginUser(context: Context, navController: NavController) {
        if (!isValidEmail(email)) {
            Toast.makeText(context, "Invalid email address", Toast.LENGTH_SHORT).show()
            return
        }

        val loginRequest = LoginRequest(email, password)
        RetrofitInstance.getAuthService(context).login(loginRequest).enqueue(object : Callback<LoginResponse> {
            override fun onResponse(call: Call<LoginResponse>, response: Response<LoginResponse>) {
                if (response.isSuccessful) {
                    val loginData = response.body()
                    loginData?.let {
                        saveTokenToPrefs(context, it.token)  // ✅ Store token
                        saveUserIdToPrefs(context, it.userId)  // ✅ Store userId
                        navController.navigate("forYou")  // ✅ Navigate to ForYouScreen
                    } ?: run {
                        Toast.makeText(context, "Login data is null", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    Toast.makeText(context, "Login failed: ${response.errorBody()?.string()}", Toast.LENGTH_SHORT).show()
                    println("${response.errorBody()?.string()}")
                }
            }

            override fun onFailure(call: Call<LoginResponse>, t: Throwable) {
                Toast.makeText(context, "Login failed: ${t.message}", Toast.LENGTH_SHORT).show()
                println("${t.message}")
            }
        })
    }

    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        TextField(
            value = email,
            onValueChange = { setUsername(it) },
            label = { Text("Email") }
        )
        TextField(
            value = password,
            onValueChange = { setPassword(it)},
            label = { Text("Password") },
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                val image = if (passwordVisible)
                    Icons.Filled.Visibility
                else Icons.Filled.VisibilityOff
                IconButton(onClick = { setPasswordVisible(!passwordVisible) }) {
                    Icon(imageVector = image, contentDescription = if (passwordVisible) "Hide password" else "Show password")
                }
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
        )
        Button(onClick = { coroutineScope.launch { loginUser(context, navController) } }) {
            Text("Log in")
        }
        Button(onClick = { coroutineScope.launch { registerUser(context) } }) {
            Text("Register")
        }
    }
}
@Preview(showBackground = true)
@Composable
fun PreviewLoginSignupScreen() {
    LoginSignupScreen(navController = NavController(LocalContext.current))
}