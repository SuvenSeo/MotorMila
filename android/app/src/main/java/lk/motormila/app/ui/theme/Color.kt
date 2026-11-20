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

// Legacy Motormila* tokens now DELEGATE to the v3 MmColors palette, so the
// ~53 legacy screens inherit the warm night-showroom grounds, AA text tiers,
// unified deal-green and three-role blue without a per-file migration.
// Single source of truth = MmColors.Dark / MmColors.Light. Getters read the
// snapshot-state [LegacyPalette.isDark], so they work in draw/remember scopes.
private fun legacy(dark: Boolean): MmColors = if (dark) MmColors.Dark else MmColors.Light

val MotormilaBg: Color get() = legacy(LegacyPalette.isDark).background
val MotormilaSurface: Color get() = legacy(LegacyPalette.isDark).surface
val MotormilaSurfaceLow: Color get() = legacy(LegacyPalette.isDark).background
val MotormilaSurfaceHigh: Color get() = legacy(LegacyPalette.isDark).surfaceHigh
val MotormilaSurfaceHighest: Color get() = legacy(LegacyPalette.isDark).surfaceHigh
val MotormilaOnSurface: Color get() = legacy(LegacyPalette.isDark).textPrimary
val MotormilaSecondaryText: Color get() = legacy(LegacyPalette.isDark).textSecondary
val MotormilaOutline: Color get() = legacy(LegacyPalette.isDark).outline
val MotormilaGlassBorder: Color get() = legacy(LegacyPalette.isDark).outlineStrong

// Brand: MotormilaPrimary is now the AA-safe FILL (white label >= 4.5:1).
val MotormilaPrimary: Color get() = legacy(LegacyPalette.isDark).brand
val MotormilaPrimaryBright: Color get() = legacy(LegacyPalette.isDark).brandText
val MotormilaPrimaryGlow: Color get() = legacy(LegacyPalette.isDark).brandContainer
val MotormilaOnPrimary: Color get() = legacy(LegacyPalette.isDark).textOnBrand

val MotormilaPrimaryContainer: Color get() = legacy(LegacyPalette.isDark).brandContainer
val MotormilaPrimaryBorder: Color get() = legacy(LegacyPalette.isDark).brand.copy(alpha = 0.33f)
val MotormilaPrimarySoft: Color get() = legacy(LegacyPalette.isDark).brand.copy(alpha = 0.10f)
val MotormilaGoodSoft: Color get() = legacy(LegacyPalette.isDark).dealGood.copy(alpha = 0.33f)

// Legacy Gold naming aliases -> brand
val MotormilaGold: Color get() = legacy(LegacyPalette.isDark).brand
val MotormilaOnGold: Color get() = legacy(LegacyPalette.isDark).textOnBrand

// Semantic deal + signal tokens (unified with the v2 deal bands; teal retired
// in favour of the brand blue so nothing off-palette ships).
val MotormilaTeal: Color get() = legacy(LegacyPalette.isDark).brandText
val MotormilaSky: Color get() = legacy(LegacyPalette.isDark).brandText
val MotormilaGood: Color get() = legacy(LegacyPalette.isDark).dealGood
val MotormilaGoodContainer: Color get() = legacy(LegacyPalette.isDark).dealGoodContainer
val MotormilaGoodText: Color get() = legacy(LegacyPalette.isDark).onDealGood
val MotormilaWarn: Color get() = legacy(LegacyPalette.isDark).caution
val MotormilaWarnContainer: Color get() = legacy(LegacyPalette.isDark).cautionContainer
val MotormilaBad: Color get() = legacy(LegacyPalette.isDark).dealHigh
val MotormilaBadContainer: Color get() = legacy(LegacyPalette.isDark).dealHighContainer
val MotormilaBadText: Color get() = legacy(LegacyPalette.isDark).onDealHigh

// Light scheme aliases (kept for call sites) -> the v3 light palette.
val MotormilaLightBg: Color get() = MmColors.Light.background
val MotormilaLightSurface: Color get() = MmColors.Light.surface
val MotormilaLightContainer: Color get() = MmColors.Light.background
val MotormilaLightHigh: Color get() = MmColors.Light.surfaceHigh
val MotormilaLightOnSurface: Color get() = MmColors.Light.textPrimary
val MotormilaLightVariant: Color get() = MmColors.Light.textSecondary
val MotormilaLightPrimary: Color get() = MmColors.Light.brand
val MotormilaLightOnPrimary: Color get() = MmColors.Light.textOnBrand
val MotormilaLightGoldContainer: Color get() = MmColors.Light.brandContainer
val MotormilaLightGood: Color get() = MmColors.Light.dealGood
val MotormilaLightWarn: Color get() = MmColors.Light.caution
val MotormilaLightBad: Color get() = MmColors.Light.dealHigh
val MotormilaLightOutline: Color get() = MmColors.Light.outline
