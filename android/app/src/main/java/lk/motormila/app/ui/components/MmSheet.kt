package lk.motormila.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.glassEdges
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType

/**
 * Modal bottom sheet in the house style: 32dp top corners, liquid-glass
 * surface over a blurred app (cross-window blur, API 31+; opaque otherwise),
 * slim handle, scrim from tokens. The sheet itself uses M3's drag/settle;
 * the content rides in on a gentle spring (24dp rise + fade) so opening
 * feels physical rather than linear. Predictive back is handled by M3.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MmSheet(
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    skipPartiallyExpanded: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    // SheetState stays internal so callers need no experimental opt-in.
    val sheetState: SheetState = rememberModalBottomSheetState(skipPartiallyExpanded = skipPartiallyExpanded)
    val c = MmColors.current
    val reduced = MmMotion.reduced
    val density = LocalDensity.current
    val rise = remember { Animatable(if (reduced) 0f else 1f) }
    LaunchedEffect(Unit) {
        if (!reduced) rise.animateTo(0f, MmMotion.gentle())
    }
    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        // Never expand under the status bar (tall sheets at 200 % put the
        // title under the clock).
        modifier = modifier
            .windowInsetsPadding(androidx.compose.foundation.layout.WindowInsets.statusBars)
            .glassEdges(MmShapes.sheet, c, sheen = !lk.motormila.app.ui.theme.glassIsSolid),
        sheetState = sheetState,
        shape = MmShapes.sheet,
        containerColor = glassSheetColor(),
        contentColor = c.textPrimary,
        scrimColor = c.scrim,
        tonalElevation = 0.dp,
        dragHandle = { MmSheetHandle() },
    ) {
        // Real blur of the app behind the sheet window (API 31+).
        WindowBackdropBlur()
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .graphicsLayer {
                    val p = rise.value
                    translationY = with(density) { 24.dp.toPx() } * p
                    alpha = (1f - p).coerceIn(0f, 1f)
                }
                .navigationBarsPadding()
                .padding(bottom = MmSpacing.lg),
        ) {
            if (title != null) {
                Text(
                    title,
                    style = MmType.current.titleM,
                    color = c.textPrimary,
                    modifier = Modifier
                        .padding(horizontal = MmSpacing.gutter)
                        .padding(top = 4.dp, bottom = MmSpacing.lg)
                        .align(Alignment.Start),
                )
            }
            content()
        }
    }
}

@Composable
private fun MmSheetHandle() {
    Box(
        Modifier
            .padding(top = 10.dp, bottom = 6.dp)
            .size(width = 36.dp, height = 5.dp)
            .clip(MmShapes.pill)
            .background(MmColors.current.outlineStrong),
    )
}

/**
 * Static sheet frame (same shape/handle/title as [MmSheet]) for previews and
 * screenshot tests, where a real ModalBottomSheet window can't render.
 */
@Composable
fun MmSheetFrame(
    modifier: Modifier = Modifier,
    title: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = MmColors.current
    Column(
        modifier
            .fillMaxWidth()
            .clip(MmShapes.sheet)
            .background(c.surfaceRaised)
            .padding(bottom = MmSpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        MmSheetHandle()
        if (title != null) {
            Text(
                title,
                style = MmType.current.titleM,
                color = c.textPrimary,
                modifier = Modifier
                    .padding(horizontal = MmSpacing.gutter)
                    .padding(top = 4.dp, bottom = MmSpacing.lg)
                    .align(Alignment.Start),
            )
        }
        Column(Modifier.fillMaxWidth()) { content() }
    }
}
