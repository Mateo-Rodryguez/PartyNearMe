package com.partynearme.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * The brand. It follows the phone's light or dark setting:
 * - Night (dark): near-black with a violet tint and a hot pink to violet gradient,
 *   the look of a club at night. Violet reads as exciting and a little mysterious.
 * - Day (light): warm cream with a coral to pink gradient, like a sunset. Warm
 *   orange and coral read as friendly, social and energetic, which is what planning
 *   a night out with friends should feel like; cool greys would feel corporate.
 * Photos and one gradient do the talking in both.
 */
object Brand {
    val Pink = Color(0xFFFF3D7F)
    val Violet = Color(0xFF8B5CF6)
    val Orange = Color(0xFFFF8A3D)
    val Coral = Color(0xFFFF5A4E)

    val Night = Color(0xFF0B0A10)

    /** Main buttons, my chat bubbles, the selected chip. */
    val gradient: Brush
        @Composable get() = LocalPalette.current.gradient
    /** The wordmark and the rings around people and parties. */
    val sunset: Brush
        @Composable get() = LocalPalette.current.sunset
    /** The two soft lights behind the sign-in screen. */
    val glow: Pair<Color, Color>
        @Composable get() = LocalPalette.current.glow
    /** True in the dark theme, for the few things that differ beyond colours, such as the map style. */
    val isNight: Boolean
        @Composable get() = LocalPalette.current.night

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

private class Palette(val night: Boolean, val gradient: Brush, val sunset: Brush, val glow: Pair<Color, Color>)

private val NightPalette = Palette(
    night = true,
    gradient = Brush.linearGradient(listOf(Brand.Pink, Brand.Violet)),
    sunset = Brush.linearGradient(listOf(Brand.Orange, Brand.Pink, Brand.Violet)),
    glow = Brand.Pink.copy(alpha = 0.35f) to Brand.Violet.copy(alpha = 0.3f),
)

private val DayPalette = Palette(
    night = false,
    gradient = Brush.linearGradient(listOf(Brand.Coral, Brand.Pink)),
    sunset = Brush.linearGradient(listOf(Brand.Orange, Brand.Coral, Brand.Pink)),
    glow = Brand.Orange.copy(alpha = 0.22f) to Brand.Pink.copy(alpha = 0.18f),
)

private val LocalPalette = staticCompositionLocalOf { NightPalette }

private val NightColors = darkColorScheme(
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
    surfaceVariant = Color(0xFF1C1927),
    onSurfaceVariant = Color(0xFFA29EB4),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFF07060B),
    surfaceContainerLow = Color(0xFF14121C),
    surfaceContainer = Color(0xFF14121C),
    surfaceContainerHigh = Color(0xFF1C1927),
    surfaceContainerHighest = Color(0xFF262233),
    inverseSurface = Color(0xFFF5F3FA),
    inverseOnSurface = Brand.Night,
    outline = Color(0xFF4A4459),
    outlineVariant = Color(0xFF2C2839),
    error = Color(0xFFFF5A5F),
    onError = Color.White,
)

private val DayColors = lightColorScheme(
    // A deeper pink than the night one, so text and icons in it pass contrast on cream.
    primary = Color(0xFFE11D63),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE1E8),
    onPrimaryContainer = Color(0xFF8A0F3C),
    secondary = Brand.Coral,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFE4DC),
    onSecondaryContainer = Color(0xFF7A2318),
    tertiary = Brand.Orange,
    onTertiary = Color.White,
    background = Color(0xFFFFF8F4),
    onBackground = Color(0xFF221A1D),
    surface = Color(0xFFFFF8F4),
    onSurface = Color(0xFF221A1D),
    surfaceVariant = Color(0xFFF7E8E2),
    onSurfaceVariant = Color(0xFF6E6064),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFFF1EC),
    surfaceContainer = Color(0xFFFFF1EC),
    surfaceContainerHigh = Color(0xFFF9E6E0),
    surfaceContainerHighest = Color(0xFFF2DBD4),
    inverseSurface = Color(0xFF221A1D),
    inverseOnSurface = Color(0xFFFFF8F4),
    outline = Color(0xFFB9A7A2),
    outlineVariant = Color(0xFFEBD9D3),
    error = Color(0xFFD92D3A),
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

/** Follows the phone's light or dark setting. */
@Composable
fun PartyTheme(night: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalPalette provides if (night) NightPalette else DayPalette) {
        MaterialTheme(colorScheme = if (night) NightColors else DayColors, typography = Type, shapes = Shape, content = content)
    }
}
