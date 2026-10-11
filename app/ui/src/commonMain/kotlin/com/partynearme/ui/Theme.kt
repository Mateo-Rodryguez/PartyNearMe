package com.partynearme.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Magenta = Color(0xFFD6246E)
private val Violet = Color(0xFF6C3BD1)

private val Light = lightColorScheme(
    primary = Magenta,
    onPrimary = Color.White,
    secondary = Violet,
    onSecondary = Color.White,
)

private val Dark = darkColorScheme(
    primary = Color(0xFFFF6FA3),
    onPrimary = Color(0xFF3E0020),
    secondary = Color(0xFFB79BFF),
    onSecondary = Color(0xFF250066),
)

@Composable
fun PartyTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
