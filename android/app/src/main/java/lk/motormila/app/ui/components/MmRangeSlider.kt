package lk.motormila.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.horizontalDrag
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlin.math.roundToInt
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion

/**
 * MotorMila range slider (replaces M3 Slider in Filters, whose 1.3 "gap"
 * thumb rendered as a detached bar past the track end at the max value).
 *
 * Two white knobs (or one when [single]) on a 6 dp capsule track; the active
 * span is brand blue. Knob centres stay inside the track (inset by the knob
 * radius) so a knob at either end sits flush with the track, never off it.
 * Values are positions in [valueRange] snapped to whole [step]s; each new
 * snapped position gives a light haptic tick; the grabbed knob springs up
 * slightly. RTL mirrors. Each knob is its own accessibility node with a
 * range and setProgress.
 */
@Composable
fun MmRangeSlider(
    start: Float,
    end: Float,
    onChange: (start: Float, end: Float) -> Unit,
    valueRange: ClosedFloatingPointRange<Float>,
    modifier: Modifier = Modifier,
    step: Float = 1f,
    single: Boolean = false,
    startLabel: String = "",
    endLabel: String = "",
    startValueText: String = "",
    endValueText: String = "",
    enabled: Boolean = true,
) {
    val c = MmColors.current
    val haptics = MmHaptics.current
    val density = LocalDensity.current
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val knob = 28.dp
    val knobPx = with(density) { knob.toPx() }
    val min = valueRange.start
    val max = valueRange.endInclusive
    val span = (max - min).takeIf { it > 0f } ?: 1f
    fun snap(v: Float): Float = (min + (((v - min) / step).roundToInt() * step)).coerceIn(min, max)
    val curStart by rememberUpdatedState(if (single) min else start.coerceIn(min, max))
    val curEnd by rememberUpdatedState(end.coerceIn(min, max))
    val change by rememberUpdatedState(onChange)
    var active by remember { mutableIntStateOf(-1) } // 0 = start knob, 1 = end knob
    var lastTick by remember { mutableStateOf(Float.NaN) }
    val activeTrack = if (enabled) c.brand else c.outlineStrong
    val knobFill = Color.White

    BoxWithConstraints(
        modifier
            .fillMaxWidth()
            .height(48.dp)
            .pointerInput(enabled, single, min, max, step) {
                if (!enabled) return@pointerInput
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    val usable = (size.width - knobPx).coerceAtLeast(1f)
                    fun valueAt(x: Float): Float {
                        val raw = ((x - knobPx / 2f) / usable).coerceIn(0f, 1f)
                        val f = if (rtl) 1f - raw else raw
                        return min + f * span
                    }
                    val v0 = valueAt(down.position.x)
                    active = when {
                        single -> 1
                        abs(v0 - curStart) < abs(v0 - curEnd) -> 0
                        abs(v0 - curStart) > abs(v0 - curEnd) -> 1
                        v0 < curStart -> 0
                        else -> 1
                    }
                    fun apply(v: Float) {
                        val s = snap(v)
                        if (s != lastTick) {
                            if (!lastTick.isNaN()) haptics.unsave()
                            lastTick = s
                        }
                        if (active == 0) change(s.coerceAtMost(curEnd), curEnd)
                        else change(curStart, s.coerceAtLeast(curStart))
                    }
                    lastTick = Float.NaN
                    apply(v0)
                    down.consume()
                    horizontalDrag(down.id) { ch ->
                        apply(valueAt(ch.position.x))
                        ch.consume()
                    }
                    active = -1
                }
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        val widthPx = constraints.maxWidth.toFloat()
        val usable = (widthPx - knobPx).coerceAtLeast(1f)
        fun xOf(v: Float): Float {
            val f = ((v - min) / span).coerceIn(0f, 1f)
            return knobPx / 2f + (if (rtl) 1f - f else f) * usable
        }
        // Track + active span (drawn, no layout per frame).
        Box(
            Modifier
                .fillMaxWidth()
                .height(6.dp)
                .drawBehind {
                    val h = size.height
                    val r = CornerRadius(h / 2f, h / 2f)
                    drawRoundRect(c.surfaceHigh, cornerRadius = r)
                    val a = xOf(curStart)
                    val b = xOf(curEnd)
                    val left = minOf(a, b)
                    val right = maxOf(a, b)
                    drawRoundRect(
                        activeTrack,
                        topLeft = Offset(if (single) (if (rtl) right else 0f) else left, 0f),
                        size = Size(if (single) (if (rtl) size.width - right else right) else right - left, h),
                        cornerRadius = r,
                    )
                },
        )
        if (!single) {
            Knob(
                xPx = { xOf(curStart) - knobPx / 2f },
                pressed = active == 0,
                fill = knobFill,
                outline = if (c.isDark) c.outline else c.outlineStrong,
                size = knob,
                label = startLabel,
                valueText = startValueText,
                value = curStart,
                range = valueRange,
                onSet = { v -> change(snap(v).coerceAtMost(curEnd), curEnd) },
            )
        }
        Knob(
            xPx = { xOf(curEnd) - knobPx / 2f },
            pressed = active == 1,
            fill = knobFill,
            outline = if (c.isDark) c.outline else c.outlineStrong,
            size = knob,
            label = endLabel,
            valueText = endValueText,
            value = curEnd,
            range = valueRange,
            onSet = { v -> change(curStart, snap(v).coerceAtLeast(curStart)) },
        )
    }
}

@Composable
private fun Knob(
    xPx: () -> Float,
    pressed: Boolean,
    fill: Color,
    outline: Color,
    size: androidx.compose.ui.unit.Dp,
    label: String,
    valueText: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    onSet: (Float) -> Unit,
) {
    val scale by animateFloatAsState(
        if (pressed && !MmMotion.reduced) 1.14f else 1f,
        MmMotion.snappy(),
        label = "knob-scale",
    )
    Box(
        Modifier
            .offset { IntOffset(xPx().roundToInt(), 0) }
            .size(size)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .shadow(4.dp, CircleShape, clip = false, ambientColor = Color.Black.copy(alpha = 0.10f), spotColor = Color.Black.copy(alpha = 0.22f))
            .background(fill, CircleShape)
            .border(0.5.dp, outline, CircleShape)
            .semantics {
                contentDescription = label
                stateDescription = valueText
                progressBarRangeInfo = ProgressBarRangeInfo(value, range)
                setProgress { v ->
                    onSet(v)
                    true
                }
            },
    )
}
