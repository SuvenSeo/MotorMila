package lk.motormila.app.ui.theme

import android.provider.Settings
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.unit.IntOffset

/**
 * Motion tokens, shared with the web spec (work/ux-review/MOTION_SPEC.md):
 * durations fast 180 / base 280 / slow 450 ms; Standard (0.2,0,0,1),
 * Emphasized (0.3,0,0,1), Exit (0.4,0,1,1); springs Snappy / Gentle / Bouncy.
 *
 * Rules: animate transform + alpha only; springs for movement, tweens for
 * fades (never bounce alpha/colour); when [reduced] is true every spec here
 * collapses to [snap] — check `MmMotion.reduced` before starting anything
 * that loops or travels.
 */
object MmMotion {
    // Durations (ms)
    const val Instant = 100
    const val Fast = 180
    const val Base = 280
    const val Slow = 450
    const val Page = 350
    const val StaggerMs = 40
    const val MaxStaggered = 8
    const val ShimmerMs = 1300

    // Easing
    val Standard: Easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)
    val Emphasized: Easing = CubicBezierEasing(0.3f, 0f, 0f, 1f)
    val Exit: Easing = CubicBezierEasing(0.4f, 0f, 1f, 1f)

    // Press
    const val PressScale = 0.97f

    // Spring parameters (exposed so callers can build typed springs)
    const val SnappyStiffness = 500f
    const val SnappyDamping = 0.8f
    const val GentleStiffness = Spring.StiffnessLow + 60f // ≈ 260
    const val GentleDamping = 0.92f
    const val BouncyStiffness = 400f
    const val BouncyDamping = 0.6f

    fun <T> snappy(visibilityThreshold: T? = null): SpringSpec<T> =
        spring(SnappyDamping, SnappyStiffness, visibilityThreshold)

    fun <T> gentle(visibilityThreshold: T? = null): SpringSpec<T> =
        spring(GentleDamping, GentleStiffness, visibilityThreshold)

    fun <T> bouncy(visibilityThreshold: T? = null): SpringSpec<T> =
        spring(BouncyDamping, BouncyStiffness, visibilityThreshold)

    fun <T> standard(durationMillis: Int = Base, delayMillis: Int = 0): FiniteAnimationSpec<T> =
        tween(durationMillis, delayMillis, Standard)

    fun <T> emphasized(durationMillis: Int = Slow, delayMillis: Int = 0): FiniteAnimationSpec<T> =
        tween(durationMillis, delayMillis, Emphasized)

    fun <T> exit(durationMillis: Int = Fast): FiniteAnimationSpec<T> =
        tween(durationMillis, easing = Exit)

    /** Returns [spec] or a snap when reduced motion is on. */
    fun <T> orSnap(reduced: Boolean, spec: FiniteAnimationSpec<T>): FiniteAnimationSpec<T> =
        if (reduced) snap() else spec

    /** True when the system "Remove animations" setting is on. */
    val reduced: Boolean
        @Composable @ReadOnlyComposable
        get() = LocalMmReducedMotion.current

    // ---- Ready-made transitions -------------------------------------------

    /**
     * Page movement spring (launch polish): critically-near damping 0.9 so a
     * push/pop settles like iOS without overshoot; fades stay tweens.
     * Seekable, so predictive back still scrubs it with the gesture.
     */
    fun pageSpring(): SpringSpec<Float> = spring(dampingRatio = 0.9f, stiffness = 380f)

    /**
     * Container transform (card -> Detail and back, compare tray -> Compare,
     * hub tiles): ONE spring for every shared bound of the morph — container,
     * photo, title, price — so they travel together and land on the same
     * frame. (Before, the photo rode a 260-stiffness spring while title/price
     * rode 700 and the page a 280 ms fade-through + scale, so parts arrived at
     * different times and the morph looked like it broke in the middle.)
     */
    fun containerSpring(): SpringSpec<androidx.compose.ui.geometry.Rect> = spring(
        dampingRatio = 0.88f,
        stiffness = 360f,
        visibilityThreshold = androidx.compose.ui.geometry.Rect.VisibilityThreshold,
    )

    /** Float twin of [containerSpring] (fades / corner radius riding the same morph). */
    fun containerSpringF(): SpringSpec<Float> = spring(dampingRatio = 0.88f, stiffness = 360f, visibilityThreshold = 0.001f)

    /** Dp twin of [containerSpring]. */
    fun containerSpringDp(): SpringSpec<androidx.compose.ui.unit.Dp> =
        spring(dampingRatio = 0.88f, stiffness = 360f, visibilityThreshold = androidx.compose.ui.unit.Dp.VisibilityThreshold)

    /** Material fade-through with a slight scale: forward navigation. */
    fun fadeThroughEnter(reduced: Boolean = false): EnterTransition =
        if (reduced) EnterTransition.None
        else fadeIn(tween(Base, delayMillis = 60, easing = Standard)) +
            scaleIn(pageSpring(), initialScale = 0.96f)

    fun fadeThroughExit(reduced: Boolean = false): ExitTransition =
        if (reduced) ExitTransition.None
        else fadeOut(tween(Fast - 60, easing = Exit)) +
            scaleOut(pageSpring(), targetScale = 1.02f)

    /** Back navigation mirror (outgoing shrinks slightly, incoming settles from 1.02). */
    fun fadeThroughPopEnter(reduced: Boolean = false): EnterTransition =
        if (reduced) EnterTransition.None
        else fadeIn(tween(Base, delayMillis = 60, easing = Standard)) +
            scaleIn(pageSpring(), initialScale = 1.02f)

    /**
     * Pop (and predictive-back preview, which seeks this with the gesture):
     * the page shrinks toward a card (0.9), drifts toward the back edge and
     * fades late — like the system back preview, so the user sees where back
     * leads before committing.
     */
    fun fadeThroughPopExit(reduced: Boolean = false): ExitTransition =
        if (reduced) ExitTransition.None
        else fadeOut(tween(Base, delayMillis = 60, easing = Exit)) +
            scaleOut(pageSpring(), targetScale = 0.9f) +
            slideOutHorizontally(pageSpringInt()) { it / 10 }

    /** Int-offset twin of [pageSpring] for slide transitions. */
    fun pageSpringInt(): SpringSpec<IntOffset> = spring(dampingRatio = 0.9f, stiffness = 380f, visibilityThreshold = IntOffset(1, 1))

    /** Content swap (loading → content, tab panes). */
    fun crossfade(reduced: Boolean = false): ContentTransform =
        if (reduced) EnterTransition.None togetherWith ExitTransition.None
        else fadeIn(tween(Base, delayMillis = 40, easing = Standard)) togetherWith
            fadeOut(tween(Fast, easing = Exit))

    /** Small rise used by list/section entrances. */
    fun riseIn(reduced: Boolean = false, delayMillis: Int = 0): EnterTransition =
        if (reduced) EnterTransition.None
        else fadeIn(tween(Base, delayMillis, Standard)) +
            slideInVertically(tween(Slow, delayMillis, Emphasized)) { it / 8 }

    fun sinkOut(reduced: Boolean = false): ExitTransition =
        if (reduced) ExitTransition.None
        else fadeOut(tween(Fast, easing = Exit)) +
            slideOutVertically(tween(Fast, easing = Exit)) { it / 10 }

    /** Placement spec for LazyList `Modifier.animateItem(placementSpec = …)`. */
    val itemPlacement: FiniteAnimationSpec<IntOffset> =
        spring(GentleDamping, Spring.StiffnessMediumLow, IntOffset(1, 1))

    fun staggerDelay(index: Int): Int = (index.coerceAtMost(MaxStaggered)) * StaggerMs
}

val LocalMmReducedMotion = staticCompositionLocalOf { false }

/** Reads ANIMATOR_DURATION_SCALE once per composition host. Paparazzi/preview → false. */
@Composable
fun rememberSystemReducedMotion(): Boolean {
    if (LocalInspectionMode.current) return false
    val context = LocalContext.current
    return remember(context) {
        runCatching {
            Settings.Global.getFloat(
                context.contentResolver,
                Settings.Global.ANIMATOR_DURATION_SCALE,
                1f,
            ) == 0f
        }.getOrDefault(false)
    }
}
