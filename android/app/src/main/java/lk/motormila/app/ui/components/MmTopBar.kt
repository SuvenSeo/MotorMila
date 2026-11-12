package lk.motormila.app.ui.components

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.ui.res.stringResource
import androidx.compose.animation.core.spring
import androidx.compose.animation.rememberSplineBasedDecay
import lk.motormila.app.R
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmType

/** Collapse-on-scroll behaviour for [MmTopBar] (large). Snaps with a gentle spring. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun rememberMmTopBarScrollBehavior(): TopAppBarScrollBehavior =
    TopAppBarDefaults.exitUntilCollapsedScrollBehavior(
        state = rememberTopAppBarState(),
        snapAnimationSpec = if (MmMotion.reduced) null else MmMotion.gentle(),
        flingAnimationSpec = rememberSplineBasedDecay(),
    )

/** Pinned behaviour for a small [MmTopBar] that only turns translucent on scroll. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun rememberMmPinnedTopBarScrollBehavior(): TopAppBarScrollBehavior =
    TopAppBarDefaults.pinnedScrollBehavior(rememberTopAppBarState())

/**
 * Top bar. [large] = iOS-style large title (Space Grotesk 32) that collapses
 * into a 20sp title as content scrolls under it; the bar is transparent at
 * rest and becomes a translucent ink/paper surface with a hairline once
 * content passes beneath ("blur-ish": real blur is too costly on low-end
 * devices). Connect `scrollBehavior.nestedScrollConnection` to the content.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MmTopBar(
    title: String,
    modifier: Modifier = Modifier,
    large: Boolean = true,
    scrollBehavior: TopAppBarScrollBehavior? = null,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val c = MmColors.current
    val t = MmType.current
    val colors = TopAppBarDefaults.topAppBarColors(
        containerColor = androidx.compose.ui.graphics.Color.Transparent,
        scrolledContainerColor = c.surfaceOverlay,
        navigationIconContentColor = c.textPrimary,
        titleContentColor = c.textPrimary,
        actionIconContentColor = c.textPrimary,
    )
    val collapsed = (scrollBehavior?.state?.collapsedFraction ?: 0f)
    val overlap = (scrollBehavior?.state?.overlappedFraction ?: 0f)
    val hairline = if (large) collapsed else overlap
    val lineModifier = modifier.drawBehind {
        if (hairline > 0.5f) {
            drawLine(
                c.outline,
                Offset(0f, size.height - 0.5f),
                Offset(size.width, size.height - 0.5f),
                strokeWidth = 1f,
            )
        }
    }
    val nav: @Composable () -> Unit = {
        if (onBack != null) {
            MmIconButton(
                icon = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.mm_back),
                onClick = onBack,
            )
        }
    }
    if (large) {
        val m3 = androidx.compose.material3.MaterialTheme.typography
        androidx.compose.material3.MaterialTheme(
            typography = m3.copy(headlineMedium = t.displayM, titleLarge = t.titleS),
        ) {
        LargeTopAppBar(
            title = {
                // M3 swaps style between expanded/collapsed slots itself; we
                // feed the expanded style and let it scale to titleLarge.
                Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis)
            },
            modifier = lineModifier,
            navigationIcon = nav,
            actions = actions,
            windowInsets = WindowInsets.statusBars,
            colors = colors,
            scrollBehavior = scrollBehavior,
            expandedHeight = 112.dp,
        )
        }
    } else {
        TopAppBar(
            title = { Text(title, style = t.titleS, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            modifier = lineModifier,
            navigationIcon = nav,
            actions = actions,
            windowInsets = WindowInsets.statusBars,
            colors = colors,
            scrollBehavior = scrollBehavior,
        )
    }
}
