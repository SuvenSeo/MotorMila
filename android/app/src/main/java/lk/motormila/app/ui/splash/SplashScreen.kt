package lk.motormila.app.ui.splash

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
 * Brief logo reveal: the lockup settles from 0.94 → 1 while fading in
 * (emphasized, 450ms), holds a beat, then hands off. ~650ms total, never a
 * wall; reduced motion shows it static for 150ms. Session restore runs in
 * parallel (SplashGate), so this is rarely the critical path.
 */
@Composable
fun SplashScreen(
    onDone: () -> Unit,
) {
    val reduced = MmMotion.reduced
    val colors = MmColors.current
    val p = remember { Animatable(if (reduced) 1f else 0f) }

    LaunchedEffect(Unit) {
        if (!reduced) {
            launch { p.animateTo(1f, MmMotion.emphasized(MmMotion.Slow)) }
            delay((MmMotion.Slow + 200).toLong())
        } else {
            delay(150)
        }
        onDone()
    }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
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
                    val v = p.value
                    alpha = v
                    val s = 0.94f + 0.06f * v
                    scaleX = s
                    scaleY = s
                },
        )
    }
}
