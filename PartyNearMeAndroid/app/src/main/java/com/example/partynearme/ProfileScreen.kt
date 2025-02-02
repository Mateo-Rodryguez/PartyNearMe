package com.example.partynearme

import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import androidx.navigation.NavController
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.rememberImagePainter

data class PartyListing(
    val id: String,
    val imageUrl: String,
    val title: String
)
fun getSamplePartyListings(): List<PartyListing> {
    return listOf(

        PartyListing("1", "https://example.com/image1.jpg", "Party 1"),
        PartyListing("2", "https://example.com/image2.jpg", "Party 2"),
        PartyListing("3", "https://example.com/image3.jpg", "Party 3")
    )
}
@Composable
fun ProfileScreen(navController: NavController) {
    val partyListings = getSamplePartyListings()

    Column{
        Text(text = "Profile Screen", modifier = Modifier.padding(16.dp))
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            contentPadding = PaddingValues(4.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(partyListings) { party ->
                PartyItem(party)
            }
        }
    }

}
@Composable
fun PartyItem(party: PartyListing) {
    Column(
        modifier = Modifier
            .padding(4.dp)
            .fillMaxWidth()
    ){
        Image(
            painter = rememberImagePainter(data = party.imageUrl),
            contentDescription = party.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .aspectRatio(1f)
                .fillMaxWidth()
        )
        Text(text = party.title, modifier = Modifier.padding(4.dp))
    }

}
@Preview(showBackground = true)
@Composable
fun PreviewProfileScreen() {
    ProfileScreen(navController = NavController(LocalContext.current))
}