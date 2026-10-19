package lk.motormila.app.ui.theme

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/** Apple smooth easing cubic (0.16, 1, 0.3, 1). */
val AppleEasing = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)

/** Emphasized easing cubic (0.05, 0.7, 0.1, 1). */
val EmphasizedEasing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)

/** Standard Apple smooth tween. */
fun <T> appleTween(durationMillis: Int = 300) =
    tween<T>(durationMillis = durationMillis, easing = AppleEasing)

/** Standard emphasized tween: 350ms. */
fun <T> emphasizedTween(durationMillis: Int = 350) =
    tween<T>(durationMillis = durationMillis, easing = EmphasizedEasing)

/** Snappy press feedback with natural Apple spring physics. */
fun <T> pressSpring() = spring<T>(
    dampingRatio = 0.72f,
    stiffness = 500f,
)

/** Bouncy fluid spring for micro-interactions (tabs, badges, hearts). */
fun <T> fluidSpring() = spring<T>(
    dampingRatio = 0.65f,
    stiffness = 380f,
)

/**
 * Overdamped push-navigation spring (iOS-like: settles without bounce).
 * Pair with a short fade tween; do not spring opacity.
 */
fun <T> pushSpring() = spring<T>(
    dampingRatio = 0.86f,
    stiffness = 380f,
)

/** Tab cross-fade scale spring — slightly stiffer than [pushSpring]. */
fun <T> tabSpring() = spring<T>(
    dampingRatio = 0.90f,
    stiffness = 500f,
)

/** Bottom-sheet entrance. */
fun <T> sheetSpring() = spring<T>(
    dampingRatio = 0.82f,
    stiffness = 180f,
)

/** Radar ring pulse. */
fun <T> ringSpring() = spring<T>(
    dampingRatio = 0.85f,
    stiffness = 120f,
)

object ReduceMotion {
    /**
     * True when the user disabled animations (Animator duration scale == 0).
     * Same signal as core.motion.rememberReducedMotion; duplicated here so the
     * theme module never touches the framework accessibility service directly.
     */
    val current: Boolean
        @Composable
        get() {
            val context = LocalContext.current
            return remember {
                runCatching {
                    android.provider.Settings.Global.getFloat(
                        context.contentResolver,
                        android.provider.Settings.Global.ANIMATOR_DURATION_SCALE,
                        1f,
                    ) == 0f
                }.getOrDefault(false)
            }
        }
}

/** Shimmer sweep duration (skip when [ReduceMotion.current]). */
const val SHIMMER_MS = 1200

/** Soft pulse duration for live badges. */
const val PULSE_MS = 1600

// M3-Expressive-derived house tokens — spatial springs for movement, effects springs (always damping 1.0) for fades.

/**
 * Motion spec §1 tokens: single source of truth for animation curves.
 * Spatial springs for movement, effects springs for fades — never bounce alpha/color.
 */
object MotionTokens {
    // ---- Spatial springs (position / size / scale). May overshoot slightly on momentum only.
    fun spatialFast(): FiniteAnimationSpec<Float> = spring(dampingRatio = 0.9f, stiffness = 1400f)
    fun spatialDefault(): FiniteAnimationSpec<Float> = spring(dampingRatio = 0.9f, stiffness = 700f)
    fun spatialSlow(): FiniteAnimationSpec<Float> = spring(dampingRatio = 0.9f, stiffness = 300f)
    // Hero / expressive moments ONLY (visible overshoot — use sparingly).
    fun spatialExpressive(): FiniteAnimationSpec<Float> = spring(dampingRatio = 0.8f, stiffness = 380f)

    // ---- Effects springs (alpha / color). NEVER bounce.
    fun effectsFast(): FiniteAnimationSpec<Float> = spring(dampingRatio = 1f, stiffness = 3800f)
    fun effectsDefault(): FiniteAnimationSpec<Float> = spring(dampingRatio = 1f, stiffness = 1600f)
    fun effectsSlow(): FiniteAnimationSpec<Float> = spring(dampingRatio = 1f, stiffness = 800f)

    // ---- Fixed tweens (deterministic micro-moments, non-interruptible)
    fun tapDown(): FiniteAnimationSpec<Float> = tween(120, easing = FastOutLinearInEasing) // press
    fun tapUp(): FiniteAnimationSpec<Float> = spring(dampingRatio = 0.9f, stiffness = 1400f) // release
    fun entrance(): FiniteAnimationSpec<Float> =
        tween(durationMillis = 300, easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)) // EaseOutCubic
    fun exit(): FiniteAnimationSpec<Float> =
        tween(durationMillis = 200, easing = CubicBezierEasing(0.2f, 0f, 0f, 1f))
    fun countUp(): FiniteAnimationSpec<Float> =
        tween(durationMillis = 600, easing = CubicBezierEasing(0.2f, 0f, 0f, 1f))
    fun shimmer(): FiniteAnimationSpec<Float> = tween(durationMillis = SHIMMER_MS, easing = LinearEasing)

    // ---- Choreography constants
    const val StaggerStepMs = 45          // beat between arrivals in a cascade
    const val EntranceWindowMs = 700      // max time a screen entrance cascade may play
    const val EntranceRiseDp = 24         // rise distance for entering cards
    const val PressScale = 0.96f          // button/card press target scale
    const val ScreenSlideDp = 32          // nav push slide distance
}
