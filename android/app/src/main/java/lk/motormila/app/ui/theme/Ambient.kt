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

/**
 * Quiet atmospheric field behind screens (dark only): a single, very faint
 * blue bloom at the top so the Ink ground has depth without competing with
 * content. Static; one gradient; no blur.
 */
@Composable
fun MotormilaAmbient(modifier: Modifier = Modifier) {
    val colors = MmColors.current
    if (!colors.isDark) return
    Canvas(modifier = modifier.fillMaxSize()) {
        val w = size.width
        drawRect(colors.background)
        drawRect(
            brush = Brush.radialGradient(
                colors = listOf(Color(0x1F0A7AFF), Color(0x0A0A7AFF), Color.Transparent),
                center = Offset(w * 0.5f, -w * 0.35f),
                radius = w * 1.1f,
            ),
        )
    }
}

/** Full-bleed page canvas: ground + ambient field + content. */
@Composable
fun MotormilaCanvas(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MmColors.current.background),
    ) {
        MotormilaAmbient()
        content()
    }
}
