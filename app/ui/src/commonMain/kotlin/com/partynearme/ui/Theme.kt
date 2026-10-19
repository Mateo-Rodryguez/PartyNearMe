package com.partynearme.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * The brand: a night-out look, dark in every system setting, the way nightlife apps
 * such as Dice and Resident Advisor are, with photos and one hot gradient doing the talking.
 */
object Brand {
    val Pink = Color(0xFFFF3D7F)
    val Violet = Color(0xFF8B5CF6)
    val Orange = Color(0xFFFF8A3D)

    val Night = Color(0xFF0B0A10)
    val Surface1 = Color(0xFF14121C)
    val Surface2 = Color(0xFF1C1927)
    val Surface3 = Color(0xFF262233)
    val Line = Color(0xFF2C2839)
    val TextMuted = Color(0xFFA29EB4)

    /** Main buttons, my chat bubbles, the selected chip. */
    val gradient = Brush.linearGradient(listOf(Pink, Violet))
    /** The wordmark and the rings around people and parties. */
    val sunset = Brush.linearGradient(listOf(Orange, Pink, Violet))
    /** Darkens the bottom of a photo so white text on it stays readable. */
    val scrim = Brush.verticalGradient(listOf(Color.Transparent, Color(0xCC000000)))

    /** Fallback covers for parties without a photo: one pair per party, picked from its name. */
    private val covers = listOf(
        listOf(Color(0xFFFF3D7F), Color(0xFF6D28D9)),
        listOf(Color(0xFFFF8A3D), Color(0xFFDB2777)),
        listOf(Color(0xFF06B6D4), Color(0xFF7C3AED)),
        listOf(Color(0xFF8B5CF6), Color(0xFF1E1B4B)),
        listOf(Color(0xFF22C55E), Color(0xFF0E7490)),
    )

    fun coverFor(key: String): Brush = Brush.linearGradient(covers[(key.hashCode() and Int.MAX_VALUE) % covers.size])
}

private val Colors = darkColorScheme(
    primary = Brand.Pink,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF3B1029),
    onPrimaryContainer = Color(0xFFFFB3CC),
    secondary = Brand.Violet,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFF2A1F4D),
    onSecondaryContainer = Color(0xFFD9CCFF),
    tertiary = Brand.Orange,
    onTertiary = Color.White,
    background = Brand.Night,
    onBackground = Color(0xFFF5F3FA),
    surface = Brand.Night,
    onSurface = Color(0xFFF5F3FA),
    surfaceVariant = Brand.Surface2,
    onSurfaceVariant = Brand.TextMuted,
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFF07060B),
    surfaceContainerLow = Brand.Surface1,
    surfaceContainer = Brand.Surface1,
    surfaceContainerHigh = Brand.Surface2,
    surfaceContainerHighest = Brand.Surface3,
    inverseSurface = Color(0xFFF5F3FA),
    inverseOnSurface = Brand.Night,
    outline = Color(0xFF4A4459),
    outlineVariant = Brand.Line,
    error = Color(0xFFFF5A5F),
    onError = Color.White,
)

private val base = Typography()

/** Heavier, tighter headings than Material's defaults: the look of current social apps. */
private val Type = Typography(
    displaySmall = base.displaySmall.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.03).em),
    headlineLarge = base.headlineLarge.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.03).em),
    headlineMedium = base.headlineMedium.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.02).em),
    headlineSmall = base.headlineSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.02).em),
    titleLarge = base.titleLarge.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.01).em),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.sp),
    titleSmall = base.titleSmall.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.sp),
    bodyLarge = base.bodyLarge.copy(letterSpacing = 0.sp),
    bodyMedium = base.bodyMedium.copy(letterSpacing = 0.sp),
    bodySmall = base.bodySmall.copy(letterSpacing = 0.sp),
    labelLarge = base.labelLarge.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.sp),
    labelMedium = base.labelMedium.copy(fontWeight = FontWeight.SemiBold),
    labelSmall = base.labelSmall.copy(fontWeight = FontWeight.SemiBold),
)

private val Shape = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

/** Small all-caps label above a section or on a card. */
val Overline = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.08.em)

@Composable
fun PartyTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, typography = Type, shapes = Shape, content = content)
}
