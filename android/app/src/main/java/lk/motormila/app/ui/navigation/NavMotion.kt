package lk.motormila.app.ui.navigation

import android.content.res.Resources
import androidx.activity.BackEventCompat
import kotlin.math.roundToInt
import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.IntOffset
import kotlinx.coroutines.CancellationException
import lk.motormila.app.ui.theme.MotionTokens

/** Fade duration for tab switches and as the opacity half of a push. */
internal const val NAV_FADE_MS = 180

/** Legacy name kept for tests / docs — push travel now uses fixed dp offsets (spec §2). */
internal const val NAV_SLIDE_MS = 320

/**
 * Legacy push-enter fraction (kept for tests/docs).
 * Push travel now uses [MotionTokens.ScreenSlideDp] per spec §2.
 */
internal const val NAV_PUSH_ENTER_FRACTION = 0.12f

/**
 * Legacy push-exit fraction (kept for tests/docs).
 * The outgoing screen now travels [NAV_PUSH_EXIT_DP] per spec §2.
 */
internal const val NAV_PUSH_EXIT_FRACTION = 0.08f

/** Parallax exit travel (dp) for the outgoing screen on push — exits stay faster than entrances. */
internal const val NAV_PUSH_EXIT_DP = 16

/** System density for dp→px in non-composable transition specs (no Density scope available). */
private val systemDensity: Float by lazy { Resources.getSystem().displayMetrics.density }

private fun dpToPx(dp: Int): Int = (dp * systemDensity).roundToInt()


/** IntOffset twin of [MotionTokens.spatialDefault] for slide transitions. */
internal fun spatialOffsetSpring() = spring<IntOffset>(
    dampingRatio = 0.9f,
    stiffness = 700f,
    visibilityThreshold = IntOffset.VisibilityThreshold,
)

/** IntOffset twin of [MotionTokens.exit] for slide transitions (exits faster than entrances). */
internal fun exitOffsetTween() = tween<IntOffset>(
    durationMillis = 200,
    easing = CubicBezierEasing(0.2f, 0f, 0f, 1f),
)

/** Sheet/modal vertical spring: follows finger momentum — slight overshoot is correct here. */
internal fun sheetVerticalSpring() = spring<IntOffset>(
    dampingRatio = 0.8f,
    stiffness = 380f,
    visibilityThreshold = IntOffset.VisibilityThreshold,
)

/** Sliding bottom-nav indicator spring (spec §2: spring 0.9/700). */
fun tabIndicatorSpring() = spring<Float>(dampingRatio = 0.9f, stiffness = 700f)

fun motormilaEnterTransition(
    reducedMotion: Boolean,
    tabSwitch: Boolean,
): EnterTransition {
    if (reducedMotion) return fadeIn(tween(0))
    return if (tabSwitch) {
        // Tabs are peers, not a stack: plain crossfade, no horizontal slide.
        fadeIn(tween(300, easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)))
    } else {
        fadeIn(MotionTokens.effectsDefault()) +
            slideInHorizontally(
                animationSpec = spatialOffsetSpring(),
                initialOffsetX = { dpToPx(MotionTokens.ScreenSlideDp) },
            )
    }
}

fun motormilaExitTransition(
    reducedMotion: Boolean,
    tabSwitch: Boolean,
): ExitTransition {
    if (reducedMotion) return fadeOut(tween(0))
    return if (tabSwitch) {
        fadeOut(tween(300, easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)))
    } else {
        // Exits are faster than entrances — always.
        fadeOut(MotionTokens.exit()) +
            slideOutHorizontally(
                animationSpec = exitOffsetTween(),
                targetOffsetX = { -dpToPx(NAV_PUSH_EXIT_DP) },
            )
    }
}

fun motormilaPopEnterTransition(
    reducedMotion: Boolean,
    tabSwitch: Boolean,
): EnterTransition {
    if (reducedMotion) return fadeIn(tween(0))
    return if (tabSwitch) {
        fadeIn(tween(300, easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)))
    } else {
        // Exact reverse of the push exit.
        fadeIn(MotionTokens.exit()) +
            slideInHorizontally(
                animationSpec = exitOffsetTween(),
                initialOffsetX = { -dpToPx(NAV_PUSH_EXIT_DP) },
            )
    }
}

fun motormilaPopExitTransition(
    reducedMotion: Boolean,
    tabSwitch: Boolean,
): ExitTransition {
    if (reducedMotion) return fadeOut(tween(0))
    return if (tabSwitch) {
        fadeOut(tween(300, easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)))
    } else {
        // Exact reverse of the push enter.
        fadeOut(MotionTokens.effectsDefault()) +
            slideOutHorizontally(
                animationSpec = spatialOffsetSpring(),
                targetOffsetX = { dpToPx(MotionTokens.ScreenSlideDp) },
            )
    }
}

/**
 * Modal / bottom-sheet destinations: full-height vertical slide + fade,
 * spring 0.8/380 so the sheet follows finger momentum.
 */
fun motormilaModalEnterTransition(reducedMotion: Boolean): EnterTransition =
    if (reducedMotion) {
        fadeIn(tween(0))
    } else {
        fadeIn(MotionTokens.effectsDefault()) +
            slideInVertically(
                animationSpec = sheetVerticalSpring(),
                initialOffsetY = { it },
            )
    }

/** Reverse of [motormilaModalEnterTransition]; exit is faster than entrance. */
fun motormilaModalExitTransition(reducedMotion: Boolean): ExitTransition =
    if (reducedMotion) {
        fadeOut(tween(0))
    } else {
        fadeOut(MotionTokens.exit()) +
            slideOutVertically(
                animationSpec = sheetVerticalSpring(),
                targetOffsetY = { it },
            )
    }

/**
 * Dialogs: fade + 0.96 → 1.0 scale on [MotionTokens.spatialFast];
 * the scrim fades on [MotionTokens.effectsFast].
 */
fun motormilaDialogEnterTransition(reducedMotion: Boolean): EnterTransition =
    if (reducedMotion) {
        fadeIn(tween(0))
    } else {
        fadeIn(MotionTokens.effectsFast()) +
            scaleIn(
                initialScale = MotionTokens.PressScale,
                animationSpec = MotionTokens.spatialFast(),
            )
    }

fun motormilaDialogExitTransition(reducedMotion: Boolean): ExitTransition =
    if (reducedMotion) {
        fadeOut(tween(0))
    } else {
        fadeOut(MotionTokens.effectsFast()) +
            scaleOut(
                targetScale = MotionTokens.PressScale,
                animationSpec = MotionTokens.spatialFast(),
            )
    }

fun isTabSwitch(
    initialRoute: String?,
    targetRoute: String?,
): Boolean = isTabNavRoute(initialRoute) && isTabNavRoute(targetRoute)

/**
 * Predictive-back follow-finger transform for detail/full-screen routes (spec §2).
 *
 * While the back gesture is in flight the outgoing screen scales down slightly
 * and tracks the finger; a cancelled gesture springs back with
 * [MotionTokens.spatialDefault], a committed gesture lets the pop complete.
 * No-op when [enabled] is false (tab destinations, reduced motion).
 *
 * Uses [PredictiveBackHandler] from androidx.activity.compose (activity-compose
 * 1.10.1 — stable, no opt-in required). On platforms without predictive-back
 * progress the flow simply completes and the pop proceeds as before.
 */
@Composable
fun MotormilaPredictiveBackTransform(
    enabled: Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    var progress by remember { mutableFloatStateOf(0f) }
    var touchX by remember { mutableFloatStateOf(0f) }
    var fromRightEdge by remember { mutableStateOf(true) }
    PredictiveBackHandler(enabled = enabled) { events ->
        try {
            events.collect { event ->
                progress = event.progress
                touchX = event.touchX
                fromRightEdge = event.swipeEdge == BackEventCompat.EDGE_RIGHT
            }
            progress = 0f
        } catch (cancelled: CancellationException) {
            val start = progress
            Animatable(start).animateTo(
                targetValue = 0f,
                animationSpec = MotionTokens.spatialDefault(),
            ) {
                progress = value
            }
            throw cancelled
        }
    }
    Box(
        modifier.graphicsLayer {
            val p = progress
            val s = 1f - 0.08f * p
            scaleX = s
            scaleY = s
            // Follow the finger horizontally, anchored at the touch point.
            translationX = if (fromRightEdge) {
                p * touchX * 0.6f
            } else {
                -p * (size.width - touchX) * 0.6f
            }
            alpha = 1f - 0.15f * p
        },
    ) {
        content()
    }
}
