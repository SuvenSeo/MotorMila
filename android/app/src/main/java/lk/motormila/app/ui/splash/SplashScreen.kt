package lk.motormila.app.ui.splash

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import lk.motormila.app.R
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion

/**
 * Signature splash: the "M" mark pops in on its own (elastic spring, 0.6 →
 * 1.12 → 1), then the wordmark *unfolds* out of it — a clip reveal from the
 * mark rightward while the lockup glides from mark-centred to centred.
 * ~850ms, never a wall; reduced motion shows it static for 150ms. Session
 * restore runs in parallel (SplashGate), so this is rarely the critical path.
 */
@Composable
fun SplashScreen(
    onDone: () -> Unit,
) {
    val reduced = MmMotion.reduced
    val colors = MmColors.current
    val pop = remember { Animatable(if (reduced) 1f else 0.6f) }
    val fade = remember { Animatable(if (reduced) 1f else 0f) }
    val reveal = remember { Animatable(if (reduced) 1f else 0f) }

    LaunchedEffect(Unit) {
        if (!reduced) {
            launch { fade.animateTo(1f, androidx.compose.animation.core.tween(160)) }
            launch { pop.animateTo(1f, androidx.compose.animation.core.spring(dampingRatio = 0.45f, stiffness = 380f)) }
            delay(230)
            launch { reveal.animateTo(1f, MmMotion.emphasized(420)) }
            delay(620)
        } else {
            delay(150)
        }
        onDone()
    }

    // Fraction of the wordmark artwork occupied by the "M" mark (left edge).
    val markFrac = 0.17f
    Box(Modifier.fillMaxSize().background(colors.background), contentAlignment = Alignment.Center) {
        Image(
            painter = painterResource(
                if (colors.isDark) R.drawable.logo_wordmark_on_dark else R.drawable.logo_wordmark_on_light,
            ),
            contentDescription = "MotorMila",
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .width(220.dp)
                .aspectRatio(1200f / 220f)
                .graphicsLayer {
                    val r = reveal.value
                    alpha = fade.value
                    // Mark-centred → lockup-centred.
                    translationX = (size.width * (0.5f - markFrac / 2f)) * (1f - r)
                    val s = pop.value
                    scaleX = s
                    scaleY = s
                    transformOrigin = androidx.compose.ui.graphics.TransformOrigin(markFrac / 2f, 0.5f)
                }
                .drawWithContent {
                    val r = reveal.value
                    clipRect(right = size.width * (markFrac + (1f - markFrac) * r)) {
                        this@drawWithContent.drawContent()
                    }
                },
        )
    }
}
