package lk.motormila.app.ui.theme

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import lk.motormila.app.ui.theme.MotormilaPrimaryGlow

/**
 * Quiet atmospheric field used behind every screen. Two soft electric-blue
 * blooms + a faint vertical falloff so chrome can recede and data can sit
 * on a photographic-dark canvas. Cheap: a single gradient canvas, no blur.
 */
@Composable
fun MotormilaAmbient(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        drawRect(MotormilaBg)
        drawRect(
            brush = Brush.radialGradient(
                colors = listOf(MotormilaPrimaryGlow, Color(0x140A7AFF), Color.Transparent),
                center = Offset(w * 0.86f, h * -0.02f),
                radius = w * 0.92f,
            ),
        )
        drawRect(
            brush = Brush.radialGradient(
                colors = listOf(Color(0x1A38BDF8), Color.Transparent),
                center = Offset(w * -0.05f, h * 0.78f),
                radius = w * 0.85f,
            ),
        )
        drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(Color.Transparent, Color(0x6609090B)),
                startY = h * 0.55f,
                endY = h,
            ),
        )
    }
}

/** Full-bleed page canvas: ambient field + content. */
@Composable
fun MotormilaCanvas(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MotormilaBg),
    ) {
        MotormilaAmbient()
        content()
    }
}
