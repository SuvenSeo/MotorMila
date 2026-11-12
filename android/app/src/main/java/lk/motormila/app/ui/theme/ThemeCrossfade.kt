package lk.motormila.app.ui.theme

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.ContentScale
import kotlinx.coroutines.CancellationException

/**
 * Smooth Light/Dark switch (Settings → Appearance). When [dark] flips, the
 * last frame is snapshotted, the theme swaps underneath, and the snapshot
 * fades out on a critically damped spring — every surface (including legacy
 * palette constants) crossfades at once with no per-colour animation.
 * Reduced motion ("Remove animations") swaps instantly, and so does the
 * first value once [settled] (the persisted preference loading at launch).
 */
@Composable
fun ThemeCrossfadeHost(
    dark: Boolean,
    settled: Boolean = true,
    content: @Composable (dark: Boolean) -> Unit,
) {
    val layer = rememberGraphicsLayer()
    val reduced = rememberSystemReducedMotion()
    var shown by remember { mutableStateOf(dark) }
    var snapshot by remember { mutableStateOf<ImageBitmap?>(null) }
    val alpha = remember { Animatable(0f) }
    var armed by remember { mutableStateOf(false) }

    LaunchedEffect(dark, settled) {
        if (!armed) {
            // Initial value (persisted preference arriving): no animation.
            shown = dark
            armed = settled
            return@LaunchedEffect
        }
        if (dark == shown) return@LaunchedEffect
        if (!reduced) {
            snapshot = try {
                layer.toImageBitmap()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                null
            }
            alpha.snapTo(1f)
        }
        shown = dark
        if (snapshot != null) {
            alpha.animateTo(0f, spring(dampingRatio = 1f, stiffness = Spring.StiffnessMediumLow))
            snapshot = null
        }
    }

    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .drawWithContent {
                    layer.record { this@drawWithContent.drawContent() }
                    drawLayer(layer)
                },
        ) {
            content(shown)
        }
        snapshot?.let { bmp ->
            Image(
                bitmap = bmp,
                contentDescription = null,
                contentScale = ContentScale.FillBounds,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer { this.alpha = alpha.value },
            )
        }
    }
}
