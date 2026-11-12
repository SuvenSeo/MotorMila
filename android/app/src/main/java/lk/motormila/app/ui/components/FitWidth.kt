package lk.motormila.app.ui.components

import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Constraints
import kotlin.math.roundToInt

/**
 * Single-line content (numbers, prices, short labels) that must never clip:
 * measured at its natural width and, when wider than the incoming max width,
 * scaled down uniformly (down to [minScale]) instead of being cut off.
 *
 * Pure layout modifier — no SubcomposeLayout — so it is safe under intrinsic
 * measurement (IntrinsicSize rows, FlowRow) where BoxWithConstraints crashes.
 * Text stays crisp: the scale is applied on the layer, glyphs are vectors.
 */
fun Modifier.fitWidth(minScale: Float = 0.3f): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(constraints.copy(minWidth = 0, maxWidth = Constraints.Infinity))
    val maxW = constraints.maxWidth
    if (!constraints.hasBoundedWidth || placeable.width <= maxW || placeable.width == 0) {
        val w = placeable.width.coerceIn(constraints.minWidth, if (constraints.hasBoundedWidth) maxW else Int.MAX_VALUE)
        layout(w, placeable.height) { placeable.place(0, 0) }
    } else {
        val scale = (maxW.toFloat() / placeable.width).coerceAtLeast(minScale)
        val h = (placeable.height * scale).roundToInt()
        layout((placeable.width * scale).roundToInt().coerceAtMost(maxW), h) {
            placeable.placeWithLayer(0, 0) {
                scaleX = scale
                scaleY = scale
                transformOrigin = TransformOrigin(0f, 0f)
            }
        }
    }
}
