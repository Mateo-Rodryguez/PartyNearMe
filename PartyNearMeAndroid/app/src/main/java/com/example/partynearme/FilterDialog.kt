package com.example.partynearme

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicText
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Alignment

@Composable
fun InterestDialog(
    interests: List<Interest>,
    onDismiss: () -> Unit,
    onConfirm: (List<Int>) -> Unit
) {
    var selectedInterests by remember { mutableStateOf(emptyList<Int>()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(text = "Select Interests") },
        text = {
            Column {
                interests.forEach { interest ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = selectedInterests.contains(interest.id),
                            onCheckedChange = { isChecked ->
                                selectedInterests = if (isChecked) {
                                    selectedInterests + interest.id
                                } else {
                                    selectedInterests - interest.id
                                }
                            }
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        BasicText(text = interest.name)
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                onConfirm(selectedInterests)
                onDismiss()
            }) {
                Text("Confirm")
            }
        },
        dismissButton = {
            Button(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Preview(showBackground = true)
@Composable
fun PreviewInterestDialog() {
    val interests = listOf(
        Interest(1, "music"),
        Interest(2, "sports"),
        Interest(3, "fitness"),
        Interest(4, "food"),
        Interest(5, "travel"),
        Interest(6, "tech"),
        Interest(7, "fashion"),
        Interest(8, "art"),
        Interest(9, "gaming"),
        Interest(10, "other")
    )
    InterestDialog(interests, onDismiss = {}, onConfirm = {})
}