package lk.motormila.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import lk.motormila.app.domain.model.DealBand

/**
 * MotorMila colour tokens (design system v2, Oct 2026). Dark-first, matching
 * the web: Ink ground, Motormila Blue for actions, Deal Green reserved for
 * underpriced signals. Read with `MmColors.current` inside [MotormilaTheme].
 *
 * Deal colours mirror the web tokens (src/styles/tokens.css) exactly:
 * great / good / fair (neutral, not a win) / high / caution (amber, verify-first). Each comes as a
 * solid (`dealGreat`), a tinted container (`dealGreatContainer`) and the text
 * colour that reads on that container (`onDealGreat`).
 */
@Immutable
data class MmColors(
    val isDark: Boolean,
    // Ground + surfaces (low → high elevation)
    val background: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val surfaceHigh: Color,
    val surfaceOverlay: Color, // translucent bars / scrims-on-scroll
    val scrim: Color,
    // Content
    val textPrimary: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val textOnBrand: Color,
    // Lines
    val outline: Color,
    val outlineStrong: Color,
    // Brand
    val brand: Color,
    val brandPressed: Color,
    val brandText: Color, // brand colour safe for text on background
    val brandBright: Color, // mark / rings / decoration only (never a white-label fill)
    val brandContainer: Color,
    val onBrandContainer: Color,
    // Deal bands
    val dealGreat: Color,
    val dealGreatContainer: Color,
    val onDealGreat: Color,
    val dealGood: Color,
    val dealGoodContainer: Color,
    val onDealGood: Color,
    val dealFair: Color,
    val dealFairContainer: Color,
    val onDealFair: Color,
    val dealHigh: Color,
    val dealHighContainer: Color,
    val onDealHigh: Color,
    val caution: Color,
    val cautionContainer: Color,
    val onCaution: Color,
    // Status
    val success: Color,
    val danger: Color,
    // Skeleton
    val skeletonBase: Color,
    val skeletonHighlight: Color,
    // Stage ink: the web's night-drive band (cinematic.css --stage-ink) under
    // the Home hero and the Detail title/price. Identical in both themes.
    val stage: Color = Color(0xFF05060B),
    val onStage: Color = Color(0xFFF8F5F2),
    val onStageSecondary: Color = Color(0xC7F8F5F2),
    val stageHairline: Color = Color(0x14FFFFFF),
    val stageAccent: Color = Color(0xFF70B1FF), // hsl(213 100% 72%): small blue text on stage
) {
    companion object {
        val Dark = MmColors(
            isDark = true,
            background = Color(0xFF0C0A09),
            surface = Color(0xFF14110F),
            surfaceRaised = Color(0xFF1A1614),
            surfaceHigh = Color(0xFF221E1C),
            surfaceOverlay = Color(0xE60C0A09),
            scrim = Color(0x99000000),
            textPrimary = Color(0xFFF8F5F2),
            textSecondary = Color(0xFFACA39A),
            textTertiary = Color(0xFF908679),
            textOnBrand = Color(0xFFFFFFFF),
            outline = Color(0x14E8DCC8),
            outlineStrong = Color(0x29E8DCC8),
            brand = Color(0xFF006AEB),
            brandPressed = Color(0xFF0057C4),
            brandText = Color(0xFF5CA5FF),
            brandBright = Color(0xFF338FFF),
            brandContainer = Color(0x29006AEB),
            onBrandContainer = Color(0xFF8CC0FF),
            dealGreat = Color(0xFF26BA75),
            dealGreatContainer = Color(0x2626BA75),
            onDealGreat = Color(0xFF51D698),
            dealGood = Color(0xFF3BBA70),
            dealGoodContainer = Color(0x243BBA70),
            onDealGood = Color(0xFF6ECF96),
            dealFair = Color(0xFF8391A5),
            dealFairContainer = Color(0x248391A5),
            onDealFair = Color(0xFFAEBACB),
            dealHigh = Color(0xFFEC516A),
            dealHighContainer = Color(0x26EC516A),
            onDealHigh = Color(0xFFF78296),
            caution = Color(0xFFF6A823),
            cautionContainer = Color(0x26F6A823),
            onCaution = Color(0xFFFABD42),
            success = Color(0xFF33CC73),
            danger = Color(0xFFE02C1F),
            skeletonBase = Color(0xFF161210),
            skeletonHighlight = Color(0xFF221E1C),
        )

        val Light = MmColors(
            isDark = false,
            background = Color(0xFFFAF8F6),
            surface = Color(0xFFFDFDFB),
            surfaceRaised = Color(0xFFFFFFFF),
            surfaceHigh = Color(0xFFF3F3F7),
            surfaceOverlay = Color(0xE6FAF8F6),
            scrim = Color(0x66000000),
            textPrimary = Color(0xFF1B1613),
            textSecondary = Color(0xFF67676F),
            textTertiary = Color(0xFF736A61), // warm label-3: 4.8:1 on every light surface
            textOnBrand = Color(0xFFFFFFFF),
            outline = Color(0x141B1613),
            outlineStrong = Color(0x261B1613),
            brand = Color(0xFF0067E6),
            brandPressed = Color(0xFF0057C4),
            brandText = Color(0xFF0060D6),
            brandBright = Color(0xFF0A7AFF),
            brandContainer = Color(0x1A0067E6),
            onBrandContainer = Color(0xFF0057BF),
            dealGreat = Color(0xFF107546),
            dealGreatContainer = Color(0x1A107546),
            onDealGreat = Color(0xFF0F6C40),
            dealGood = Color(0xFF1D8147),
            dealGoodContainer = Color(0x1A1D8147),
            onDealGood = Color(0xFF1A7440),
            dealFair = Color(0xFF546378),
            dealFairContainer = Color(0x1A546378),
            onDealFair = Color(0xFF44546A),
            dealHigh = Color(0xFFC11F3A),
            dealHighContainer = Color(0x1AC11F3A),
            onDealHigh = Color(0xFFB11B34),
            caution = Color(0xFFF59F0A),
            cautionContainer = Color(0x1FF59F0A),
            onCaution = Color(0xFF914C08),
            success = Color(0xFF059669),
            danger = Color(0xFFCE2D22),
            skeletonBase = Color(0xFFECE7E1),
            skeletonHighlight = Color(0xFFF6F2EC),
        )

        /** Current scheme. Falls back to [Dark] outside [MotormilaTheme]. */
        val current: MmColors
            @Composable @ReadOnlyComposable
            get() = LocalMmColors.current
    }
}

val LocalMmColors = staticCompositionLocalOf { MmColors.Dark }

/** Deal tone used by [lk.motormila.app.ui.components.MmDealBadge]. */
enum class MmDealTone { GREAT, GOOD, FAIR, HIGH, CAUTION, NEUTRAL }

/** Triple of colours for a deal tone: solid, container, text-on-container. */
@Immutable
data class MmDealColors(val solid: Color, val container: Color, val content: Color)

fun MmColors.deal(tone: MmDealTone): MmDealColors = when (tone) {
    MmDealTone.GREAT -> MmDealColors(dealGreat, dealGreatContainer, onDealGreat)
    MmDealTone.GOOD -> MmDealColors(dealGood, dealGoodContainer, onDealGood)
    MmDealTone.FAIR -> MmDealColors(dealFair, dealFairContainer, onDealFair)
    MmDealTone.HIGH -> MmDealColors(dealHigh, dealHighContainer, onDealHigh)
    MmDealTone.CAUTION -> MmDealColors(caution, cautionContainer, onCaution)
    MmDealTone.NEUTRAL -> MmDealColors(textSecondary, surfaceHigh, textSecondary)
}

/**
 * Maps the domain [DealBand] onto a tone. Domain bands follow the one price
 * verdict: GREAT (5 % or more below typical), FAIR, HIGH (8 % or more above),
 * LOCKED (no rating). CAUTION is for verify-first
 * verdicts (see lk.motormila.app.ui.components.MmDealVerdict).
 */
fun DealBand.tone(score: Double? = null): MmDealTone = when (this) {
    // Web: great = 15 % or more below, good = 5 % or more below (domain GREAT band).
    DealBand.GREAT -> if (score != null && score >= 15) MmDealTone.GREAT else MmDealTone.GOOD
    DealBand.FAIR -> MmDealTone.FAIR
    DealBand.HIGH -> MmDealTone.HIGH
    DealBand.LOCKED -> MmDealTone.NEUTRAL
}
