package lk.motormila.app.ui.splash

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.graphics.ExperimentalAnimationGraphicsApi
import androidx.compose.animation.graphics.res.animatedVectorResource
import androidx.compose.animation.graphics.res.rememberAnimatedVectorPainter
import androidx.compose.animation.graphics.vector.AnimatedImageVector
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import lk.motormila.app.R
import lk.motormila.app.ui.components.MOTORMILA_WORDMARK_ASPECT
import lk.motormila.app.ui.components.motormilaWordmarkRes
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion

/** Total length of the brand v2 opening animation (SPLASH_ANIMATION_SPEC.md). */
private const val SplashAnimMs = 900L

/** Reduced motion: static wordmark, linear 0 -> 1 alpha over 200ms. */
private const val SplashReducedMs = 200

/**
 * Brand v2 opening: the existing M draws up from the baseline (left stem,
 * V + shaft, right stem, staggered), the arrow springs out of the shaft with
 * one overshoot, then "otormila" cascades in letter by letter. One
 * AnimatedVectorDrawable per theme, 900ms total. Reduced motion shows the
 * static wordmark with a 200ms fade. Session restore runs in parallel
 * (SplashGate), so this is rarely the critical path.
 */
@OptIn(ExperimentalAnimationGraphicsApi::class)
@Composable
fun SplashScreen(
    onDone: () -> Unit,
    /** false = draw the settled lockup at once (screenshot tests). */
    animate: Boolean = true,
) {
    val reduced = MmMotion.reduced
    val colors = MmColors.current
    // Screenshot tests / previews: draw the settled lockup.
    val static = !animate || LocalInspectionMode.current
    val logoModifier = Modifier.width(220.dp).aspectRatio(MOTORMILA_WORDMARK_ASPECT)

    Box(Modifier.fillMaxSize().background(colors.background), contentAlignment = Alignment.Center) {
        when {
            static -> {
                Image(
                    painter = painterResource(motormilaWordmarkRes(colors.isDark)),
                    contentDescription = "MotorMila",
                    contentScale = ContentScale.Fit,
                    modifier = logoModifier,
                )
                LaunchedEffect(Unit) { onDone() }
            }
            reduced -> {
                val fade = remember { Animatable(0f) }
                LaunchedEffect(Unit) {
                    fade.animateTo(1f, tween(SplashReducedMs, easing = LinearEasing))
                    onDone()
                }
                Image(
                    painter = painterResource(motormilaWordmarkRes(colors.isDark)),
                    contentDescription = "MotorMila",
                    contentScale = ContentScale.Fit,
                    modifier = logoModifier.graphicsLayer { alpha = fade.value },
                )
            }
            else -> {
                val avd = AnimatedImageVector.animatedVectorResource(
                    if (colors.isDark) R.drawable.avd_motormila_splash_on_dark
                    else R.drawable.avd_motormila_splash_on_light,
                )
                var atEnd by remember { mutableStateOf(false) }
                LaunchedEffect(Unit) {
                    atEnd = true
                    delay(SplashAnimMs)
                    onDone()
                }
                Image(
                    painter = rememberAnimatedVectorPainter(avd, atEnd),
                    contentDescription = "MotorMila",
                    contentScale = ContentScale.Fit,
                    modifier = logoModifier,
                )
            }
        }
    }
}
