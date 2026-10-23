package lk.motormila.app.ui.navigation

import lk.motormila.app.ui.theme.MmMotion
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
import androidx.navigation.NavDestination.Companion.hasRoute
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

/**
 * Forward push between screens: Material fade-through with a slight scale
 * (incoming 0.96 → 1, outgoing 1 → 1.02), tokens from [MmMotion]. Tab
 * switches are peers, so they only crossfade (with a tiny 0.98 settle).
 * Navigation-Compose 2.8 drives the pop pair from the predictive-back
 * gesture progress, so the back swipe scrubs these same transitions.
 */
fun motormilaEnterTransition(
    reducedMotion: Boolean,
    tabSwitch: Boolean,
): EnterTransition {
    if (reducedMotion) return fadeIn(tween(0))
    return if (tabSwitch) {
        fadeIn(tween(MmMotion.Base, delayMillis = 40, easing = MmMotion.Standard)) +
            scaleIn(MmMotion.pageSpring(), initialScale = 0.985f)
    } else {
        MmMotion.fadeThroughEnter()
    }
}

fun motormilaExitTransition(
    reducedMotion: Boolean,
    tabSwitch: Boolean,
): ExitTransition {
    if (reducedMotion) return fadeOut(tween(0))
    return if (tabSwitch) {
        fadeOut(tween(MmMotion.Fast - 60, easing = MmMotion.Exit))
    } else {
        MmMotion.fadeThroughExit()
    }
}

fun motormilaPopEnterTransition(
    reducedMotion: Boolean,
    tabSwitch: Boolean,
): EnterTransition {
    if (reducedMotion) return fadeIn(tween(0))
    return if (tabSwitch) {
        fadeIn(tween(MmMotion.Base, delayMillis = 40, easing = MmMotion.Standard))
    } else {
        MmMotion.fadeThroughPopEnter()
    }
}

fun motormilaPopExitTransition(
    reducedMotion: Boolean,
    tabSwitch: Boolean,
): ExitTransition {
    if (reducedMotion) return fadeOut(tween(0))
    return if (tabSwitch) {
        fadeOut(tween(MmMotion.Fast - 60, easing = MmMotion.Exit))
    } else {
        MmMotion.fadeThroughPopExit()
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

// ───────────────────────────────────────────────────────────────────────────
// Round 5: one deliberate transition per kind of destination. Every
// movement is a spring (interruptible, and seekable so the predictive-back
// gesture scrubs the pop), fades are short tweens, and back always mirrors
// open. Reduced motion collapses everything to a 150 ms cross-fade.
// ───────────────────────────────────────────────────────────────────────────

/** What a destination is, for choosing its transition. */
enum class NavKind { TAB, DETAIL_CARD, COMPARE, HUB, MODAL, SPLASH, PUSH }

fun androidx.navigation.NavBackStackEntry.navKind(): NavKind {
    val d = destination
    fun has(k: kotlin.reflect.KClass<*>) = d.hasRoute(k)
    return when {
        has(Splash::class) -> NavKind.SPLASH
        isTabNavRoute(d.route) -> NavKind.TAB
        has(ListingDetail::class) && (arguments?.getBoolean("fromCard") == true) -> NavKind.DETAIL_CARD
        has(Compare::class) -> NavKind.COMPARE
        has(MakeHub::class) || has(MakeModelHub::class) || has(DistrictHub::class) || has(EvHub::class) ||
            has(BestPicks::class) || has(OfficialPulse::class) || has(PriceIndex::class) -> NavKind.HUB
        has(Login::class) || has(PlateScan::class) || has(ShareImport::class) -> NavKind.MODAL
        else -> NavKind.PUSH
    }
}

/** Position of a tab in the bar (Buy, Prices, Tools, Sell, Saved); -1 when not a tab. */
internal fun androidx.navigation.NavBackStackEntry.tabIndex(): Int {
    val d = destination
    return when {
        d.hasRoute(Home::class) || d.hasRoute(Search::class) -> 0
        d.hasRoute(Insights::class) -> 1
        d.hasRoute(Tools::class) || d.hasRoute(Profile::class) -> 2
        d.hasRoute(Sell::class) -> 3
        d.hasRoute(Watchlist::class) -> 4
        else -> -1
    }
}

private fun pushSpring() = spring<IntOffset>(dampingRatio = 0.92f, stiffness = 420f, visibilityThreshold = IntOffset.VisibilityThreshold)
private fun zoomSpring() = spring<Float>(dampingRatio = 0.88f, stiffness = 360f, visibilityThreshold = 0.001f)
private val reducedFadeIn: EnterTransition get() = fadeIn(tween(150))
private val reducedFadeOut: ExitTransition get() = fadeOut(tween(150))
private val TrayOrigin = androidx.compose.ui.graphics.TransformOrigin(0.5f, 1f)

private fun tabDirection(from: androidx.navigation.NavBackStackEntry, to: androidx.navigation.NavBackStackEntry): Int =
    (to.tabIndex() - from.tabIndex()).coerceIn(-1, 1)

/** Tab switch, incoming: cross-fade + a short directional slide (toward the tapped side) + 0.985 settle. */
private fun tabEnter(dir: Int): EnterTransition =
    fadeIn(tween(220, easing = MmMotion.Standard)) +
        scaleIn(MmMotion.pageSpring(), initialScale = 0.985f) +
        slideInHorizontally(spatialOffsetSpring()) { w -> (w * 0.06f * dir).roundToInt() }

/**
 * Tab switch, outgoing: stays opaque until the incoming page is mostly in,
 * then fades (no mid-switch dip to the bare window colour).
 */
private fun tabExit(dir: Int): ExitTransition =
    fadeOut(tween(90, delayMillis = 140, easing = MmMotion.Exit)) +
        slideOutHorizontally(spatialOffsetSpring()) { w -> (-w * 0.04f * dir).roundToInt() }

fun androidx.compose.animation.AnimatedContentTransitionScope<androidx.navigation.NavBackStackEntry>.motormilaEnter(
    reducedMotion: Boolean,
): EnterTransition {
    if (reducedMotion) return reducedFadeIn
    val from = initialState.navKind()
    return when (targetState.navKind()) {
        NavKind.TAB -> if (from == NavKind.TAB) {
            tabEnter(tabDirection(initialState, targetState))
        } else if (from == NavKind.SPLASH) {
            fadeIn(tween(MmMotion.Page, easing = MmMotion.Standard)) + scaleIn(MmMotion.pageSpring(), initialScale = 0.96f)
        } else {
            fadeIn(tween(MmMotion.Base, easing = MmMotion.Standard))
        }
        // The card's sharedBounds carries the page; this fade is only the
        // fallback when no card is on screen to grow out of.
        NavKind.DETAIL_CARD -> fadeIn(tween(200, easing = MmMotion.Standard))
        NavKind.COMPARE -> scaleIn(zoomSpring(), initialScale = 0.86f, transformOrigin = TrayOrigin) +
            fadeIn(tween(200, easing = MmMotion.Standard))
        NavKind.HUB -> scaleIn(zoomSpring(), initialScale = 0.92f) + fadeIn(tween(220, easing = MmMotion.Standard))
        NavKind.MODAL -> slideInVertically(sheetVerticalSpring()) { it } + fadeIn(tween(160))
        NavKind.SPLASH -> fadeIn(tween(0))
        NavKind.PUSH -> slideInHorizontally(pushSpring()) { it }
    }
}

fun androidx.compose.animation.AnimatedContentTransitionScope<androidx.navigation.NavBackStackEntry>.motormilaExit(
    reducedMotion: Boolean,
): ExitTransition {
    if (reducedMotion) return reducedFadeOut
    val from = initialState.navKind()
    if (from == NavKind.SPLASH) {
        return fadeOut(tween(220, easing = MmMotion.Exit)) + scaleOut(MmMotion.pageSpring(), targetScale = 1.04f)
    }
    return when (targetState.navKind()) {
        NavKind.TAB -> if (from == NavKind.TAB) tabExit(tabDirection(initialState, targetState)) else fadeOut(tween(MmMotion.Fast, easing = MmMotion.Exit))
        // The page beneath stays exactly where it is while the card grows over it.
        NavKind.DETAIL_CARD, NavKind.MODAL -> ExitTransition.KeepUntilTransitionsFinished
        NavKind.COMPARE, NavKind.HUB -> scaleOut(zoomSpring(), targetScale = 0.96f) + fadeOut(tween(220, delayMillis = 60, easing = MmMotion.Exit))
        NavKind.SPLASH -> fadeOut(tween(0))
        // Parallax underlay: drifts a quarter width left and dims a touch.
        NavKind.PUSH -> slideOutHorizontally(pushSpring()) { -it / 4 } + fadeOut(tween(MmMotion.Page), targetAlpha = 0.72f)
    }
}

fun androidx.compose.animation.AnimatedContentTransitionScope<androidx.navigation.NavBackStackEntry>.motormilaPopEnter(
    reducedMotion: Boolean,
): EnterTransition {
    if (reducedMotion) return reducedFadeIn
    val leaving = initialState.navKind()
    if (targetState.navKind() == NavKind.TAB && leaving == NavKind.TAB) return tabEnter(tabDirection(initialState, targetState))
    return when (leaving) {
        // Mirror of open: the page beneath is already in place.
        NavKind.DETAIL_CARD, NavKind.MODAL -> EnterTransition.None
        NavKind.COMPARE, NavKind.HUB -> scaleIn(zoomSpring(), initialScale = 0.96f) + fadeIn(tween(220, easing = MmMotion.Standard))
        NavKind.PUSH -> slideInHorizontally(pushSpring()) { -it / 4 } + fadeIn(tween(MmMotion.Page), initialAlpha = 0.72f)
        else -> fadeIn(tween(MmMotion.Base, easing = MmMotion.Standard))
    }
}

fun androidx.compose.animation.AnimatedContentTransitionScope<androidx.navigation.NavBackStackEntry>.motormilaPopExit(
    reducedMotion: Boolean,
): ExitTransition {
    if (reducedMotion) return reducedFadeOut
    if (initialState.navKind() == NavKind.TAB && targetState.navKind() == NavKind.TAB) {
        return tabExit(tabDirection(initialState, targetState))
    }
    return when (initialState.navKind()) {
        // sharedBounds shrinks the page back into its card; this is only the
        // fallback when that card is no longer on screen.
        NavKind.DETAIL_CARD -> fadeOut(tween(220, easing = MmMotion.Exit)) + scaleOut(zoomSpring(), targetScale = 0.94f)
        NavKind.COMPARE -> scaleOut(zoomSpring(), targetScale = 0.86f, transformOrigin = TrayOrigin) + fadeOut(tween(200, delayMillis = 40, easing = MmMotion.Exit))
        NavKind.HUB -> scaleOut(zoomSpring(), targetScale = 0.92f) + fadeOut(tween(200, delayMillis = 40, easing = MmMotion.Exit))
        NavKind.MODAL -> slideOutVertically(sheetVerticalSpring()) { it } + fadeOut(tween(200, delayMillis = 80))
        NavKind.PUSH -> slideOutHorizontally(pushSpring()) { it }
        else -> fadeOut(tween(MmMotion.Fast, easing = MmMotion.Exit))
    }
}
