package com.example.partynearme

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import com.example.partynearme.ui.theme.PartyNearMeTheme
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PartyNearMeTheme {
                // A surface container using the 'background' color from the theme
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    appNavigator()
                }
            }
        }
    }
}
@Composable
fun appNavigator(){
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = "forYou"){
        composable("main"){
            greeting("Android", navController, Modifier)
        }
        composable("forYou"){
            forYouScreen()
        }
    }
}
@Composable
fun greeting(name: String, navController: NavHostController, modifier: Modifier) {
Button(onClick = { navController.navigate("forYou") }){
    Text(text = "Go to For You Screen")
}
}

@Preview(showBackground = true)
@Composable
fun greetingPreview() {
    PartyNearMeTheme {
        greeting("Android", rememberNavController(), Modifier)
    }
}