package lk.motormila.app.ui.detail

import android.app.Activity
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBackIos
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import lk.motormila.app.R
import lk.motormila.app.ui.components.MmSaveBurstIcon
import lk.motormila.app.ui.theme.CappedFontScale
import lk.motormila.app.ui.theme.GlassWeight
import lk.motormila.app.ui.theme.LiquidGlass
import lk.motormila.app.ui.theme.LocalGlassEnv
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.liquidGlass
import lk.motormila.app.ui.theme.mmPress

/**
 * Over-pull at the top of the Detail page: the finger's extra travel (with
 * rubber-band resistance) becomes [offset]; on release it springs back.
 * The page translates by [offset] and the hero photo zooms to fill the gap.
 */
@Stable
class DetailStretchState(private val scope: CoroutineScope, private val reduced: Boolean) {
    private val anim = Animatable(0f)
    val offset: Float get() = anim.value

    val connection = object : NestedScrollConnection {
        override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
            // Scrolling back up while stretched: eat the delta to un-stretch first.
            if (available.y < 0f && anim.value > 0f && source == NestedScrollSource.UserInput) {
                val next = (anim.value + available.y).coerceAtLeast(0f)
                val used = next - anim.value
                scope.launch { anim.snapTo(next) }
                return Offset(0f, used)
            }
            return Offset.Zero
        }

        override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
            if (reduced || source != NestedScrollSource.UserInput || available.y <= 0f) return Offset.Zero
            // Rubber band: resistance grows with distance.
            val resistance = 0.5f / (1f + anim.value / 260f)
            val next = (anim.value + available.y * resistance).coerceAtMost(420f)
            scope.launch { anim.snapTo(next) }
            return Offset(0f, available.y)
        }

        override suspend fun onPreFling(available: Velocity): Velocity {
            if (anim.value > 0f) {
                anim.animateTo(0f, spring(dampingRatio = 0.62f, stiffness = 320f))
                return available
            }
            return Velocity.Zero
        }
    }
}

@Composable
fun rememberDetailStretch(): DetailStretchState {
    val scope = rememberCoroutineScope()
    val reduced = MmMotion.reduced
    return remember(scope, reduced) { DetailStretchState(scope, reduced) }
}

/**
 * Light (white) status-bar icons while the hero photo sits under the status
 * bar; the theme's own appearance returns once the glass title bar is in.
 */
@Composable
fun DetailStatusBarIcons(overPhoto: () -> Boolean) {
    val view = LocalView.current
    val dark = MmColors.current.isDark
    if (view.isInEditMode) return
    LaunchedEffect(view, dark) {
        val window = (view.context as? Activity)?.window ?: return@LaunchedEffect
        snapshotFlow { overPhoto() }.collect { photo ->
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !photo && !dark
        }
    }
    DisposableEffect(view, dark) {
        onDispose {
            val window = (view.context as? Activity)?.window ?: return@onDispose
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !dark
        }
    }
}

/**
 * Detail top chrome: round glass back / save / share buttons floating on the
 * photo (a soft top shade keeps them and the status bar legible), and a
 * liquid-glass title bar that fades in as the photo scrolls away.
 */
@Composable
fun DetailTopChrome(
    title: String,
    collapse: () -> Float,
    backdrop: HazeState,
    onBack: () -> Unit,
    saved: Boolean,
    onToggleSave: () -> Unit,
    onShare: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    val env = LocalGlassEnv.current
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val style = LiquidGlass.style(c, GlassWeight.Regular)
    val solid = LiquidGlass.solid(c)
    Box(
        modifier
            .fillMaxWidth()
            .height(statusTop + 56.dp)
            // Top shade over the photo (fades out as the glass bar fades in).
            .drawBehind {
                val a = 1f - collapse()
                if (a > 0.01f) {
                    drawRect(
                        Brush.verticalGradient(
                            0f to Color.Black.copy(alpha = 0.38f * a),
                            1f to Color.Transparent,
                        ),
                    )
                }
            }
            .then(
                if (env.solid) {
                    Modifier.drawBehind { drawRect(solid.copy(alpha = collapse())) }
                } else {
                    Modifier.hazeEffect(backdrop, style) {
                        blurEnabled = env.blurAllowed
                        alpha = collapse()
                    }
                },
            )
            .drawBehind {
                val a = collapse()
                if (a > 0.01f) {
                    drawLine(c.outline.copy(alpha = c.outline.alpha * a), Offset(0f, size.height - 0.5f), Offset(size.width, size.height - 0.5f), 1f)
                }
            },
    ) {
        Row(
            Modifier
                .padding(top = statusTop)
                .fillMaxWidth()
                .height(56.dp)
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
            DetailGlassButton(
                contentDescription = stringResource(R.string.scr_back),
                onClick = onBack,
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBackIos,
                    contentDescription = null,
                    tint = c.textPrimary,
                    modifier = Modifier
                        .size(18.dp)
                        .graphicsLayer { translationX = (if (rtl) -1 else 1) * 3.dp.toPx() },
                )
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                CappedFontScale(max = 1.3f) {
                    Text(
                        title,
                        style = MmType.current.titleS,
                        color = c.textPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .padding(horizontal = 8.dp)
                            .graphicsLayer {
                                val a = collapse()
                                alpha = a
                                translationY = (1f - a) * 8.dp.toPx()
                            },
                    )
                }
            }
            DetailGlassButton(
                contentDescription = stringResource(if (saved) R.string.glass_unsave else R.string.glass_save),
                onClick = onToggleSave,
            ) {
                MmSaveBurstIcon(
                    saved = saved,
                    tint = c.textPrimary,
                    savedTint = c.brandText,
                    burstColor = c.brand,
                    iconSize = 20.dp,
                )
            }
            Spacer(Modifier.width(6.dp))
            DetailGlassButton(
                contentDescription = stringResource(R.string.glass_share),
                onClick = onShare,
            ) {
                Icon(Icons.Filled.Share, contentDescription = null, tint = c.textPrimary, modifier = Modifier.size(20.dp))
            }
        }
    }
}

@Composable
private fun DetailGlassButton(
    contentDescription: String,
    onClick: () -> Unit,
    size: Dp = 44.dp,
    content: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val haptics = MmHaptics.current
    Box(
        Modifier
            .size(size)
            .mmPress(interaction, 0.86f)
            .liquidGlass(MmShapes.pill, GlassWeight.Thin, elevation = 8.dp)
            .clickable(interactionSource = interaction, indication = null, role = Role.Button) {
                haptics.press()
                onClick()
            }
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) { content() }
}
