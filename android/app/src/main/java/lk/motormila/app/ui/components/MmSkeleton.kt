package lk.motormila.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import lk.motormila.app.R
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing

/**
 * Skeleton shimmer: a soft diagonal highlight sweeping across the base fill.
 * The animation value is read in the DRAW phase only (no recomposition per
 * frame). Static base fill under reduced motion. Skeletons are the only
 * infinite animation allowed by the motion rules.
 */
fun Modifier.mmShimmer(shape: Shape = MmShapes.sm): Modifier = composed {
    val c = MmColors.current
    val reduced = MmMotion.reduced
    val progress: State<Float> = if (reduced) {
        remember { mutableFloatStateOf(-1f) }
    } else {
        rememberInfiniteTransition(label = "mm-shimmer").animateFloat(
            initialValue = -1f,
            targetValue = 2f,
            animationSpec = infiniteRepeatable(tween(MmMotion.ShimmerMs, easing = LinearEasing), RepeatMode.Restart),
            label = "mm-shimmer-x",
        )
    }
    this
        .clip(shape)
        .background(c.skeletonBase)
        .drawWithCache {
            onDrawBehind {
                if (reduced) return@onDrawBehind
                val p = progress.value
                val w = size.width
                val band = w * 0.6f
                val x = p * w
                drawRect(
                    brush = Brush.linearGradient(
                        colors = listOf(c.skeletonBase, c.skeletonHighlight, c.skeletonBase),
                        start = Offset(x - band, 0f),
                        end = Offset(x, size.height),
                    ),
                )
            }
        }
}

/** Single skeleton block. */
@Composable
fun MmSkeleton(
    modifier: Modifier = Modifier,
    width: Dp? = null,
    height: Dp = 14.dp,
    shape: Shape = MmShapes.xs,
) {
    Box(
        modifier
            .then(if (width != null) Modifier.width(width) else Modifier)
            .height(height)
            .mmShimmer(shape),
    )
}

/**
 * Matches [lk.motormila.app.ui.components.ListingCard] grid/feed layout: 16:10
 * photo, two-line title, spec line, price, verdict slot, evidence, footer.
 */
@Composable
fun MmListingCardSkeleton(modifier: Modifier = Modifier) {
    val loadingCd = stringResource(R.string.v19_search_loading)
    Column(
        modifier = modifier
            .clip(MmShapes.lg)
            .background(MmColors.current.surface)
            .semantics { contentDescription = loadingCd },
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 10f).mmShimmer(MmShapes.lg))
        Column(
            Modifier.padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MmSkeleton(Modifier.fillMaxWidth(0.85f), height = 14.dp)
            MmSkeleton(Modifier.fillMaxWidth(0.6f), height = 14.dp)
            MmSkeleton(Modifier.fillMaxWidth(0.7f), height = 11.dp)
            // Price (title2) + verdict badge.
            MmSkeleton(width = 104.dp, height = 24.dp)
            MmSkeleton(width = 96.dp, height = 22.dp, shape = MmShapes.pill)
            // Typical-price anchor + market-position bar.
            MmSkeleton(Modifier.fillMaxWidth(0.55f), height = 11.dp)
            MmSkeleton(Modifier.fillMaxWidth(), height = 6.dp, shape = MmShapes.pill)
            // Footer: district + listed on / checked.
            Spacer(Modifier.height(2.dp))
            MmSkeleton(Modifier.fillMaxWidth(0.4f), height = 12.dp)
            MmSkeleton(Modifier.fillMaxWidth(0.75f), height = 11.dp)
        }
    }
}

/** Matches the list (row) layout of a listing. */
@Composable
fun MmListingRowSkeleton(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = MmSpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MmSpacing.md),
    ) {
        Box(Modifier.size(width = 112.dp, height = 84.dp).mmShimmer(MmShapes.md))
        Column(Modifier.weight(1f).padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            MmSkeleton(Modifier.fillMaxWidth(0.9f), height = 14.dp)
            MmSkeleton(width = 88.dp, height = 18.dp)
            MmSkeleton(Modifier.fillMaxWidth(0.55f), height = 11.dp)
        }
    }
}

/**
 * Matches the immersive listing detail (1.10 Showroom): the 4:3 photo runs
 * under the status bar, then the dark stage band (eyebrow, title, meta row,
 * "Asking price" + hero price, verdict pill), a hairline 3×2 spec grid and the
 * floating sticky-bar capsule at the bottom. The stage block shimmers in the
 * dark palette in both themes, like the real band.
 */
@Composable
fun MmDetailSkeleton(modifier: Modifier = Modifier) {
    val loadingCd = stringResource(R.string.v19_search_loading)
    Box(modifier.fillMaxWidth().semantics { contentDescription = loadingCd }) {
        Column(Modifier.fillMaxWidth()) {
            Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f).mmShimmer(MmShapes.xs))
            androidx.compose.runtime.CompositionLocalProvider(
                lk.motormila.app.ui.theme.LocalMmColors provides MmColors.Dark,
            ) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .background(MmColors.current.stage)
                        .padding(horizontal = MmSpacing.gutter, vertical = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    MmSkeleton(width = 180.dp, height = 11.dp)
                    MmSkeleton(Modifier.fillMaxWidth(0.85f), height = 28.dp)
                    MmSkeleton(Modifier.fillMaxWidth(0.6f), height = 12.dp)
                    Spacer(Modifier.height(6.dp))
                    MmSkeleton(width = 96.dp, height = 11.dp)
                    MmSkeleton(width = 220.dp, height = 42.dp)
                    MmSkeleton(width = 150.dp, height = 26.dp, shape = MmShapes.pill)
                }
            }
            Column(
                Modifier.padding(MmSpacing.gutter),
                verticalArrangement = Arrangement.spacedBy(1.dp),
            ) {
                // 3×2 hairline spec grid: label + value per cell.
                repeat(2) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(1.dp)) {
                        repeat(3) {
                            Column(
                                Modifier
                                    .weight(1f)
                                    .background(MmColors.current.surface)
                                    .padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                MmSkeleton(Modifier.fillMaxWidth(0.6f), height = 10.dp)
                                MmSkeleton(Modifier.fillMaxWidth(0.8f), height = 16.dp)
                            }
                        }
                    }
                }
            }
        }
        // Sticky price / "View on source" capsule placeholder.
        Box(
            Modifier
                .align(androidx.compose.ui.Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .height(64.dp)
                .mmShimmer(MmShapes.xl),
        )
    }
}
