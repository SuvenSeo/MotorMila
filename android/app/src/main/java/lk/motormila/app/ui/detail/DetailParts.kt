@file:OptIn(ExperimentalSharedTransitionApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)

package lk.motormila.app.ui.detail

import lk.motormila.app.ui.theme.liquidGlass
import androidx.activity.compose.BackHandler
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlin.math.abs
import kotlinx.coroutines.launch
import lk.motormila.app.R
import lk.motormila.app.ui.components.MmButton
import lk.motormila.app.ui.components.MmButtonSize
import lk.motormila.app.ui.components.MmDealBadge
import lk.motormila.app.ui.components.MmDealVerdict
import lk.motormila.app.ui.components.MmIconButton
import lk.motormila.app.ui.components.MmIconButtonStyle
import lk.motormila.app.ui.components.MmImage
import lk.motormila.app.ui.components.MmImagePlaceholder
import lk.motormila.app.ui.components.MmPrice
import lk.motormila.app.ui.components.MmPriceFormat
import lk.motormila.app.ui.components.MmPriceMode
import lk.motormila.app.ui.components.MmSheet
import lk.motormila.app.ui.components.label
import lk.motormila.app.ui.navigation.LocalNavAnimatedVisibilityScope
import lk.motormila.app.ui.navigation.LocalSharedTransitionScope
import lk.motormila.app.ui.navigation.listingHeroKey
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmDealTone
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.deal

// ─────────────────────────────────────────────────────────────
// Gallery: pager hero (shared element on page 0) + indicator
// ─────────────────────────────────────────────────────────────

/**
 * Edge-to-edge 4:3 photo pager. Page 0 is the shared-element target of the
 * listing card image. Indicator: a "3 / 12" counter chip plus a compact dot
 * row whose active dot stretches into a pill (width follows the scroll
 * offset, so it tracks the finger). Tap opens [onOpenViewer].
 */
@Composable
fun DetailGallery(
    images: List<String>,
    title: String,
    listingId: Int,
    onOpenViewer: (page: Int) -> Unit,
    modifier: Modifier = Modifier,
    pagerState: PagerState = rememberPagerState(pageCount = { images.size.coerceAtLeast(1) }),
    /** The card's hero URL: its decoded bitmap stands in while page 0 loads (no mid-morph flash). */
    heroPlaceholderUrl: String? = null,
) {
    val sharedScope = LocalSharedTransitionScope.current
    val animatedScope = LocalNavAnimatedVisibilityScope.current
    val heroModifier = if (sharedScope != null && animatedScope != null) {
        with(sharedScope) {
            Modifier.sharedElement(
                rememberSharedContentState(key = listingHeroKey(listingId)),
                animatedScope,
                boundsTransform = lk.motormila.app.ui.components.motormilaSharedBoundsTransform(),
            )
        }
    } else {
        Modifier
    }
    Box(
        modifier
            .fillMaxWidth()
            .aspectRatio(4f / 3f)
            .background(MmColors.current.surfaceRaised),
    ) {
        if (images.isEmpty()) {
            MmImagePlaceholder(Modifier.fillMaxSize().then(heroModifier))
            return@Box
        }
        HorizontalPager(
            state = pagerState,
            beyondViewportPageCount = 1,
            modifier = Modifier
                .fillMaxSize()
                .semantics { contentDescription = "Photos of $title, ${images.size} photos" },
        ) { page ->
            MmImage(
                url = images[page],
                placeholderKey = if (page == 0) heroPlaceholderUrl else null,
                contentDescription = "Photo ${page + 1} of $title",
                modifier = Modifier
                    .fillMaxSize()
                    .then(if (page == 0) heroModifier else Modifier)
                    .clickable { onOpenViewer(page) },
            )
        }
        // Soft bottom scrim so the indicator reads on bright photos.
        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(72.dp)
                .background(
                    androidx.compose.ui.graphics.Brush.verticalGradient(
                        listOf(Color.Transparent, Color(0x66000000)),
                    ),
                ),
        )
        if (images.size > 1) {
            GalleryDots(
                count = images.size,
                pagerState = pagerState,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 14.dp),
            )
            GalleryCounter(
                current = pagerState.currentPage + 1,
                total = images.size,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 14.dp, bottom = 10.dp),
            )
        }
    }
}

@Composable
private fun GalleryCounter(current: Int, total: Int, modifier: Modifier = Modifier) {
    Text(
        "$current / $total",
        style = MmType.current.labelS,
        color = Color.White,
        modifier = modifier
            .clip(MmShapes.pill)
            .background(Color(0x99000000))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun GalleryDots(count: Int, pagerState: PagerState, modifier: Modifier = Modifier) {
    val maxDots = 7
    val shown = count.coerceAtMost(maxDots)
    // Window the dots around the current page when there are many photos.
    val first = (pagerState.currentPage - shown / 2).coerceIn(0, (count - shown).coerceAtLeast(0))
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(shown) { slot ->
            val i = first + slot
            val distance = abs(pagerState.currentPage + pagerState.currentPageOffsetFraction - i).coerceIn(0f, 1f)
            val active = 1f - distance
            Box(
                Modifier
                    .height(6.dp)
                    .width(6.dp + 12.dp * active)
                    .clip(MmShapes.pill)
                    .background(Color.White.copy(alpha = 0.45f + 0.55f * active)),
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Full-screen zoomable viewer
// ─────────────────────────────────────────────────────────────

/**
 * Full-screen photo viewer: black ground, pager, pinch-zoom (1–4×) with pan
 * clamped to the image, double-tap to zoom 2.5× / reset (spring), swipe down
 * at 1× to dismiss (background fades with the drag). Back closes it.
 */
@Composable
fun FullScreenGallery(
    images: List<String>,
    startPage: Int,
    title: String,
    onDismiss: () -> Unit,
) {
    val pager = rememberPagerState(initialPage = startPage.coerceIn(0, (images.size - 1).coerceAtLeast(0))) { images.size }
    var dragY by remember { mutableFloatStateOf(0f) }
    val scope = rememberCoroutineScope()
    val reduced = MmMotion.reduced
    BackHandler(onBack = onDismiss)
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        val bgAlpha = (1f - abs(dragY) / 900f).coerceIn(0.3f, 1f)
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = bgAlpha)),
        ) {
            HorizontalPager(
                state = pager,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer { translationY = dragY },
            ) { page ->
                ZoomableImage(
                    url = images[page],
                    contentDescription = "Photo ${page + 1} of $title",
                    onVerticalDrag = { dy -> dragY += dy },
                    onDragEnd = {
                        if (abs(dragY) > 260f) {
                            onDismiss()
                        } else {
                            scope.launch {
                                val a = Animatable(dragY)
                                a.animateTo(0f, if (reduced) tween(0) else MmMotion.snappy()) { dragY = value }
                            }
                        }
                    },
                )
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MmIconButton(
                    icon = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.mm_close),
                    onClick = onDismiss,
                    style = MmIconButtonStyle.Glass,
                )
                Spacer(Modifier.weight(1f))
                if (images.size > 1) {
                    GalleryCounter(pager.currentPage + 1, images.size, Modifier.padding(end = 8.dp))
                }
            }
        }
    }
}

@Composable
private fun ZoomableImage(
    url: String,
    contentDescription: String,
    onVerticalDrag: (Float) -> Unit,
    onDragEnd: () -> Unit,
) {
    val scale = remember { Animatable(1f) }
    var offset by remember { androidx.compose.runtime.mutableStateOf(Offset.Zero) }
    val scope = rememberCoroutineScope()
    val reduced = MmMotion.reduced
    Box(
        Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectTapGestures(
                    onDoubleTap = { tap ->
                        scope.launch {
                            if (scale.value > 1.05f) {
                                offset = Offset.Zero
                                scale.animateTo(1f, if (reduced) tween(0) else MmMotion.snappy())
                            } else {
                                val target = 2.5f
                                val center = Offset(size.width / 2f, size.height / 2f)
                                offset = (center - tap) * (target - 1f)
                                scale.animateTo(target, if (reduced) tween(0) else MmMotion.snappy())
                            }
                        }
                    },
                )
            }
            .pointerInput(Unit) {
                awaitEachGestureCompat(
                    zoomed = { scale.value > 1.01f },
                    onTransform = { pan, zoom ->
                        val newScale = (scale.value * zoom).coerceIn(1f, 4f)
                        scope.launch { scale.snapTo(newScale) }
                        val maxX = (size.width * (newScale - 1f)) / 2f
                        val maxY = (size.height * (newScale - 1f)) / 2f
                        offset = Offset(
                            (offset.x + pan.x).coerceIn(-maxX, maxX),
                            (offset.y + pan.y).coerceIn(-maxY, maxY),
                        )
                        if (newScale <= 1.01f) offset = Offset.Zero
                    },
                    onVerticalDrag = onVerticalDrag,
                    onEnd = onDragEnd,
                )
            }
            .graphicsLayer {
                scaleX = scale.value
                scaleY = scale.value
                translationX = offset.x
                translationY = offset.y
            },
        contentAlignment = Alignment.Center,
    ) {
        MmImage(
            url = url,
            contentDescription = contentDescription,
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f),
        )
    }
}

/**
 * Gesture router: two-finger (or any gesture while zoomed) → transform;
 * single-finger mostly-vertical drag at 1× → dismiss drag; horizontal
 * single-finger drags at 1× are left unconsumed for the pager.
 */
private suspend fun androidx.compose.ui.input.pointer.PointerInputScope.awaitEachGestureCompat(
    zoomed: () -> Boolean,
    onTransform: (pan: Offset, zoom: Float) -> Unit,
    onVerticalDrag: (Float) -> Unit,
    onEnd: () -> Unit,
) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false)
        var verticalDrag = false
        var decided = false
        var totalPan = Offset.Zero
        do {
            val event = awaitPointerEvent()
            val pointers = event.changes.count { it.pressed }
            val zoom = event.calculateZoom()
            val pan = event.calculatePan()
            if (pointers >= 2 || zoomed()) {
                onTransform(pan, zoom)
                event.changes.forEach { it.consume() }
            } else {
                totalPan += pan
                if (!decided && totalPan.getDistance() > viewConfiguration.touchSlop) {
                    decided = true
                    verticalDrag = abs(totalPan.y) > abs(totalPan.x) * 1.4f
                }
                if (verticalDrag) {
                    onVerticalDrag(pan.y)
                    event.changes.forEach { it.consume() }
                }
            }
        } while (event.changes.any { it.pressed })
        if (verticalDrag) onEnd()
    }
}


// ─────────────────────────────────────────────────────────────
// Sticky bottom action bar
// ─────────────────────────────────────────────────────────────

/**
 * Sticky bottom bar on listing detail: full asking price (detail is the one
 * place full rupees are shown) + "View on <source>" primary action. Sits on
 * a translucent surface with a hairline; handles the navigation-bar inset.
 */
@Composable
fun DetailActionBar(
    priceLkr: Double?,
    sourceName: String,
    onViewSource: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    // Fixed chrome: cap Dynamic Type at 1.3x like an iOS toolbar so the price and the
    // button both fit at 200 %; the price additionally shrinks to fit (MmFitText).
    lk.motormila.app.ui.theme.CappedFontScale(max = 1.3f) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            // Floating liquid-glass capsule over the scrolling page.
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .liquidGlass(MmShapes.xl, lk.motormila.app.ui.theme.GlassWeight.Regular, elevation = 18.dp)
            .padding(start = 20.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                stringResource(R.string.mm_detail_asking),
                style = MmType.current.caption,
                color = c.textSecondary,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
            // Full rupees normally; at large text the compact "Rs 1.2 Mn"
            // (full figure is already in the page title block) so the
            // capsule never shows "Rs 1,200,0…".
            val largeText = androidx.compose.ui.platform.LocalConfiguration.current.fontScale > 1.15f
            MmPrice(
                value = priceLkr,
                mode = if (largeText) MmPriceMode.Compact else MmPriceMode.Full,
                style = MmType.current.priceM,
                fallback = stringResource(R.string.mm_price_on_request),
            )
        }
        if (onViewSource != null) {
            MmButton(
                text = stringResource(R.string.listing_view_on_source, sourceName),
                onClick = onViewSource,
                trailingIcon = Icons.AutoMirrored.Filled.OpenInNew,
                size = MmButtonSize.Medium,
            )
        }
    }
    }
}

// ─────────────────────────────────────────────────────────────
// Deal verdict row + "Why?" sheet + lease label
// ─────────────────────────────────────────────────────────────

@Composable
fun DealVerdictRow(
    verdict: MmDealVerdict,
    onWhy: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = verdict.label() ?: return
    if (verdict.kind == MmDealVerdict.Kind.LEASE) {
        LeaseTakeoverLabel(modifier)
        return
    }
    MmDealBadge(label = label, tone = verdict.tone, onWhy = onWhy, modifier = modifier)
}

/** Informational (sky-ish, not a verdict) label for lease-takeover ads. */
@Composable
fun LeaseTakeoverLabel(modifier: Modifier = Modifier) {
    val c = MmColors.current
    Row(
        modifier
            .clip(MmShapes.md)
            .background(c.brandContainer)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Outlined.Info, null, tint = c.onBrandContainer, modifier = Modifier.size(16.dp))
        Text(stringResource(R.string.mm_deal_lease), style = MmType.current.labelS, color = c.onBrandContainer)
    }
}

/**
 * Explains the verdict in plain words: asking vs typical asking price of
 * comparable listings, the gap, how many comparables, and the honesty
 * caveat (asking prices, not sale prices or "market value").
 */
@Composable
fun DealWhySheet(
    verdict: MmDealVerdict,
    askingLkr: Double?,
    typicalLkr: Double?,
    comparables: Int?,
    onDismiss: () -> Unit,
    onFullEstimate: () -> Unit,
) {
    val c = MmColors.current
    val tone = c.deal(verdict.tone)
    MmSheet(onDismissRequest = onDismiss, title = stringResource(R.string.mm_why_title)) {
        Column(Modifier.padding(horizontal = MmSpacing.gutter), verticalArrangement = Arrangement.spacedBy(MmSpacing.lg)) {
            verdict.label()?.let { MmDealBadge(label = it, tone = verdict.tone) }
            WhyCompareBars(askingLkr, typicalLkr, tone.solid)
            Text(
                stringResource(R.string.mm_why_body),
                style = MmType.current.bodyM,
                color = c.textSecondary,
            )
            if (comparables != null && comparables > 0) {
                Text(
                    stringResource(R.string.mm_why_comparables, comparables),
                    style = MmType.current.caption,
                    color = c.textTertiary,
                )
            }
            if (verdict.kind == MmDealVerdict.Kind.VERIFY) {
                Text(
                    stringResource(R.string.mm_why_verify),
                    style = MmType.current.bodyS,
                    color = c.onCaution,
                    modifier = Modifier
                        .clip(MmShapes.md)
                        .background(c.cautionContainer)
                        .padding(12.dp),
                )
            }
            MmButton(
                text = stringResource(R.string.mm_why_full_estimate),
                onClick = onFullEstimate,
                style = lk.motormila.app.ui.components.MmButtonStyle.Secondary,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun WhyCompareBars(askingLkr: Double?, typicalLkr: Double?, accent: Color) {
    if (askingLkr == null || typicalLkr == null || askingLkr <= 0 || typicalLkr <= 0) return
    val c = MmColors.current
    val max = maxOf(askingLkr, typicalLkr)
    val reduced = MmMotion.reduced
    var started by remember { androidx.compose.runtime.mutableStateOf(reduced) }
    androidx.compose.runtime.LaunchedEffect(Unit) { started = true }
    val p by animateFloatAsState(if (started) 1f else 0f, MmMotion.emphasized(MmMotion.Slow), label = "why-bars")
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        listOf(
            Triple(stringResource(R.string.mm_why_this_car), askingLkr, accent),
            Triple(stringResource(R.string.mm_why_typical), typicalLkr, c.textTertiary),
        ).forEach { (label, value, color) ->
            Column {
                Row(Modifier.fillMaxWidth()) {
                    Text(label, style = MmType.current.labelS, color = c.textSecondary, modifier = Modifier.weight(1f))
                    Text(MmPriceFormat.compact(value), style = MmType.current.numeric, color = c.textPrimary)
                }
                Spacer(Modifier.height(6.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .clip(MmShapes.pill)
                        .background(c.surfaceHigh),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth((value / max).toFloat() * p)
                            .height(8.dp)
                            .clip(MmShapes.pill)
                            .background(color),
                    )
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Before-you-pay safety card
// ─────────────────────────────────────────────────────────────

/**
 * "Before you pay" checklist. Concrete, Sri Lanka-specific steps; the
 * strongest one (never pay before seeing the car) is first. No seller
 * contact details are shown anywhere on MotorMila.
 */
@Composable
fun BeforeYouPayCard(modifier: Modifier = Modifier) {
    val c = MmColors.current
    val items = listOf(
        R.string.mm_pay_1,
        R.string.mm_pay_2,
        R.string.mm_pay_3,
        R.string.mm_pay_4,
    )
    Column(
        modifier
            .fillMaxWidth()
            .clip(MmShapes.lg)
            .background(c.surface)
            .border(1.dp, c.outline, MmShapes.lg)
            .padding(MmSpacing.cardPadding),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(32.dp)
                    .clip(MmShapes.sm)
                    .background(c.cautionContainer),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Outlined.Shield, null, tint = c.caution, modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(12.dp))
            Text(stringResource(R.string.mm_pay_title), style = MmType.current.titleS, color = c.textPrimary)
        }
        Spacer(Modifier.height(MmSpacing.md))
        items.forEachIndexed { i, res ->
            Row(Modifier.padding(vertical = 5.dp), verticalAlignment = Alignment.Top) {
                Text(
                    "${i + 1}",
                    style = MmType.current.labelS,
                    color = c.textSecondary,
                    modifier = Modifier
                        .size(20.dp)
                        .clip(MmShapes.pill)
                        .background(c.surfaceHigh)
                        .padding(top = 2.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
                Spacer(Modifier.width(10.dp))
                Text(stringResource(res), style = MmType.current.bodyS, color = c.textSecondary, overflow = TextOverflow.Clip)
            }
        }
    }
}
