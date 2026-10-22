package lk.motormila.app.ui.theme

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color

/**
 * Legacy `Motormila*` colour constants predate the theme-aware [MmColors]
 * system and were dark-only, so Light mode showed dark cards with dark text
 * on secondary screens (QA 2026-10-22). They now follow the active theme:
 * [MotormilaTheme] sets [isDark]; reads are snapshot state, so composition
 * and draw lambdas update when the user switches theme. Works in non-
 * composable scopes too (DrawScope, remember blocks), unlike a CompositionLocal.
 * Prefer `MmColors.current` in new code.
 */
object LegacyPalette {
    var isDark: Boolean by mutableStateOf(false)
}

// Dark-first tokens - Motormila brand matching web (tailwind / index.css)
val MotormilaBg: Color get() = if (LegacyPalette.isDark) Color(0xFF09090B) else Color(0xFFF5F5F7)
val MotormilaSurface: Color get() = if (LegacyPalette.isDark) Color(0xFF0F0F12) else Color(0xFFFFFFFF)
val MotormilaSurfaceLow: Color get() = if (LegacyPalette.isDark) Color(0xFF0D0D10) else Color(0xFFF5F5F7)
val MotormilaSurfaceHigh: Color get() = if (LegacyPalette.isDark) Color(0xFF16161A) else Color(0xFFF0F0F3)
val MotormilaSurfaceHighest: Color get() = if (LegacyPalette.isDark) Color(0xFF1F1F24) else Color(0xFFE6E6EA)
val MotormilaOnSurface: Color get() = if (LegacyPalette.isDark) Color(0xFFF5F5F7) else Color(0xFF0B0B0F)
val MotormilaSecondaryText: Color get() = if (LegacyPalette.isDark) Color(0xFF8E8E93) else Color(0xFF55555F)
val MotormilaOutline: Color get() = if (LegacyPalette.isDark) Color(0x1FFFFFFF) else Color(0x1A000000)
val MotormilaGlassBorder: Color get() = if (LegacyPalette.isDark) Color(0x22FFFFFF) else Color(0x1F000000)

// Brand accent: Motormila Electric Blue
val MotormilaPrimary = Color(0xFF0A7AFFL)
val MotormilaPrimaryBright: Color get() = if (LegacyPalette.isDark) Color(0xFF3D94FF) else Color(0xFF0062D6)
val MotormilaPrimaryGlow = Color(0x330A7AFFL)
val MotormilaOnPrimary = Color(0xFFFFFFFFL)

// Shared alpha variants — use these instead of raw ARGB hex or .copy(alpha=).
// Pairs with the Motormila*Container family below.
val MotormilaPrimaryContainer = Color(0x2E0A7AFFL) // 18% blue — tinted surfaces, highlights
val MotormilaPrimaryBorder = Color(0x550A7AFFL) // 33% blue — highlighted borders
val MotormilaPrimarySoft = Color(0x1A0A7AFFL) // 10% blue — soft washes
val MotormilaGoodSoft = Color(0x5500C853L) // 33% green — deal borders

// Legacy alias kept for call sites still using Gold naming
val MotormilaGold = Color(0xFF0A7AFFL)
val MotormilaOnGold = Color(0xFFFFFFFFL)

// Semantic deal and signal tokens
val MotormilaTeal = Color(0xFF38BDF8L)
val MotormilaSky = Color(0xFF3D94FFL)
val MotormilaGood = Color(0xFF00C853L)
val MotormilaGoodContainer = Color(0x2E00C853L)
val MotormilaGoodText: Color get() = if (LegacyPalette.isDark) Color(0xFF69F0AE) else Color(0xFF1A7440)
val MotormilaWarn = Color(0xFFF59E0BL)
val MotormilaWarnContainer = Color(0x2EF59E0BL)
val MotormilaBad = Color(0xFFEF4444L)
val MotormilaBadContainer = Color(0x2EEF4444L)
val MotormilaBadText: Color get() = if (LegacyPalette.isDark) Color(0xFFFCA5A5) else Color(0xFFB91C1C)

// Light scheme tokens
val MotormilaLightBg = Color(0xFFFBFBFDL)
val MotormilaLightSurface = Color(0xFFFFFFFFL)
val MotormilaLightContainer = Color(0xFFF5F5F7L)
val MotormilaLightHigh = Color(0xFFEBEBF0L)
val MotormilaLightOnSurface = Color(0xFF1A1A1CL)
val MotormilaLightVariant = Color(0xFF6E6E73L)
val MotormilaLightPrimary = Color(0xFF0A7AFFL)
val MotormilaLightOnPrimary = Color(0xFFFFFFFFL)
val MotormilaLightGoldContainer = Color(0x1A0A7AFFL)
val MotormilaLightGood = Color(0xFF059669L)
val MotormilaLightWarn = Color(0xFFD97706L)
val MotormilaLightBad = Color(0xFFDC2626L)
val MotormilaLightOutline = Color(0x1A000000L)
