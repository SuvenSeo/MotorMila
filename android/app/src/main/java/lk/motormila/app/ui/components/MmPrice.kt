package lk.motormila.app.ui.components

import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.ui.unit.IntOffset
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.times
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale
import kotlin.math.abs
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmType

/**
 * Price formatting shared with the web (src/lib/price.ts):
 * - compact (cards/lists): MILLIONS ONLY — "Rs 8.5 Mn", "Rs 0.35 Mn",
 *   "Rs 0.085 Mn"; under Rs 10,000 plain grouped rupees.
 * - full (listing detail only): "Rs 7,250,000".
 * - monthly: "Rs 85,400/mo" (never millions).
 */
object MmPriceFormat {
    private const val MILLION = 1_000_000.0
    private const val MN_DISPLAY_MIN = 10_000.0
    private val grouped = DecimalFormat("#,##0", DecimalFormatSymbols(Locale.US))

    private fun trim(s: String): String =
        if (s.contains('.')) s.trimEnd('0').trimEnd('.') else s

    fun mnNumber(absLkr: Double): String {
        val mn = absLkr / MILLION
        return if (mn < 0.095) {
            trim(BigDecimal(mn).round(java.math.MathContext(2)).setScale(3, RoundingMode.HALF_UP).toPlainString())
        } else {
            trim(BigDecimal(mn).setScale(2, RoundingMode.HALF_UP).toPlainString())
        }
    }

    fun compactAmount(value: Double): String {
        val sign = if (value < 0) "-" else ""
        val a = abs(value)
        return if (a < MN_DISPLAY_MIN) sign + grouped.format(a) else "$sign${mnNumber(a)} Mn"
    }

    fun compact(value: Double?, fallback: String = "—"): String =
        if (value == null || value.isNaN() || value <= 0) fallback else "Rs ${compactAmount(value)}"

    fun full(value: Double?, fallback: String = "—"): String =
        if (value == null || value.isNaN() || value <= 0) fallback else "Rs ${grouped.format(value)}"

    fun monthly(value: Double?, fallback: String = "—"): String =
        if (value == null || value.isNaN() || value <= 0) fallback else "Rs ${grouped.format(value)}/mo"

    /** Signed compact delta: "−Rs 0.45 Mn" / "+Rs 1.2 Mn". */
    fun delta(value: Double?): String {
        if (value == null || value == 0.0) return ""
        val sign = if (value > 0) "+" else "−"
        return "${sign}Rs ${compactAmount(abs(value))}"
    }
}

enum class MmPriceMode { Compact, Full, Monthly }

/**
 * Price text with animated digits: when the value changes each changed
 * character rolls vertically (up when the price rises, down when it falls)
 * with a standard tween; unchanged characters stay still. Tabular figures
 * keep widths stable. Reduced motion → plain swap. Screen readers get the
 * whole string once.
 */
@Composable
fun MmPrice(
    value: Double?,
    modifier: Modifier = Modifier,
    mode: MmPriceMode = MmPriceMode.Compact,
    style: TextStyle = MmType.current.priceM,
    color: Color = MmColors.current.textPrimary,
    fallback: String = "—",
    animate: Boolean = true,
) {
    val text = when (mode) {
        MmPriceMode.Compact -> MmPriceFormat.compact(value, fallback)
        MmPriceMode.Full -> MmPriceFormat.full(value, fallback)
        MmPriceMode.Monthly -> MmPriceFormat.monthly(value, fallback)
    }
    MmAnimatedText(
        text = text,
        numericValue = value ?: 0.0,
        modifier = modifier,
        style = style,
        color = color,
        animate = animate,
    )
}

/** Rolling-digit text; [numericValue] decides roll direction. */
@Composable
fun MmAnimatedText(
    text: String,
    numericValue: Double,
    modifier: Modifier = Modifier,
    style: TextStyle = MmType.current.priceM,
    color: Color = MmColors.current.textPrimary,
    animate: Boolean = true,
) {
    val reduced = MmMotion.reduced
    if (!animate || reduced) {
        MmFitText(text = text, style = style, color = color, modifier = modifier)
        return
    }
    // Align from the right so "8.5 Mn" → "12.5 Mn" keeps the unit still.
    BoxWithConstraints(modifier.clearAndSetSemantics { contentDescription = text }) {
    val fitted = rememberFittedTextStyle(text, style, constraints.maxWidth)
    Row(
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val chars = text.toCharArray()
        chars.forEachIndexed { index, ch ->
            val keyFromEnd = chars.size - index
            androidx.compose.runtime.key(keyFromEnd) {
            AnimatedContent(
                targetState = PriceChar(ch, numericValue),
                contentKey = { it.char },
                transitionSpec = {
                    val up = targetState.value >= initialState.value
                    val dir = if (up) 1 else -1
                    (
                        slideInVertically(MmMotion.snappy(IntOffset.VisibilityThreshold)) { h -> dir * h } +
                            fadeIn(tween(MmMotion.Fast))
                        ) togetherWith (
                        slideOutVertically(MmMotion.snappy(IntOffset.VisibilityThreshold)) { h -> -dir * h } +
                            fadeOut(tween(MmMotion.Fast))
                        )
                },
                label = "price-char-$keyFromEnd",
            ) { pc ->
                Text(pc.char.toString(), style = fitted, color = color, maxLines = 1, softWrap = false)
            }
            }
        }
    }
    }
}

/**
 * Single-line text that shrinks its font (down to [minScale] of the style's size) instead of
 * wrapping or clipping when it does not fit the available width — the iOS
 * `adjustsFontSizeToFitWidth` behaviour. Used for prices so "Rs 1.2 Mn" never loses its unit
 * at large font scales (audit: 200 % font-scale clipping of card + detail prices).
 */
@Composable
fun MmFitText(
    text: String,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
    minScale: Float = 0.55f,
) {
    BoxWithConstraints(modifier) {
        val fitted = rememberFittedTextStyle(text, style, constraints.maxWidth, minScale)
        Text(
            text,
            style = fitted,
            color = color,
            maxLines = 1,
            softWrap = false,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun rememberFittedTextStyle(
    text: String,
    style: TextStyle,
    maxWidthPx: Int,
    minScale: Float = 0.55f,
): TextStyle {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    return remember(text, style, maxWidthPx, density, minScale) {
        if (maxWidthPx == Constraints.Infinity || maxWidthPx <= 0 || !style.fontSize.isSp) {
            return@remember style
        }
        val width = measurer.measure(
            text = text,
            style = style,
            softWrap = false,
            maxLines = 1,
        ).size.width
        if (width <= maxWidthPx) {
            style
        } else {
            val scale = (maxWidthPx.toFloat() / width * 0.98f).coerceIn(minScale, 1f)
            style.copy(
                fontSize = scale * style.fontSize,
                letterSpacing = if (style.letterSpacing.isSp) scale * style.letterSpacing else style.letterSpacing,
            )
        }
    }
}

private data class PriceChar(val char: Char, val value: Double) {
    override fun equals(other: Any?): Boolean = other is PriceChar && other.char == char
    override fun hashCode(): Int = char.hashCode()
}
