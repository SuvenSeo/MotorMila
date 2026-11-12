package lk.motormila.app.ui.theme

import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource

/**
 * Liquid-glass material system (iOS 26 "Liquid Glass" feel).
 *
 * A glass surface = real backdrop blur of whatever scrolls behind it (Haze →
 * RenderEffect on API 32+) + an adaptive tint (paper white in light, graphite
 * in dark) + a top specular sheen + a light-catching inner stroke + a soft
 * drop shadow. Three weights:
 *
 *  - [GlassWeight.Thin]    chips/pills over photos, small floating buttons
 *  - [GlassWeight.Regular] tab bar, top bars, search field, trays
 *  - [GlassWeight.Thick]   sheets, dialogs, menus, snackbars (text-heavy)
 *
 * Fallbacks (decided once per composition in [GlassEnv]):
 *  - API < 32, or blur unavailable (Paparazzi/preview): Haze draws a denser
 *    translucent tint scrim ([GlassWeight.fallbackAlpha]) — still readable.
 *  - "Reduce transparency" (in-app Settings → Appearance, or the system
 *    High-contrast text accessibility switch): fully opaque surface, no blur.
 *
 * Contrast: tint alphas are chosen so primary text (#111 / #F5F5F7) stays
 * ≥ 4.5:1 even over a pure-white or pure-black photo after blur.
 */
enum class GlassWeight(
    val blur: Dp,
    val lightAlpha: Float,
    val darkAlpha: Float,
    val fallbackAlpha: Float,
) {
    Thin(blur = 14.dp, lightAlpha = 0.58f, darkAlpha = 0.52f, fallbackAlpha = 0.86f),
    Regular(blur = 26.dp, lightAlpha = 0.68f, darkAlpha = 0.62f, fallbackAlpha = 0.92f),
    Thick(blur = 36.dp, lightAlpha = 0.80f, darkAlpha = 0.74f, fallbackAlpha = 0.96f),
}

/** Where glass reads its backdrop from, and whether blur/translucency are allowed. */
@Immutable
data class GlassEnv(
    /** Backdrop captured by [Modifier.glassBackdrop] (the app content under chrome). */
    val backdrop: HazeState? = null,
    /** RenderEffect blur may run (API 32+, not in preview, not reduced transparency). */
    val blurAllowed: Boolean = false,
    /** Reduce transparency: draw opaque surfaces only. */
    val solid: Boolean = false,
)

val LocalGlassEnv = staticCompositionLocalOf { GlassEnv() }

/** True when the user asked for opaque chrome (in-app switch or system high-contrast text). */
val LocalReduceTransparency = staticCompositionLocalOf { false }

/** System "High contrast text" (Settings.Secure, hidden key) → treat as reduce transparency. */
@Composable
fun rememberSystemHighContrastText(): Boolean {
    if (LocalInspectionMode.current) return false
    val context = LocalContext.current
    return remember(context) {
        runCatching {
            Settings.Secure.getInt(context.contentResolver, "high_text_contrast_enabled", 0) == 1
        }.getOrDefault(false)
    }
}

/** Builds the [GlassEnv] for a backdrop [state]. */
@Composable
fun rememberGlassEnv(state: HazeState?): GlassEnv {
    val inspection = LocalInspectionMode.current
    val solid = LocalReduceTransparency.current
    return remember(state, inspection, solid) {
        GlassEnv(
            backdrop = state,
            // Haze itself only trusts RenderEffect from API 32 (31 has
            // RenderNode invalidation bugs); match that.
            blurAllowed = !inspection && !solid && Build.VERSION.SDK_INT >= 32,
            solid = solid,
        )
    }
}

object LiquidGlass {
    /** Adaptive tint colour for a weight, light/dark aware. */
    fun tint(c: MmColors, weight: GlassWeight): Color =
        if (c.isDark) Color(0xFF1C1C20).copy(alpha = weight.darkAlpha)
        else Color(0xFFFDFDFE).copy(alpha = weight.lightAlpha)

    /** Tint used where blur cannot run (API < 32): denser so text stays AA. */
    fun fallback(c: MmColors, weight: GlassWeight): Color =
        if (c.isDark) Color(0xFF1C1C20).copy(alpha = weight.fallbackAlpha)
        else Color(0xFFFDFDFE).copy(alpha = weight.fallbackAlpha)

    /** Opaque surface for reduce-transparency. */
    fun solid(c: MmColors): Color = if (c.isDark) Color(0xFF1C1C20) else Color(0xFFFFFFFF)

    /** Soft shadow colour: diffuse in light, deeper in dark. */
    fun shadow(c: MmColors): Color = if (c.isDark) Color.Black.copy(alpha = 0.55f) else Color(0xFF0B1730).copy(alpha = 0.22f)

    /** Top sheen strength. */
    fun sheen(c: MmColors): Color = if (c.isDark) Color.White.copy(alpha = 0.10f) else Color.White.copy(alpha = 0.55f)

    /** Inner stroke gradient (bright top edge → faint bottom edge). */
    fun strokeBrush(c: MmColors, height: Float): Brush =
        if (c.isDark) {
            Brush.verticalGradient(
                0f to Color.White.copy(alpha = 0.26f),
                0.5f to Color.White.copy(alpha = 0.06f),
                1f to Color.White.copy(alpha = 0.12f),
                startY = 0f,
                endY = height,
            )
        } else {
            Brush.verticalGradient(
                0f to Color.White.copy(alpha = 0.95f),
                0.55f to Color.White.copy(alpha = 0.25f),
                1f to Color.Black.copy(alpha = 0.06f),
                startY = 0f,
                endY = height,
            )
        }

    /** Outer hairline that keeps light glass from dissolving into white content. */
    fun hairline(c: MmColors): Color = if (c.isDark) Color.Black.copy(alpha = 0.35f) else Color.Black.copy(alpha = 0.07f)

    fun style(c: MmColors, weight: GlassWeight): HazeStyle = HazeStyle(
        backgroundColor = c.background,
        tints = listOf(HazeTint(tint(c, weight))),
        blurRadius = weight.blur,
        noiseFactor = 0.035f,
        fallbackTint = HazeTint(fallback(c, weight)),
    )
}

/** Marks [this] as the backdrop that glass chrome above it blurs. */
fun Modifier.glassBackdrop(state: HazeState?): Modifier =
    if (state == null) this else this.hazeSource(state)

/**
 * Paints a liquid-glass surface in [shape]. Put content after this modifier.
 *
 * @param elevation soft drop shadow (0 = none). Keep ≤ 24.dp.
 * @param backdrop override the env backdrop (e.g. a screen-local HazeState).
 * @param sheen top specular highlight + inner stroke (skip on tiny chips).
 */
@Composable
fun Modifier.liquidGlass(
    shape: Shape,
    weight: GlassWeight = GlassWeight.Regular,
    elevation: Dp = 0.dp,
    backdrop: HazeState? = LocalGlassEnv.current.backdrop,
    sheen: Boolean = true,
): Modifier {
    val c = MmColors.current
    val env = LocalGlassEnv.current
    val shadowed = if (elevation > 0.dp) {
        val sc = LiquidGlass.shadow(c)
        this.shadow(elevation, shape, clip = false, ambientColor = sc, spotColor = sc)
    } else {
        this
    }
    val filled = when {
        env.solid -> shadowed.clip(shape).background(LiquidGlass.solid(c), shape)
        backdrop != null -> shadowed.clip(shape).hazeEffect(backdrop, LiquidGlass.style(c, weight)) {
            blurEnabled = env.blurAllowed
        }
        else -> shadowed.clip(shape).background(LiquidGlass.fallback(c, weight), shape)
    }
    return filled.glassEdges(shape, c, sheen && !env.solid)
}

/** Sheen + inner stroke + outer hairline, drawn over the glass fill. */
fun Modifier.glassEdges(shape: Shape, c: MmColors, sheen: Boolean = true): Modifier = drawWithCache {
    val outline = shape.createOutline(size, layoutDirection, this)
    val stroke = 1.dp.toPx()
    val sheenBrush = Brush.verticalGradient(
        0f to LiquidGlass.sheen(c),
        0.42f to Color.Transparent,
        startY = 0f,
        endY = size.height,
    )
    val strokeBrush = LiquidGlass.strokeBrush(c, size.height)
    val hair = LiquidGlass.hairline(c)
    onDrawWithContent {
        if (sheen) drawOutline(outline, sheenBrush)
        drawContent()
        drawOutline(outline, hair, style = Stroke(width = stroke * 0.6f))
        if (sheen) drawOutline(outline, strokeBrush, style = Stroke(width = stroke))
    }
}

/** Tint colour for small glass pills drawn over photos (always dark glass so white text is AA). */
val PhotoGlassTint: Color = Color(0xFF0E0E12).copy(alpha = 0.46f)

/** Reads whether glass is in solid mode (for callers that pick colours). */
val glassIsSolid: Boolean
    @Composable @ReadOnlyComposable
    get() = LocalGlassEnv.current.solid
