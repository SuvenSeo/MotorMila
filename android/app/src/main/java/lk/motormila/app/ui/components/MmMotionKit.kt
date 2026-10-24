package lk.motormila.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import lk.motormila.app.ui.theme.MmMotion
import kotlin.math.cos
import kotlin.math.sin

/**
 * Signature **save** motion: the bookmark fills with an elastic pop
 * (0.55 → 1.25 → 1) while a ring shock-wave expands and eight sparks burst
 * outward and fade (two alternating colours). Un-saving gives a soft
 * shrink-settle only. Burst is drawn in the draw phase from one Animatable,
 * so a whole grid of cards costs nothing until one is tapped. Skipped on
 * first composition (no burst for already-saved cards) and under reduced
 * motion (icon simply swaps).
 */
@Composable
fun MmSaveBurstIcon(
    saved: Boolean,
    modifier: Modifier = Modifier,
    iconSize: Dp = 18.dp,
    tint: Color = Color.White,
    savedTint: Color = Color.White,
    burstColor: Color = Color(0xFF3B82F6),
    burstAlt: Color = Color(0xFFFFC53D),
    savedIcon: androidx.compose.ui.graphics.vector.ImageVector = Icons.Filled.Bookmark,
    unsavedIcon: androidx.compose.ui.graphics.vector.ImageVector = Icons.Outlined.BookmarkBorder,
) {
    val reduced = MmMotion.reduced
    val scale = remember { Animatable(1f) }
    val burst = remember { Animatable(1f) } // 1 = idle (finished)
    var first by remember { mutableStateOf(true) }
    LaunchedEffect(saved) {
        if (first) {
            first = false
            return@LaunchedEffect
        }
        if (reduced) return@LaunchedEffect
        if (saved) {
            launch {
                scale.snapTo(0.55f)
                scale.animateTo(1f, spring(dampingRatio = 0.38f, stiffness = 520f))
            }
            launch {
                burst.snapTo(0f)
                burst.animateTo(1f, tween(560, easing = FastOutSlowInEasing))
            }
        } else {
            scale.snapTo(0.85f)
            scale.animateTo(1f, spring(dampingRatio = 0.7f, stiffness = 600f))
        }
    }
    Box(
        modifier
            .size(iconSize * 2)
            .drawBehind {
                val p = burst.value
                if (p >= 1f) return@drawBehind
                val c = center
                val base = iconSize.toPx() * 0.55f
                // Shock-wave ring
                val ringR = base + (size.minDimension * 0.62f - base) * p
                drawCircle(
                    burstColor.copy(alpha = (1f - p) * 0.55f),
                    radius = ringR,
                    center = c,
                    style = Stroke(width = (1f - p) * 3.dp.toPx() + 0.5f),
                )
                // Sparks
                for (k in 0 until 8) {
                    val a = Math.toRadians((k * 45 + 22.5).toDouble())
                    val dist = base + size.minDimension * 0.55f * p
                    val pos = Offset(c.x + (cos(a) * dist).toFloat(), c.y + (sin(a) * dist).toFloat())
                    val r = (1f - p) * 2.4.dp.toPx()
                    drawCircle(
                        (if (k % 2 == 0) burstColor else burstAlt).copy(alpha = (1f - p).coerceIn(0f, 1f)),
                        radius = r,
                        center = pos,
                    )
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (saved) savedIcon else unsavedIcon,
            contentDescription = null,
            tint = if (saved) savedTint else tint,
            modifier = Modifier
                .size(iconSize)
                .graphicsLayer {
                    scaleX = scale.value
                    scaleY = scale.value
                },
        )
    }
}

/**
 * Signature **wobble-settle** for chips/toggles: on selection the element
 * squashes (0.92), springs up past 1 and wobbles ±3° before settling —
 * under-damped spring on scale + rotation (graphics layer only).
 */
fun Modifier.mmWobbleOnSelect(selected: Boolean): Modifier = composed {
    val reduced = MmMotion.reduced
    val scale = remember { Animatable(1f) }
    val rot = remember { Animatable(0f) }
    var first by remember { mutableStateOf(true) }
    LaunchedEffect(selected) {
        if (first) {
            first = false
            return@LaunchedEffect
        }
        if (reduced || !selected) return@LaunchedEffect
        launch {
            scale.snapTo(0.92f)
            scale.animateTo(1f, spring(dampingRatio = 0.4f, stiffness = 700f))
        }
        launch {
            rot.snapTo(-3f)
            rot.animateTo(0f, spring(dampingRatio = 0.3f, stiffness = 500f))
        }
    }
    this.graphicsLayer {
        scaleX = scale.value
        scaleY = scale.value
        rotationZ = rot.value
    }
}
