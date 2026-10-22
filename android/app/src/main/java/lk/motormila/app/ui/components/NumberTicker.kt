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
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        text.forEach { ch ->
            if (ch.isDigit()) {
                RollingDigit(
                    digit = ch.digitToInt(),
                    style = style,
                    color = color,
                    reducedMotion = reduced,
                )
            } else {
                Text(text = ch.toString(), style = style, color = color)
            }
        }
    }
}

@Composable
private fun RollingDigit(
    digit: Int,
    style: TextStyle,
    color: Color,
    reducedMotion: Boolean,
) {
    val density = LocalDensity.current
    // Fixed digit cell height keeps the strip aligned while it rolls.
    val digitHeightDp: Dp = remember(style) {
        val lineHeight = if (style.lineHeight != TextUnit.Unspecified) {
            style.lineHeight
        } else {
            style.fontSize * 1.2f
        }
        with(density) { lineHeight.toPx().toDp() }
    }
    val digitHeightPx: Float = remember(style) {
        val lineHeight = if (style.lineHeight != TextUnit.Unspecified) {
            style.lineHeight
        } else {
            style.fontSize * 1.2f
        }
        with(density) { lineHeight.toPx() }
    }
    val animatedOffset by animateFloatAsState(
        targetValue = -digit * digitHeightPx,
        // Spring roll (slight settle, no bounce past the digit).
        animationSpec = if (reducedMotion) snap() else spring(dampingRatio = 0.86f, stiffness = Spring.StiffnessMediumLow),
        label = "rolling-digit",
    )
    Box(
        modifier = Modifier
            .height(digitHeightDp)
            .clipToBounds(),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            modifier = Modifier.offset { IntOffset(0, animatedOffset.roundToInt()) },
        ) {
            repeat(10) { d ->
                Text(
                    text = d.toString(),
                    style = style,
                    color = color,
                    maxLines = 1,
                    modifier = Modifier.height(digitHeightDp),
                )
            }
        }
    }
}
