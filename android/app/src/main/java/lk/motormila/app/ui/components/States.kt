package lk.motormila.app.ui.components

import lk.motormila.app.ui.theme.mmTappable
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import lk.motormila.app.ui.theme.MotionTokens
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.ReduceMotion
import lk.motormila.app.ui.theme.SHIMMER_MS
import lk.motormila.app.ui.theme.MotormilaOnSurface

/** Shimmer modifier: SHIMMER_MS sweep; static fill when reduced motion. */
fun Modifier.shimmer(enabled: Boolean = true): Modifier = composed {
    if (!enabled) {
        return@composed this.background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
    }
    val transition = rememberInfiniteTransition(label = "shimmer")
    val offset by transition.animateFloat(
        initialValue = -1f,
        targetValue = 2f,
        animationSpec = infiniteRepeatable(tween(SHIMMER_MS, easing = LinearEasing), RepeatMode.Restart),
        label = "shimmer-x",
    )
    var size = androidx.compose.runtime.remember { IntSize.Zero }
    this
        .onGloballyPositioned { size = it.size }
        .background(
            Brush.linearGradient(
                colors = listOf(
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f),
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                ),
                start = Offset(size.width * offset, 0f),
                end = Offset(size.width * (offset + 0.35f), size.height.toFloat()),
            ),
        )
}

@Composable
fun LoadingSkeletonCard(modifier: Modifier = Modifier) {
    val reduced = rememberReducedMotion()
    // Bento-metrics placeholder: one headline figure + a 2×2 stat grid so the
    // skeleton reads as the same layout that replaces it (no layout jump).
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(MotormilaRadius.lg)
            .background(MaterialTheme.colorScheme.surface)
            .padding(16.dp)
            .semantics { contentDescription = "Loading market stats" },
    ) {
        Box(Modifier.width(140.dp).height(14.dp).clip(MotormilaRadius.pill).shimmer(!reduced))
        Spacer(Modifier.height(10.dp))
        Box(Modifier.width(200.dp).height(34.dp).clip(MotormilaRadius.xs).shimmer(!reduced))
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            repeat(4) {
                Column(
                    Modifier
                        .weight(1f)
                        .clip(MotormilaRadius.sm)
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                        .padding(10.dp),
                ) {
                    Box(Modifier.fillMaxWidth().height(12.dp).clip(MotormilaRadius.pill).shimmer(!reduced))
                    Spacer(Modifier.height(6.dp))
                    Box(Modifier.width(28.dp).height(12.dp).clip(MotormilaRadius.pill).shimmer(!reduced))
                }
            }
        }
    }
}

@Composable
fun LoadingSkeletonRow(modifier: Modifier = Modifier) {
    val reduced = rememberReducedMotion()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .semantics { contentDescription = "Loading row" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(56.dp).clip(MotormilaRadius.lg).shimmer(!reduced))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Box(Modifier.width(160.dp).height(14.dp).clip(MotormilaRadius.pill).shimmer(!reduced))
            Spacer(Modifier.height(6.dp))
            Box(Modifier.width(100.dp).height(12.dp).clip(MotormilaRadius.pill).shimmer(!reduced))
        }
    }
}

@Composable
fun LoadingSkeletonChart(modifier: Modifier = Modifier) {
    val reduced = rememberReducedMotion()
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(180.dp)
            .clip(MotormilaRadius.lg)
            .shimmer(!reduced)
            .semantics { contentDescription = "Loading chart" },
    )
}

/** Animated shimmer row list (motion spec §5: stable shell first, 1200ms linear sweep). */
@Composable
fun LoadingSkeletonList(
    rows: Int = 5,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(vertical = 8.dp)
            .semantics { contentDescription = "Loading content" },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        repeat(rows) { LoadingSkeletonRow() }
    }
}

/**
 * Stagger delay for cascade entrances: 45ms steps, capped at the 700ms
 * entrance window (motion spec §5 — late cards just appear).
 */
fun cascadeDelay(index: Int): Int =
    (index * MotionTokens.StaggerStepMs).coerceAtMost(MotionTokens.EntranceWindowMs)

/**
 * Staggered card entrance: fadeIn + 24dp rise on [MotionTokens.entrance()],
 * delayed by [cascadeDelay]. Snaps to visible when reduced motion is on
 * (entrances collapse to the surrounding Crossfade instead).
 */
fun Modifier.cascadeEntrance(index: Int): Modifier = composed {
    val reduce = ReduceMotion.current
    val delay = cascadeDelay(index)
    val progress = remember { Animatable(if (reduce) 1f else 0f) }
    LaunchedEffect(index, reduce) {
        if (reduce) {
            progress.snapTo(1f)
            return@LaunchedEffect
        }
        progress.animateTo(
            1f,
            animationSpec = tween(
                durationMillis = 300,
                delayMillis = delay,
                easing = CubicBezierEasing(0.2f, 0f, 0f, 1f),
            ),
        )
    }
    val t = progress.value
    this
        .alpha(t)
        .offset(y = ((1f - t) * MotionTokens.EntranceRiseDp).dp)
}

@Composable
fun EmptyState(
    title: String,
    body: String,
    ctaLabel: String? = null,
    onCta: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    icon: ImageVector = Icons.Filled.SearchOff,
    graphic: @Composable (() -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (graphic != null) {
            graphic()
        } else {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(56.dp))
        }
        Spacer(Modifier.height(12.dp))
        Text(
            title,
            fontWeight = FontWeight.SemiBold,
            fontSize = 16.sp,
            color = MotormilaOnSurface,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(4.dp))
        Text(body, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        if (ctaLabel != null && onCta != null) {
            Spacer(Modifier.height(16.dp))
            MotormilaPrimaryButton(
                label = ctaLabel,
                onClick = onCta,
                fillMaxWidth = false,
            )
        }
    }
}

@Composable
fun ErrorState(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    cachedAvailable: Boolean = false,
    onShowCached: (() -> Unit)? = null,
    onLogin: (() -> Unit)? = null,
) {
    val isAuthError = message.contains("401", ignoreCase = true) ||
        message.contains("Unauthorized", ignoreCase = true) ||
        message.contains("Authentication", ignoreCase = true)
    // Server fault (5xx / reachability) reads very differently from a client
    // auth problem — give the user a calm, accurate message instead of a raw
    // exception string.
    val isServerError = message.contains("500", ignoreCase = true) ||
        message.contains("502", ignoreCase = true) ||
        message.contains("503", ignoreCase = true) ||
        message.contains("reach", ignoreCase = true) ||
        message.contains("Taking too long", ignoreCase = true) ||
        message.contains("timed out", ignoreCase = true) ||
        message.contains("Couldn't refresh", ignoreCase = true)

    val heading = when {
        isAuthError -> "Session Required"
        isServerError -> "Motormila is unreachable"
        else -> "Something went wrong"
    }
    val body = when {
        isAuthError -> "Sign in with your Motormila account to browse vehicle intelligence and market data."
        isServerError -> "The Motormila service isn't responding right now. It may be waking up or briefly down — try again in a moment."
        else -> message
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Filled.Refresh, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(12.dp))
        Text(heading, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        Spacer(Modifier.height(4.dp))
        Text(body,
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        if (isAuthError && onLogin != null) {
            MotormilaPrimaryButton(
                label = "Sign in to Motormila",
                onClick = onLogin,
                fillMaxWidth = false,
            )
            Spacer(Modifier.height(8.dp))
            MotormilaGhostButton(
                label = "Retry",
                onClick = onRetry,
                fillMaxWidth = false,
            )
        } else {
            MotormilaPrimaryButton(
                label = "Retry",
                onClick = onRetry,
                fillMaxWidth = false,
            )
        }
        if (cachedAvailable && onShowCached != null) {
            Spacer(Modifier.height(8.dp))
            MotormilaGhostButton(
                label = "Show cached results",
                onClick = onShowCached,
                fillMaxWidth = false,
            )
        }
    }
}

/** Slide-down offline banner; static when reduced motion (no slide animation).
 * Tapping the banner (outside the dismiss button) retries the load. */
@Composable
fun OfflineBanner(
    visible: Boolean,
    modifier: Modifier = Modifier,
    onDismiss: (() -> Unit)? = null,
    onRetry: (() -> Unit)? = null,
    text: String? = null,
) {
    if (!visible) return
    lk.motormila.app.ui.theme.CappedFontScale(max = 1.3f) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            // Rounded rect, not a stadium: a 2-line banner in a pill looked like a blob.
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.secondaryContainer)
            .then(if (onRetry != null) Modifier.mmTappable(role = androidx.compose.ui.semantics.Role.Button, pressedScale = 1f) { onRetry() } else Modifier)
            .padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp)
            .semantics { contentDescription = "Offline, showing cached data. Tap to retry." },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.WifiOff, contentDescription = null, tint = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(
            text ?: stringResource(lk.motormila.app.R.string.offline_cached_data),
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSecondaryContainer,
            maxLines = 2,
            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (onRetry != null) {
            Icon(
                Icons.Filled.Refresh,
                contentDescription = "Retry",
                tint = MaterialTheme.colorScheme.onSecondaryContainer,
                modifier = Modifier
                    .padding(end = 8.dp)
                    .size(18.dp),
            )
        }
        if (onDismiss != null) {
            IconButton(
                onClick = onDismiss,
                modifier = Modifier.size(48.dp),
            ) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = "Dismiss offline notice",
                    tint = MaterialTheme.colorScheme.onSecondaryContainer,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}
}

/** Pulsing live dot; static dot when reduced motion. */
@Composable
fun LivePulse(modifier: Modifier = Modifier) {
    // Static dot: motion rules allow no infinite animation except skeletons
    // (low-end devices / battery). The colour alone says "live".
    val color = MaterialTheme.colorScheme.tertiary
    Box(modifier.size(8.dp).background(color, CircleShape))
}
