package lk.motormila.app.ui.components

import lk.motormila.app.ui.theme.mmTappable
import androidx.annotation.StringRes
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

import lk.motormila.app.R
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.network.ErrorMapper
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
    val loadingDesc = stringResource(R.string.v19_skeleton_market)
    // Bento-metrics placeholder: one headline figure + a 2×2 stat grid so the
    // skeleton reads as the same layout that replaces it (no layout jump).
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(MotormilaRadius.lg)
            .background(MaterialTheme.colorScheme.surface)
            .padding(16.dp)
            .semantics { contentDescription = loadingDesc },
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
    val loadingDesc = stringResource(R.string.v19_skeleton_row)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .semantics { contentDescription = loadingDesc },
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
    val loadingDesc = stringResource(R.string.v19_skeleton_chart)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(180.dp)
            .clip(MotormilaRadius.lg)
            .shimmer(!reduced)
            .semantics { contentDescription = loadingDesc },
    )
}

/** Animated shimmer row list (motion spec §5: stable shell first, 1200ms linear sweep). */
@Composable
fun LoadingSkeletonList(
    rows: Int = 5,
    modifier: Modifier = Modifier,
) {
    val loadingDesc = stringResource(R.string.v19_skeleton_content)
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(vertical = 8.dp)
            .semantics { contentDescription = loadingDesc },
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

/**
 * Typed UI error classification (v1.9.0 P1-E). Replaces the old English
 * substring sniffing ("reach", "timed out", "Unauthorized"): the kind is
 * derived from the structured [AppError] produced by [ErrorMapper], and all
 * copy resolves from string resources at the UI edge.
 */
enum class ErrorKind { SESSION, OFFLINE, SERVER, RATE_LIMITED, NOT_FOUND, PLAN, VALIDATION, GENERIC }

/** Map a typed transport/HTTP failure to its UI kind. */
fun AppError.toErrorKind(): ErrorKind = when (this) {
    is AppError.Unauthorized -> ErrorKind.SESSION
    is AppError.Network -> ErrorKind.OFFLINE
    is AppError.Server -> ErrorKind.SERVER
    is AppError.RateLimited -> ErrorKind.RATE_LIMITED
    is AppError.NotFound -> ErrorKind.NOT_FOUND
    is AppError.Forbidden -> ErrorKind.PLAN
    is AppError.Validation -> ErrorKind.VALIDATION
    is AppError.Unknown -> ErrorKind.GENERIC
}

@StringRes
private fun ErrorKind.headingRes(): Int = when (this) {
    ErrorKind.SESSION -> R.string.v19_error_session_title
    ErrorKind.OFFLINE -> R.string.v19_error_offline_title
    ErrorKind.SERVER -> R.string.v19_error_server_title
    ErrorKind.RATE_LIMITED -> R.string.v19_error_rate_title
    ErrorKind.NOT_FOUND -> R.string.v19_error_notfound_title
    ErrorKind.PLAN -> R.string.v19_error_plan_title
    ErrorKind.VALIDATION -> R.string.v19_error_validation_title
    ErrorKind.GENERIC -> R.string.v19_error_generic_title
}

@StringRes
private fun ErrorKind.bodyRes(): Int = when (this) {
    ErrorKind.SESSION -> R.string.v19_error_session_body
    ErrorKind.OFFLINE -> R.string.v19_error_offline_body
    ErrorKind.SERVER -> R.string.v19_error_server_body
    ErrorKind.RATE_LIMITED -> R.string.v19_error_rate_body
    ErrorKind.NOT_FOUND -> R.string.v19_error_notfound_body
    ErrorKind.PLAN -> R.string.v19_error_plan_body
    ErrorKind.VALIDATION -> R.string.v19_error_validation_body
    ErrorKind.GENERIC -> R.string.v19_error_generic_body
}

/**
 * Typed error state — preferred entry point. Copy is fully localized and the
 * raw exception/backend message is never shown to the user.
 */
@Composable
fun ErrorState(
    error: AppError,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    cachedAvailable: Boolean = false,
    onShowCached: (() -> Unit)? = null,
    onLogin: (() -> Unit)? = null,
) {
    ErrorStateContent(error.toErrorKind(), onRetry, modifier, cachedAvailable, onShowCached, onLogin)
}

/**
 * Legacy string entry point — kept source-compatible for existing callers.
 * The string is classified structurally via [ErrorMapper.fromLegacyMessage]
 * (canonical mapper outputs + HTTP status codes only, no English sniffing)
 * and is NEVER rendered raw; unrecognised text gets the calm generic copy.
 */
@Composable
fun ErrorState(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    cachedAvailable: Boolean = false,
    onShowCached: (() -> Unit)? = null,
    onLogin: (() -> Unit)? = null,
) {
    ErrorState(
        error = ErrorMapper.fromLegacyMessage(message),
        onRetry = onRetry,
        modifier = modifier,
        cachedAvailable = cachedAvailable,
        onShowCached = onShowCached,
        onLogin = onLogin,
    )
}

@Composable
private fun ErrorStateContent(
    kind: ErrorKind,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    cachedAvailable: Boolean = false,
    onShowCached: (() -> Unit)? = null,
    onLogin: (() -> Unit)? = null,
) {
    val heading = stringResource(kind.headingRes())
    val body = stringResource(kind.bodyRes())
    val retryLabel = stringResource(R.string.v19_error_retry)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(32.dp)
            .semantics { contentDescription = "$heading. $body" },
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
        if (kind == ErrorKind.SESSION && onLogin != null) {
            MotormilaPrimaryButton(
                label = stringResource(R.string.v19_error_sign_in),
                onClick = onLogin,
                fillMaxWidth = false,
            )
            Spacer(Modifier.height(8.dp))
            MotormilaGhostButton(
                label = retryLabel,
                onClick = onRetry,
                fillMaxWidth = false,
            )
        } else {
            MotormilaPrimaryButton(
                label = retryLabel,
                onClick = onRetry,
                fillMaxWidth = false,
            )
        }
        if (cachedAvailable && onShowCached != null) {
            Spacer(Modifier.height(8.dp))
            MotormilaGhostButton(
                label = stringResource(R.string.v19_error_show_cached),
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
    val bannerDesc = stringResource(R.string.v19_offline_banner_desc)
    val retryDesc = stringResource(R.string.v19_offline_retry_desc)
    val dismissDesc = stringResource(R.string.v19_offline_dismiss_desc)
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
            .semantics { contentDescription = bannerDesc },
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
                contentDescription = retryDesc,
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
                    contentDescription = dismissDesc,
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
