package lk.motormila.app.ui.components

import androidx.compose.animation.core.snap
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.layout.requiredHeight
import androidx.compose.runtime.key
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.roundToInt
import lk.motormila.app.ui.theme.AppleEasing

private val groupedFormat: NumberFormat =
    NumberFormat.getNumberInstance(Locale("en", "LK")).apply { maximumFractionDigits = 0 }

/**
 * Per-digit rolling number ticker — web `SlidingNumber` / `NumberTicker` parity.
 *
 * Each digit rides its own odometer strip and rolls vertically when the value
 * changes; separators and prefixes render statically. Animation uses the shared
 * [AppleEasing] and honours reduced motion (snaps instantly). Callers must pass
 * a [style] with an explicit lineHeight (or fontSize, from which it derives).
 */
@Composable
fun NumberTicker(
    value: Long,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
) {
    RollingDigits(
        text = groupedFormat.format(value),
        modifier = modifier,
        style = style,
        color = color,
    )
}

/**
 * Sliding-number variant for money totals — same per-digit roll with an
 * optional prefix (e.g. "Rs. ").
 */
@Composable
fun SlidingNumber(
    value: Long,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    prefix: String = "",
) {
    RollingDigits(
        text = prefix + groupedFormat.format(value),
        modifier = modifier,
        style = style,
        color = color,
    )
}

/**
 * Rolling LKR price using the app formatter ([lk.motormila.app.core.format.LkrFormat]):
 * compact millions ("Rs 8.5 Mn") by default, full rupees ("Rs 7,250,000")
 * only where [full] is set (listing detail).
 */
@Composable
fun SlidingLkr(
    valueLkr: Double,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    full: Boolean = false,
) {
    RollingDigits(
        text = if (full) lk.motormila.app.core.format.LkrFormat.full(valueLkr)
        else lk.motormila.app.core.format.LkrFormat.compact(valueLkr),
        modifier = modifier,
        style = style,
        color = color,
    )
}

@Composable
private fun RollingDigits(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle,
    color: Color,
) {
    val reduced = rememberReducedMotion()
    val density = LocalDensity.current
    // One fixed cell height for every glyph (digits AND separators) so the
    // baselines line up and the strip can be clipped to exactly one digit.
    // Keyed on density too: fontScale lives there, not in the sp style.
    val cellLineHeight: TextUnit = remember(style) { rollingLineHeight(style) }
    val cellStyle = remember(style) {
        style.copy(
            // Tabular figures: every digit cell is the widest digit, so without
            // tnum a "1" floats in a wide cell ("1 ,284").
            fontFeatureSettings = style.fontFeatureSettings ?: "tnum",
            lineHeight = cellLineHeight,
            lineHeightStyle = LineHeightStyle(
                alignment = LineHeightStyle.Alignment.Center,
                trim = LineHeightStyle.Trim.None,
            ),
        )
    }
    val cellHeight: Dp = remember(cellLineHeight, density) { with(density) { cellLineHeight.toDp() } }
    Row(
        // Screen readers get the settled value once, not ten digits per strip.
        modifier = modifier
            .clearAndSetSemantics { contentDescription = text }
            // Last line of defence: scale the whole row down rather than clip.
            .fitWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val chars = text.toCharArray()
        chars.forEachIndexed { index, ch ->
            // Keyed from the END so "1,125,000" -> "950,000" keeps the units
            // column on the same strip (and a length change never re-pairs a
            // separator slot with a digit slot mid-roll).
            key(chars.size - index, ch.isDigit()) {
                if (ch.isDigit()) {
                    RollingDigit(
                        digit = ch.digitToInt(),
                        style = cellStyle,
                        cellHeight = cellHeight,
                        color = color,
                        reducedMotion = reduced,
                    )
                } else {
                    Text(
                        text = ch.toString(),
                        style = cellStyle,
                        color = color,
                        maxLines = 1,
                        softWrap = false,
                        modifier = Modifier.height(cellHeight),
                    )
                }
            }
        }
    }
}

@Composable
private fun RollingDigit(
    digit: Int,
    style: TextStyle,
    cellHeight: Dp,
    color: Color,
    reducedMotion: Boolean,
) {
    val density = LocalDensity.current
    val cellHeightPx = with(density) { cellHeight.toPx() }
    // Animate the digit INDEX (not pixels) so a density/font-scale change can
    // never leave the strip parked between two rows.
    val animatedIndex by animateFloatAsState(
        targetValue = digit.toFloat(),
        // Spring roll (slight settle, no bounce past the digit).
        animationSpec = if (reducedMotion) snap() else spring(
            dampingRatio = 0.86f,
            stiffness = Spring.StiffnessMediumLow,
            visibilityThreshold = 0.001f,
        ),
        label = "rolling-digit",
    )
    Box(
        modifier = Modifier
            .height(cellHeight)
            .clipToBounds(),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            modifier = Modifier
                // BUG FIX (1.7.0 "Rs     0,000"): the strip is 10 cells tall but
                // the Box hands it maxHeight = ONE cell. Column then gave the "0"
                // row the whole cell and every other row 0px, so any digit but 0
                // rendered blank. Measure the strip unbounded; the Box clips it.
                .wrapContentHeight(align = Alignment.Top, unbounded = true)
                .offset { IntOffset(0, (-animatedIndex * cellHeightPx).roundToInt()) },
        ) {
            repeat(10) { d ->
                Text(
                    text = d.toString(),
                    style = style,
                    color = color,
                    maxLines = 1,
                    softWrap = false,
                    modifier = Modifier.requiredHeight(cellHeight),
                )
            }
        }
    }
}

/** Line height the rolling cells use: the style's own, else 1.2 x font size. */
internal fun rollingLineHeight(style: TextStyle): TextUnit =
    if (style.lineHeight != TextUnit.Unspecified && style.lineHeight.isSp) {
        style.lineHeight
    } else if (style.fontSize.isSp) {
        (style.fontSize.value * 1.2f).sp
    } else {
        24.sp
    }

/**
 * Width in px [text] takes when drawn one glyph per cell (as [RollingDigits] and
 * [MmAnimatedText] do): each cell is ceil'd separately and kerning is lost, so
 * this is wider than measuring the whole string. Digits use the widest digit
 * because a rolling strip is as wide as its widest row.
 */
internal fun perGlyphWidthPx(
    measurer: TextMeasurer,
    text: String,
    style: TextStyle,
    digitsAsStrip: Boolean,
): Int {
    fun w(s: String) = measurer.measure(s, style, maxLines = 1, softWrap = false).size.width
    val digitW = if (digitsAsStrip) (0..9).maxOf { w(it.toString()) } else 0
    return text.sumOf { ch -> if (digitsAsStrip && ch.isDigit()) digitW else w(ch.toString()) }
}

/**
 * Shrinks [style] (never below [minScale] of its size) until [text], drawn one
 * glyph per cell, fits [maxWidthPx]. Re-measures after each step (glyph widths
 * do not scale exactly linearly), at most 4 passes.
 */
internal fun fitPerGlyphStyle(
    measurer: TextMeasurer,
    text: String,
    style: TextStyle,
    maxWidthPx: Int,
    digitsAsStrip: Boolean,
    minScale: Float = 0.5f,
): TextStyle {
    if (maxWidthPx == Constraints.Infinity || maxWidthPx <= 0 || !style.fontSize.isSp || text.isEmpty()) return style
    var scale = 1f
    var current = style
    repeat(4) {
        val width = perGlyphWidthPx(measurer, text, current, digitsAsStrip)
        if (width <= maxWidthPx) return current
        if (scale <= minScale) return current
        scale = (scale * maxWidthPx.toFloat() / width * 0.98f).coerceIn(minScale, 1f)
        current = style.scaled(scale)
    }
    return current
}

internal fun TextStyle.scaled(scale: Float): TextStyle = copy(
    fontSize = fontSize * scale,
    lineHeight = if (lineHeight.isSp) lineHeight * scale else lineHeight,
    letterSpacing = if (letterSpacing.isSp) letterSpacing * scale else letterSpacing,
)

/**
 * [style] shrunk so the rolling LKR price [valueLkr] (full or compact) fits
 * [maxWidthPx] — use with [SlidingLkr] wherever the width is known.
 */
@Composable
fun rememberSlidingLkrFitStyle(
    valueLkr: Double,
    style: TextStyle,
    maxWidthPx: Int,
    full: Boolean = false,
    minScale: Float = 0.5f,
): TextStyle {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val text = if (full) lk.motormila.app.core.format.LkrFormat.full(valueLkr)
    else lk.motormila.app.core.format.LkrFormat.compact(valueLkr)
    return remember(text, style, maxWidthPx, density, minScale) {
        val cell = style.copy(lineHeight = rollingLineHeight(style))
        fitPerGlyphStyle(measurer, text, cell, maxWidthPx, digitsAsStrip = true, minScale = minScale)
    }
}
