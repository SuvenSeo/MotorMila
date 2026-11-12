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

/** Matches [lk.motormila.app.ui.components.ListingCard] grid/feed layout. */
@Composable
fun MmListingCardSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(MmShapes.lg)
            .background(MmColors.current.surface)
            .semantics { contentDescription = "Loading" },
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f).mmShimmer(MmShapes.lg))
        Column(Modifier.padding(MmSpacing.md), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            MmSkeleton(Modifier.fillMaxWidth(0.85f), height = 14.dp)
            MmSkeleton(width = 92.dp, height = 20.dp)
            MmSkeleton(Modifier.fillMaxWidth(0.6f), height = 11.dp)
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

/** Matches the listing detail layout (hero, title, price, spec grid). */
@Composable
fun MmDetailSkeleton(modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f).mmShimmer(MmShapes.xs))
        Column(Modifier.padding(MmSpacing.gutter), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            MmSkeleton(width = 96.dp, height = 22.dp, shape = MmShapes.pill)
            MmSkeleton(Modifier.fillMaxWidth(0.8f), height = 24.dp)
            MmSkeleton(width = 180.dp, height = 32.dp)
            Spacer(Modifier.height(8.dp))
            repeat(2) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    repeat(3) { MmSkeleton(Modifier.weight(1f), height = 56.dp, shape = MmShapes.md) }
                }
            }
            Spacer(Modifier.height(8.dp))
            MmSkeleton(Modifier.fillMaxWidth(), height = 160.dp, shape = MmShapes.lg)
        }
    }
}
