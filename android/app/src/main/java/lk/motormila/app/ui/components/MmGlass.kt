package lk.motormila.app.ui.components

import android.os.Build
import android.view.View
import android.view.WindowManager
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.ui.draw.drawBehind
import dev.chrisbanes.haze.hazeEffect
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.SnackbarData
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogWindowProvider
import lk.motormila.app.ui.theme.GlassWeight
import lk.motormila.app.ui.theme.LiquidGlass
import lk.motormila.app.ui.theme.LocalGlassEnv
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.liquidGlass

/**
 * True when the platform can blur the windows behind a dialog/sheet window
 * (API 31+, cross-window blur enabled — off on some low-end devices, in
 * battery saver and on software-rendered emulators).
 */
@Composable
fun rememberCrossWindowBlur(): Boolean {
    if (LocalInspectionMode.current) return false
    val view = LocalView.current
    val solid = LocalGlassEnv.current.solid
    return remember(view, solid) {
        if (solid || Build.VERSION.SDK_INT < 31) return@remember false
        val wm = view.context.getSystemService(WindowManager::class.java)
        runCatching { wm?.isCrossWindowBlurEnabled == true }.getOrDefault(false)
    }
}

private fun View.findDialogWindow(): android.view.Window? {
    var v: Any? = this
    while (v is View) {
        if (v is DialogWindowProvider) return v.window
        v = v.parent
    }
    return null
}

/**
 * Call inside a Dialog / ModalBottomSheet's content: blurs everything behind
 * that window (real cross-window blur, API 31+) so the sheet/dialog reads as
 * liquid glass floating over the app. No-op where unsupported.
 */
@Composable
fun WindowBackdropBlur(radius: Dp = 28.dp, enabled: Boolean = true) {
    val view = LocalView.current
    val density = LocalDensity.current
    val can = rememberCrossWindowBlur()
    DisposableEffect(view, can, enabled) {
        if (!can || !enabled || Build.VERSION.SDK_INT < 31) return@DisposableEffect onDispose { }
        val window = view.findDialogWindow() ?: return@DisposableEffect onDispose { }
        val px = with(density) { radius.roundToPx() }
        window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
        window.attributes = window.attributes.apply { blurBehindRadius = px }
        onDispose { }
    }
}

/** Container colour for a glass sheet/dialog: translucent when the backdrop is blurred. */
@Composable
fun glassSheetColor(): Color {
    val c = MmColors.current
    return when {
        LocalGlassEnv.current.solid -> LiquidGlass.solid(c)
        rememberCrossWindowBlur() -> LiquidGlass.tint(c, GlassWeight.Thick)
        else -> if (c.isDark) Color(0xFF1C1C20) else Color(0xFFFDFDFE)
    }
}

/** Snackbar host whose snackbars are liquid-glass capsules that spring up. */
@Composable
fun MmGlassSnackbarHost(hostState: SnackbarHostState, modifier: Modifier = Modifier) {
    SnackbarHost(hostState, modifier) { data -> MmGlassSnackbar(data) }
}

@Composable
fun MmGlassSnackbar(data: SnackbarData, modifier: Modifier = Modifier) {
    val c = MmColors.current
    val reduced = MmMotion.reduced
    val rise = remember(data) { Animatable(if (reduced) 0f else 1f) }
    LaunchedEffect(data) {
        if (!reduced) rise.animateTo(0f, spring(dampingRatio = 0.62f, stiffness = 420f))
    }
    Box(
        modifier
            .fillMaxWidth()
            .graphicsLayer {
                val p = rise.value
                translationY = 28.dp.toPx() * p
                val s = 1f - 0.08f * p
                scaleX = s
                scaleY = s
                alpha = (1f - p * 1.4f).coerceIn(0f, 1f)
            }
            .heightIn(min = 52.dp)
            .liquidGlass(MmShapes.pill, GlassWeight.Thick, elevation = 16.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Row(
            Modifier.padding(start = 20.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                data.visuals.message,
                style = MmType.current.bodyM,
                color = c.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            val action = data.visuals.actionLabel
            if (action != null) {
                Spacer(Modifier.width(8.dp))
                TextButton(onClick = { data.performAction() }) {
                    Text(action, style = MmType.current.label, color = c.brandText, maxLines = 1)
                }
            } else {
                Spacer(Modifier.width(12.dp))
            }
        }
    }
}

/**
 * Liquid-glass strip behind the status bar for screens without a top bar
 * (Home, Detail): fades in as content scrolls under the clock/icons.
 * [alpha] is read in the draw phase only.
 */
@Composable
fun GlassStatusBarStrip(
    backdrop: dev.chrisbanes.haze.HazeState?,
    alpha: () -> Float,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    val env = LocalGlassEnv.current
    val style = LiquidGlass.style(c, GlassWeight.Regular)
    val solid = LiquidGlass.solid(c)
    val fallback = LiquidGlass.fallback(c, GlassWeight.Regular)
    androidx.compose.foundation.layout.Box(
        modifier
            .fillMaxWidth()
            .windowInsetsTopHeight(WindowInsets.statusBars)
            .then(
                when {
                    env.solid -> Modifier.drawBehind { drawRect(solid.copy(alpha = alpha())) }
                    backdrop != null -> Modifier.hazeEffect(backdrop, style) {
                        blurEnabled = env.blurAllowed
                        this.alpha = alpha()
                    }
                    else -> Modifier.drawBehind { drawRect(fallback.copy(alpha = fallback.alpha * alpha())) }
                },
            ),
    )
}
