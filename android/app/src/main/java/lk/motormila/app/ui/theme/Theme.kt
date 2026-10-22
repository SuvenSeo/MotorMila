package lk.motormila.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.platform.LocalView
import androidx.core.os.LocaleListCompat
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.view.WindowCompat

private fun MmColors.toMaterial(): ColorScheme {
    val base = if (isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        background = background,
        onBackground = textPrimary,
        surface = surface,
        onSurface = textPrimary,
        surfaceVariant = surfaceHigh,
        onSurfaceVariant = textSecondary,
        surfaceContainerLowest = background,
        surfaceContainerLow = surface,
        surfaceContainer = surface,
        surfaceContainerHigh = surfaceRaised,
        surfaceContainerHighest = surfaceHigh,
        surfaceBright = surfaceHigh,
        surfaceDim = background,
        surfaceTint = brand,
        inverseSurface = textPrimary,
        inverseOnSurface = background,
        outline = outlineStrong,
        outlineVariant = outline,
        primary = brand,
        onPrimary = textOnBrand,
        primaryContainer = brandContainer,
        onPrimaryContainer = onBrandContainer,
        inversePrimary = brandText,
        secondary = brandText,
        onSecondary = textOnBrand,
        secondaryContainer = surfaceHigh,
        onSecondaryContainer = textPrimary,
        tertiary = dealGreat,
        onTertiary = textOnBrand,
        tertiaryContainer = dealGreatContainer,
        onTertiaryContainer = onDealGreat,
        error = danger,
        onError = textOnBrand,
        errorContainer = dealHighContainer,
        onErrorContainer = onDealHigh,
        scrim = scrim,
    )
}

/**
 * MotorMila theme (design system v2). Light-first (the app default since
 * apple-polish); [darkTheme] = true gives the full dark scheme. Dynamic colour is deliberately OFF: brand tokens win
 * over wallpaper tints.
 *
 * Provides [MmColors.current], [MmType.current] (body face follows the app
 * language: si → Noto Sans Sinhala, ta → Noto Sans Tamil), and
 * [MmMotion.reduced]. MaterialTheme colour/type/shape are mapped from the
 * same tokens so stock M3 widgets match.
 *
 * System bars: edge-to-edge is enabled in MainActivity; here we only flip
 * the icon appearance (light icons on dark, dark icons on light). Bars stay
 * transparent; screens draw their own translucent backing under them.
 */
@Composable
fun MotormilaTheme(
    darkTheme: Boolean = false,
    reducedMotion: Boolean? = null,
    languageTag: String? = null,
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) MmColors.Dark else MmColors.Light
    // Legacy Motormila* constants follow the theme (see LegacyPalette).
    if (LegacyPalette.isDark != darkTheme) LegacyPalette.isDark = darkTheme
    val scheme = remember(colors) { colors.toMaterial() }
    val inspection = LocalInspectionMode.current
    val lang = languageTag ?: if (inspection) null else remember {
        runCatching {
            val locales: LocaleListCompat = AppCompatDelegate.getApplicationLocales()
            if (locales.isEmpty) java.util.Locale.getDefault().language else locales[0]?.language
        }.getOrNull()
    }
    val type = remember(lang) { MmType.forLanguage(lang) }
    val reduced = reducedMotion ?: rememberSystemReducedMotion()

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }

    CompositionLocalProvider(
        LocalMmColors provides colors,
        LocalMmType provides type,
        LocalMmReducedMotion provides reduced,
    ) {
        MaterialTheme(
            colorScheme = scheme,
            typography = remember(type) { type.toMaterial() },
            shapes = MotormilaShapes,
        ) {
            // Root content colour: any Text/Icon without an explicit colour and
            // outside an M3 Surface used to fall back to LocalContentColor's
            // default (black), which vanished on dark grounds (e.g. Alerts'
            // sign-in card title, the Detail deal ladder values).
            CompositionLocalProvider(LocalContentColor provides colors.textPrimary) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(colors.background),
                ) {
                    if (darkTheme) MotormilaAmbient()
                    content()
                }
            }
        }
    }
}
