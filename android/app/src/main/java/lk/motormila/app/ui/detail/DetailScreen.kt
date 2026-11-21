@file:OptIn(ExperimentalSharedTransitionApi::class)

package lk.motormila.app.ui.detail

import android.content.Context
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.animateDp
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.LocalGasStation
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.roundToInt
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.price.PriceVerdict
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PriceHistory
import lk.motormila.app.domain.model.SellerProfile
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.ListingImage
import lk.motormila.app.ui.components.MmDetailSkeleton
import lk.motormila.app.ui.components.MmPriceChart
import lk.motormila.app.ui.components.MmPriceFormat
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.components.confidenceWord
import lk.motormila.app.ui.components.detail
import lk.motormila.app.ui.components.fitWidth
import lk.motormila.app.ui.components.headline
import lk.motormila.app.ui.components.listingCardKey
import lk.motormila.app.ui.components.listingPriceKey
import lk.motormila.app.ui.components.motormilaSharedBoundsTransform
import lk.motormila.app.ui.navigation.LocalNavAnimatedVisibilityScope
import lk.motormila.app.ui.navigation.LocalSharedTransitionScope
import lk.motormila.app.ui.share.FmvShare
import lk.motormila.app.ui.share.OutboundLinks
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.MotormilaGood
import lk.motormila.app.ui.theme.MotormilaGoodContainer
import lk.motormila.app.ui.theme.MotormilaGoodText
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaPrimaryGlow
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurface as MotormilaSurfaceColor
import lk.motormila.app.ui.theme.MotormilaSurfaceHigh
import lk.motormila.app.ui.theme.MotormilaSurfaceHighest
import lk.motormila.app.ui.theme.MotormilaWarn
import lk.motormila.app.ui.theme.MotormilaWarnContainer
import lk.motormila.app.ui.theme.glassBackdrop
import lk.motormila.app.ui.theme.tabular

/** Buyer decision: the asking price, comparison evidence, recorded movement and original ad. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListingDetailScreen(
    listingId: Int,
    onBack: () -> Unit,
    onCompare: (List<Int>) -> Unit,
    onEstimate: () -> Unit,
    viewModel: DetailViewModel = hiltViewModel(),
    /** Opened by tapping a listing card: the whole page is a container transform of that card. */
    fromCard: Boolean = false,
    /** Opens another listing as a new back-stack entry (Similar rail), so Back returns here. */
    onOpenListing: ((Int) -> Unit)? = null,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var viewerPage by remember(state.listing?.id) { mutableStateOf<Int?>(null) }
    val mmHaptics = lk.motormila.app.ui.theme.MmHaptics.current
    // Watchlist toggle failures surface as a snackbar (one-shot state from the VM).
    val snackbarHostState = remember { SnackbarHostState() }
    val watchFailedMsg = stringResource(R.string.mm_detail_watch_failed)
    LaunchedEffect(state.watchError) {
        if (state.watchError != null) {
            snackbarHostState.showSnackbar(watchFailedMsg)
            viewModel.clearWatchError()
        }
    }
    val priceVerdict = remember(state.listing, state.fmv, state.fmvState) {
        state.listing?.let { buyerVerdict(it, state.fmv.takeIf { state.fmvState == DetailLoadState.LOADED }) }
    }

    LaunchedEffect(listingId) {
        if (listingId > 0) {
            viewModel.load(listingId)
        }
    }

    // Immersive detail: the photo runs under the status bar; floating glass
    // buttons ride on it and a glass title bar fades in once it scrolls away.
    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    val detailBackdrop = remember { dev.chrisbanes.haze.HazeState() }
    val stretch = rememberDetailStretch()
    val galleryIndex = if (state.isOffline) 1 else 0
    val density = androidx.compose.ui.platform.LocalDensity.current
    val screenW = androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp.dp
    val statusTop = androidx.compose.foundation.layout.WindowInsets.statusBars
        .asPaddingValues().calculateTopPadding()
    val galleryHeightPx = with(density) { screenW.toPx() } * 0.75f
    val topBarPx = with(density) { (statusTop + 56.dp).toPx() }
    val collapse: () -> Float = {
        when {
            state.listing == null -> 1f
            listState.firstVisibleItemIndex > galleryIndex -> 1f
            listState.firstVisibleItemIndex < galleryIndex -> 0f
            else -> ((listState.firstVisibleItemScrollOffset - (galleryHeightPx - topBarPx * 1.6f)) / (topBarPx * 0.6f)).coerceIn(0f, 1f)
        }
    }
    DetailStatusBarIcons(overPhoto = { state.listing != null && collapse() < 0.5f })
    Box(
        Modifier
            .fillMaxSize()
            .then(detailContainerTransform(listingId, fromCard))
            .background(lk.motormila.app.ui.theme.MmColors.current.background)
            .nestedScroll(stretch.connection),
    ) {
        run {
            when {
                state.isLoading && state.listing == null -> {
                    Box(Modifier.padding(top = statusTop + 56.dp)) { MmDetailSkeleton() }
                }
                state.notFound -> {
                    // 404/NotFound: the listing is gone — say so plainly and offer
                    // the way back, never a generic error with a futile Retry.
                    EmptyState(
                        title = stringResource(R.string.mm_detail_gone_title),
                        body = stringResource(R.string.mm_detail_gone_body),
                        ctaLabel = stringResource(R.string.buyer_back),
                        onCta = onBack,
                        modifier = Modifier.fillMaxSize().padding(top = statusTop + 56.dp),
                    )
                }
                state.listing == null -> {
                    ErrorState(
                        message = state.error ?: stringResource(R.string.mm_detail_load_failed),
                        onRetry = viewModel::retry,
                        cachedAvailable = false,
                        modifier = Modifier.fillMaxSize().padding(top = statusTop + 56.dp),
                    )
                }
                else -> {
                    val listing = state.listing!!
                    val galleryImages = listing.images.ifEmpty { listOfNotNull(listing.thumbnailUrl) }
                    val sourceUrl = listOfNotNull(listing.externalUrl, listing.detailUrl)
                        .map { it.trim() }.firstOrNull(OutboundLinks::isAllowed)
                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .fillMaxSize()
                            .glassBackdrop(detailBackdrop)
                            // Pull-down past the top slides the page down; the photo zooms to fill.
                            .graphicsLayer { translationY = stretch.offset },
                        contentPadding = PaddingValues(bottom = 32.dp + androidx.compose.foundation.layout.WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        if (state.isOffline) {
                            // isOffline is set only for genuine network errors; tapping
                            // the banner retries the load.
                            item {
                                OfflineBanner(
                                    visible = true,
                                    onRetry = viewModel::retry,
                                    modifier = Modifier.padding(top = statusTop + 56.dp),
                                )
                            }
                        }
                        item {
                            DetailGallery(
                                images = galleryImages,
                                title = listing.displayName,
                                listingId = listing.id,
                                heroPlaceholderUrl = remember(listing.id) {
                                    lk.motormila.app.ui.navigation.ListingPreviewCache.get(listing.id)?.heroImageUrl
                                } ?: listing.heroImageUrl,
                                onOpenViewer = { page -> viewerPage = page },
                                // Signature header motion: parallax (photo scrolls at
                                // ~55 % speed under the content) + rubber-band zoom on
                                // over-pull. Graphics layer only.
                                modifier = Modifier.graphicsLayer {
                                    val st = stretch.offset
                                    if (st > 0f && size.height > 0f) {
                                        val sc = (size.height + st) / size.height
                                        scaleX = sc
                                        scaleY = sc
                                        transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0.5f, 1f)
                                    } else if (listState.firstVisibleItemIndex == galleryIndex) {
                                        translationY = listState.firstVisibleItemScrollOffset * 0.45f
                                    }
                                },
                            )
                        }
                        item(key = "decision-${listing.id}") {
                            Column(Modifier.padding(horizontal = MmSpacing.gutter), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                PriceDealSection(listing)
                                when {
                                    priceVerdict != null -> {
                                        Text(priceVerdict.headline(), style = MmType.current.titleS, color = MmColors.current.textPrimary)
                                        ExpandableToolRow(stringResource(R.string.buyer_comparison_evidence)) {
                                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                                if (priceVerdict is PriceVerdict.Withheld) {
                                                    Text(priceVerdict.detail(), style = MmType.current.bodyS)
                                                } else if (priceVerdict is PriceVerdict.Ok) {
                                                    Text(stringResource(R.string.v19_search_typical_price, LkrFormat.full(priceVerdict.referenceLkr)))
                                                    Text(stringResource(R.string.mm_why_body), style = MmType.current.bodyS)
                                                    if (priceVerdict.verifyFirst) Text(stringResource(R.string.mm_why_verify), style = MmType.current.bodyS)
                                                }
                                                state.fmv?.takeIf { it.sampleCount > 0 && it.confidence.lowercase() in setOf("low", "medium", "high") }?.let { fmv ->
                                                    Text(stringResource(R.string.mm_fmv_explain_sample, fmv.sampleCount, confidenceWord(fmv.confidence)), style = MmType.current.caption)
                                                }
                                            }
                                        }
                                    }
                                    state.fmvState == DetailLoadState.FAILED -> InlineRetryRow(stringResource(R.string.mm_detail_fmv_failed), viewModel::retryFmv)
                                    (state.isLoading || state.fmvState == DetailLoadState.LOADING) && state.error == null ->
                                        Text(stringResource(R.string.buyer_comparison_loading), style = MmType.current.bodyS)
                                    else -> Text(stringResource(R.string.buyer_no_comparison), style = MmType.current.bodyS)
                                }
                                val change = remember(listing.id, state.history) { recentAskChange(listing.id, state.history) }
                                if (change != null) {
                                    Text(stringResource(R.string.buyer_last_change, LkrFormat.full(change.from), LkrFormat.full(change.to)), style = MmType.current.bodyM)
                                    observationDate(change.at)?.let { Text(it, style = MmType.current.caption, color = MmColors.current.textSecondary) }
                                }
                                DetailActionBar(listing.priceLkr, sourceDisplayName(listing.source),
                                    onViewSource = sourceUrl?.takeIf { listing.isActive }?.let { url -> { openUrl(context, url) } })
                            }
                        }
                        item {
                            BentoSpecsGrid(
                                listing = listing,
                                modifier = Modifier.padding(horizontal = MmSpacing.gutter),
                            )
                        }
                        val leasePrice = leaseExamplePrice(listing)
                        if (leasePrice != null) {
                            item(key = "lease-${listing.id}") {
                                ExpandableToolRow(stringResource(R.string.mm_detail_estimate_monthly), Modifier.padding(horizontal = MmSpacing.gutter)) {
                                    LeasePaymentCalculator(leasePrice)
                                }
                            }
                        }
                        item {
                            HistorySection(
                                // Guard against stale history from an in-place similar swap.
                                history = state.history?.takeIf { it.listingId == listing.id },
                                report = state.report,
                                historyState = state.historyState,
                                onRetryHistory = viewModel::retryHistory,
                                // Typical line only when the verdict stands (never a withheld estimate).
                                fmvLkr = (priceVerdict as? lk.motormila.app.core.price.PriceVerdict.Ok)?.referenceLkr,
                                modifier = Modifier.padding(horizontal = MmSpacing.gutter),
                            )
                        }
                        item {
                            SellerCard(
                                seller = state.seller,
                                sellerState = state.sellerState,
                                onRetrySeller = viewModel::retrySeller,
                                sourceName = sourceDisplayName(listing.source),
                                modifier = Modifier.padding(horizontal = MmSpacing.gutter),
                            )
                        }
                        item {
                            BeforeYouPayCard(Modifier.padding(horizontal = MmSpacing.gutter))
                        }
                        item {
                            Column(Modifier.padding(horizontal = MmSpacing.gutter), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                MotormilaGhostButton(label = stringResource(R.string.mm_deep_estimate), onClick = onEstimate)
                                val place = listOfNotNull(listing.city, listing.district).filter { it.isNotBlank() }.distinct().joinToString(", ")
                                if (place.isNotEmpty()) MotormilaGhostButton(label = stringResource(R.string.mm_deep_map), onClick = {
                                    openUrl(context, "https://www.openstreetmap.org/search?query=${android.net.Uri.encode(place)}")
                                })
                            }
                        }
                        if (state.similar.isNotEmpty()) {
                            item {
                                Text(
                                    stringResource(R.string.mm_detail_similar),
                                    style = MmType.current.titleS,
                                    color = MmColors.current.textPrimary,
                                    modifier = Modifier.padding(horizontal = MmSpacing.gutter),
                                )
                                Spacer(Modifier.height(8.dp))
                                androidx.compose.foundation.layout.BoxWithConstraints {
                                    val cardWidth = if (maxWidth <= 480.dp) 180.dp else (maxWidth * 0.32f).coerceAtMost(280.dp)
                                    LazyRow(
                                        contentPadding = PaddingValues(horizontal = MmSpacing.gutter),
                                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    ) {
                                    items(state.similar, key = { it.id }) { s ->
                                        SimilarMiniCard(
                                            width = cardWidth,
                                            title = s.displayName,
                                            imageUrl = s.heroImageUrl,
                                            price = MmPriceFormat.compact(s.priceLkr?.takeIf { it.isFinite() }, stringResource(R.string.mm_price_on_request)),
                                            // Push a new Detail entry so Back returns to this listing;
                                            // without a navigator, swap the content in place.
                                            onClick = {
                                                lk.motormila.app.ui.navigation.ListingPreviewCache.put(s)
                                                onOpenListing?.invoke(s.id) ?: viewModel.load(s.id)
                                            },
                                        )
                                    }
                                    }
                                }
                                MotormilaGhostButton(
                                    label = stringResource(R.string.mm_detail_compare_similar),
                                    onClick = {
                                        // The listing on screen (may differ from the route id after an in-place swap).
                                        val shownId = state.listing?.id ?: listingId
                                        onCompare((listOf(shownId) + state.similar.map { it.id }.filter { it != shownId }.take(2)))
                                    },
                                    modifier = Modifier.padding(horizontal = MmSpacing.gutter, vertical = 8.dp),
                                )
                            }
                        }
                        if (state.similar.isEmpty() && state.similarState == DetailLoadState.FAILED) {
                            item {
                                InlineRetryRow(
                                    text = stringResource(R.string.mm_detail_similar_failed),
                                    onRetry = viewModel::retrySimilar,
                                    modifier = Modifier.padding(horizontal = MmSpacing.gutter),
                                )
                            }
                        }
                    }
                }
            }
        }
        val listingNow = state.listing.takeUnless { state.notFound }
        androidx.compose.runtime.CompositionLocalProvider(
            lk.motormila.app.ui.theme.LocalGlassEnv provides lk.motormila.app.ui.theme.LocalGlassEnv.current.copy(backdrop = detailBackdrop),
        ) {
            val shareText = listingNow?.let { listing ->
                val ask = MmPriceFormat.full(listing.priceLkr?.takeIf { it.isFinite() }, stringResource(R.string.mm_price_on_request))
                listOfNotNull(listing.displayName, "${stringResource(R.string.mm_detail_asking)}: $ask", priceVerdict?.headline(),
                    FmvShare.listingShareUrl(listing.id)).joinToString("\n")
            }
            DetailTopChrome(
                title = listingNow?.displayName ?: "",
                showListingActions = listingNow != null,
                collapse = collapse,
                backdrop = detailBackdrop,
                onBack = onBack,
                saved = state.isWatched,
                onToggleSave = {
                    if (state.isWatched) mmHaptics.unsave() else mmHaptics.save()
                    viewModel.toggleWatch()
                },
                onShare = { shareText?.let { shareListing(context, it) } },
                modifier = Modifier.align(Alignment.TopStart),
            )
        }
        // Watchlist-toggle failure snackbar.
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding().padding(16.dp),
        )
    }

    val viewerListing = state.listing
    if (viewerPage != null && viewerListing != null) {
        val imgs = viewerListing.images.ifEmpty { listOfNotNull(viewerListing.thumbnailUrl) }
        if (imgs.isNotEmpty()) {
            FullScreenGallery(
                images = imgs,
                startPage = viewerPage ?: 0,
                title = viewerListing.displayName,
                onDismiss = { viewerPage = null },
            )
        }
    }

}

/**
 * Card → Detail container transform: the whole page grows out of the tapped
 * card (same spring as the photo / title / price inside it) with its corners
 * easing from the card's 24 dp to square, and shrinks back into the card on
 * back — including the predictive-back gesture, which seeks this same
 * transition. Only when opened from a card; deep links use the push slide.
 */
@Composable
private fun detailContainerTransform(listingId: Int, fromCard: Boolean): Modifier {
    if (!fromCard) return Modifier
    val sharedScope = LocalSharedTransitionScope.current ?: return Modifier
    val animatedScope = LocalNavAnimatedVisibilityScope.current ?: return Modifier
    val corner = animatedScope.transition.animateDp(
        transitionSpec = { lk.motormila.app.ui.theme.MmMotion.containerSpringDp() },
        label = "detail-corner",
    ) { state -> if (state == androidx.compose.animation.EnterExitState.Visible) 0.dp else 24.dp }
    // Read at draw time (overlay clip), so the animating radius never recomposes.
    val shape = remember(corner) {
        object : androidx.compose.ui.graphics.Shape {
            override fun createOutline(
                size: androidx.compose.ui.geometry.Size,
                layoutDirection: androidx.compose.ui.unit.LayoutDirection,
                density: androidx.compose.ui.unit.Density,
            ): androidx.compose.ui.graphics.Outline {
                val r = with(density) { corner.value.toPx() }
                return androidx.compose.ui.graphics.Outline.Rounded(
                    androidx.compose.ui.geometry.RoundRect(
                        0f, 0f, size.width, size.height,
                        androidx.compose.ui.geometry.CornerRadius(r, r),
                    ),
                )
            }
        }
    }
    return with(sharedScope) {
        Modifier.sharedBounds(
            rememberSharedContentState(key = listingCardKey(listingId)),
            animatedScope,
            enter = fadeIn(tween(lk.motormila.app.ui.theme.MmMotion.Base, easing = lk.motormila.app.ui.theme.MmMotion.Standard)),
            exit = fadeOut(tween(lk.motormila.app.ui.theme.MmMotion.Fast, easing = lk.motormila.app.ui.theme.MmMotion.Exit)),
            boundsTransform = motormilaSharedBoundsTransform(),
            resizeMode = SharedTransitionScope.ResizeMode.ScaleToBounds(
                androidx.compose.ui.layout.ContentScale.FillWidth,
                Alignment.TopCenter,
            ),
            clipInOverlayDuringTransition = OverlayClip(shape),
        )
    }
}

@Composable
internal fun PriceDealSection(
    listing: Listing,
    isPro: Boolean = false,
    onDealShown: () -> Unit = {},
    history: PriceHistory? = null,
    verdict: lk.motormila.app.core.price.PriceVerdict? = null,
) {
    LaunchedEffect(listing.id) { onDealShown() }
    // The card container key (listingCardKey) lives ONLY on the Detail root
    // (detailContainerTransform). A second sharedBounds with the same key here
    // made Compose pair the root against this section: the whole page was
    // ScaleToBounds-squeezed into this band and stayed there after settling.
    val sharedScope = LocalSharedTransitionScope.current
    val animatedScope = LocalNavAnimatedVisibilityScope.current
    Column(
        Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        val titleShared = if (sharedScope != null && animatedScope != null) {
            with(sharedScope) {
                Modifier.sharedBounds(
                    rememberSharedContentState(key = lk.motormila.app.ui.components.listingTitleKey(listing.id)),
                    animatedScope,
                    boundsTransform = motormilaSharedBoundsTransform(),
                )
            }
        } else {
            Modifier
        }
        Text(
            listing.displayName,
            style = MmType.current.titleM,
            color = MmColors.current.textPrimary,
            modifier = titleShared,
        )
        val place = listOfNotNull(listing.city, listing.district).filter { it.isNotBlank() }.distinct().joinToString(", ")
        if (place.isNotEmpty()) Text(place, style = MmType.current.bodyS, color = MmColors.current.textSecondary)
        Text(stringResource(R.string.mm_detail_asking), style = MmType.current.labelS, color = MmColors.current.textSecondary)
        val priceShared = if (sharedScope != null && animatedScope != null) with(sharedScope) {
            Modifier.sharedBounds(rememberSharedContentState(key = listingPriceKey(listing.id)), animatedScope,
                boundsTransform = motormilaSharedBoundsTransform(), resizeMode = lk.motormila.app.ui.components.PriceMorphResize)
        } else Modifier
        val fallback = stringResource(R.string.mm_price_on_request)
        lk.motormila.app.ui.components.MmFitText(
            text = MmPriceFormat.full(listing.priceLkr?.takeIf { it.isFinite() }, fallback),
            style = MmType.current.priceL, color = MmColors.current.textPrimary, modifier = priceShared,
        )
    }
}

/** Human source name for attribution ("ikman", "Riyasewana"); generic fallback. */
@Composable
private fun sourceDisplayName(source: String?): String =
    source?.trim()?.takeIf { it.isNotEmpty() }?.replaceFirstChar { it.uppercase() }
        ?: stringResource(R.string.listing_source_fallback)

/** Legacy entry (previews): the verdict from the two numbers alone. */
@Composable
internal fun DealLadder(askingLkr: Double?, fmvLkr: Double?, modifier: Modifier = Modifier) {
    val v = lk.motormila.app.core.price.PriceVerdicts.verdict(askingLkr, fmvLkr) as? lk.motormila.app.core.price.PriceVerdict.Ok ?: return
    DealLadder(verdict = v, askingLkr = askingLkr, modifier = modifier)
}

/**
 * Deal ladder on the verdict bands: 5 %+ below typical · typical · 8 %+ above.
 * The highlighted rung is the verdict's band, so it always agrees with the
 * badge and gauge. Only drawn for an ok verdict.
 */
@Composable
internal fun DealLadder(
    verdict: lk.motormila.app.core.price.PriceVerdict.Ok,
    askingLkr: Double?,
    modifier: Modifier = Modifier,
) {
    if (askingLkr == null) return
    val ref = verdict.referenceLkr
    val belowPct = lk.motormila.app.core.price.PriceVerdicts.BELOW_PCT
    val abovePct = lk.motormila.app.core.price.PriceVerdicts.ABOVE_PCT
    MotormilaSurface(modifier = modifier) {
        Text(
            stringResource(R.string.mm_deal_ladder),
            fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.bodyMedium,
            color = MotormilaOnSurface,
        )
        Spacer(Modifier.height(8.dp))
        LadderRung(
            stringResource(R.string.mm_ladder_below, belowPct.toInt()),
            ref * (1 - belowPct / 100.0),
            verdict.band == lk.motormila.app.core.price.VerdictBand.BELOW,
        )
        LadderRung(stringResource(R.string.mm_ladder_typical), ref, verdict.band == lk.motormila.app.core.price.VerdictBand.FAIR)
        LadderRung(
            stringResource(R.string.mm_ladder_above, abovePct.toInt()),
            ref * (1 + abovePct / 100.0),
            verdict.band == lk.motormila.app.core.price.VerdictBand.ABOVE,
        )
    }
}

@Composable
private fun LadderRung(label: String, value: Double, active: Boolean) {
    val yourRange = stringResource(R.string.mm_ladder_your_range)
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .semantics { contentDescription = "$label ${LkrFormat.full(value)}${if (active) yourRange else ""}" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
        )
        Spacer(Modifier.width(8.dp))
        // FlowRow: at 200 % the unweighted price took the row and crushed the
        // label to 3 chars per line (ta) or butted against it ("Great buyRs 106…").
        // Now the price drops under the label when both don't fit.
        @OptIn(ExperimentalLayoutApi::class)
        FlowRow(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelLarge,
                color = MotormilaOnSurface,
                modifier = Modifier.weight(1f),
            )
            Text(
                LkrFormat.full(value),
                style = (MaterialTheme.typography.labelLarge).tabular(),
                fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                maxLines = 1,
                softWrap = false,
                modifier = Modifier.fitWidth(),
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 1. 2x3 Bento Specifications Grid
// ─────────────────────────────────────────────────────────────

private data class BentoSpecItem(
    val label: String,
    val value: String,
    val icon: ImageVector,
)

@Composable
internal fun BentoSpecsGrid(listing: Listing, modifier: Modifier = Modifier) {
    val numberFormatter = remember { NumberFormat.getIntegerInstance(Locale.US) }
    val unknown = stringResource(R.string.mm_spec_unknown)

    val yearVal = listing.year?.toString() ?: unknown
    val mileageVal = if (listing.mileageKm != null && listing.mileageKm > 0) {
        stringResource(R.string.mm_spec_km, numberFormatter.format(listing.mileageKm.toLong()))
    } else {
        unknown
    }
    val transVal = listing.transmission
        ?.replaceFirstChar { it.uppercase() }
        ?.replace("_", " ")
        ?.ifBlank { unknown } ?: unknown
    val fuelVal = listing.fuelType
        ?.replaceFirstChar { it.uppercase() }
        ?.replace("_", " ")
        ?.ifBlank { unknown } ?: unknown
    val condVal = listing.condition
        ?.replaceFirstChar { it.uppercase() }
        ?.replace("_", " ")
        ?.ifBlank { unknown } ?: unknown
    val bodyVal = listing.bodyType
        ?.replace("_", " ")
        ?.trim()
        ?.let { if (it.length <= 4) it.uppercase() else it.replaceFirstChar(Char::uppercase) }
        ?.ifBlank { unknown } ?: unknown

    val specs = listOf(
        BentoSpecItem(stringResource(R.string.mm_spec_year), yearVal, Icons.Filled.CalendarMonth),
        BentoSpecItem(stringResource(R.string.mm_spec_mileage), mileageVal, Icons.Filled.Speed),
        BentoSpecItem(stringResource(R.string.mm_spec_transmission), transVal, Icons.Filled.Tune),
        BentoSpecItem(stringResource(R.string.mm_spec_fuel), fuelVal, Icons.Filled.LocalGasStation),
        BentoSpecItem(stringResource(R.string.mm_spec_condition), condVal, Icons.Filled.AutoAwesome),
        BentoSpecItem(stringResource(R.string.mm_spec_body), bodyVal, Icons.Filled.DirectionsCar),
    )

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = stringResource(R.string.mm_detail_specs),
            style = MmType.current.overline,
            color = MmColors.current.textSecondary,
            modifier = Modifier.padding(bottom = 2.dp),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            BentoCell(item = specs[0], modifier = Modifier.weight(1f))
            BentoCell(item = specs[1], modifier = Modifier.weight(1f))
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            BentoCell(item = specs[2], modifier = Modifier.weight(1f))
            BentoCell(item = specs[3], modifier = Modifier.weight(1f))
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            BentoCell(item = specs[4], modifier = Modifier.weight(1f))
            BentoCell(item = specs[5], modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun BentoCell(item: BentoSpecItem, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MotormilaRadius.lg,
        color = MotormilaSurfaceColor,
        border = BorderStroke(1.dp, MotormilaOutline),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(MotormilaRadius.lg)
                    .background(MotormilaPrimaryGlow),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = item.icon,
                    contentDescription = null,
                    tint = MotormilaPrimary,
                    modifier = Modifier.size(20.dp),
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = item.label,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp,
                    color = MotormilaSecondaryText,
                    // "TRANSMISSION" broke mid-word ("TRANSMISSIO / N") at 130 %+.
                    maxLines = 1,
                    softWrap = false,
                    modifier = Modifier.fitWidth(minScale = 0.5f),
                )
                Text(
                    text = item.value,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = MotormilaOnSurface,
                    maxLines = 1,
                    softWrap = false,
                    modifier = Modifier.fitWidth(minScale = 0.5f),
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 2. Interactive CBSL Lease Payment Calculator
// ─────────────────────────────────────────────────────────────

/**
 * Collapsible tool row (audit P1-B): the calculators are tools, not content —
 * closed by default so history / seller are not buried under ~600 dp of
 * always-on calculator UI. Header is a full-width 48 dp touch target.
 */
@Composable
private fun ExpandableToolRow(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val c = MmColors.current
    var expanded by remember { mutableStateOf(false) }
    val expandState = stringResource(if (expanded) R.string.buyer_expanded else R.string.buyer_collapsed)
    val rotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        animationSpec = tween(MmMotion.Base, easing = MmMotion.Standard),
        label = "tool-chevron",
    )
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Surface(
            onClick = { expanded = !expanded },
            shape = MmShapes.md,
            color = c.surface,
            border = BorderStroke(1.dp, c.outline),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = MmSpacing.touch).semantics { stateDescription = expandState },
        ) {
            Row(
                modifier = Modifier.padding(horizontal = MmSpacing.cardPadding, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    title,
                    style = MmType.current.label,
                    color = c.textPrimary,
                    modifier = Modifier.weight(1f),
                )
                Icon(
                    Icons.Filled.ExpandMore,
                    contentDescription = null,
                    tint = c.textSecondary,
                    modifier = Modifier
                        .size(20.dp)
                        .graphicsLayer { rotationZ = rotation },
                )
            }
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(animationSpec = tween(MmMotion.Base, easing = MmMotion.Standard)) +
                fadeIn(tween(MmMotion.Base)),
            exit = shrinkVertically(animationSpec = tween(MmMotion.Fast, easing = MmMotion.Exit)) +
                fadeOut(tween(MmMotion.Fast)),
        ) {
            content()
        }
    }
}

/** Inline "couldn't load …" + Retry for a failed secondary payload (no dead-end spinners). */
@Composable
private fun InlineRetryRow(
    text: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text,
            style = MmType.current.bodyS,
            color = c.textSecondary,
            modifier = Modifier.weight(1f),
        )
        MotormilaGhostButton(
            label = stringResource(R.string.mm_detail_retry),
            fillMaxWidth = false,
            onClick = onRetry,
        )
    }
}

@Composable
private fun LeasePaymentCalculator(
    priceLkr: Double,
    modifier: Modifier = Modifier,
) {
    var downPaymentPct by remember { mutableStateOf(60f) }
    var interestRate by remember { mutableStateOf(15.0) }
    var tenureYears by remember { mutableStateOf(5) }

    val lowerRate = stringResource(R.string.buyer_lower_rate)
    val raiseRate = stringResource(R.string.buyer_raise_rate)
    val depositLabel = stringResource(R.string.mm_calc_down_payment)
    val downPayment = priceLkr * (downPaymentPct / 100.0)
    val principal = (priceLkr - downPayment).coerceAtLeast(0.0)
    val numberOfPayments = tenureYears * 12
    val monthlyRate = (interestRate / 100.0) / 12.0
    val monthlyPayment = if (monthlyRate <= 0.0) {
        principal / numberOfPayments
    } else {
        val factor = Math.pow(1.0 + monthlyRate, numberOfPayments.toDouble())
        principal * monthlyRate * factor / (factor - 1.0)
    }
    val totalInterest = (monthlyPayment * numberOfPayments) - principal

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MotormilaRadius.lg,
        color = MotormilaSurfaceColor,
        border = BorderStroke(1.dp, MotormilaOutline),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Header
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = stringResource(R.string.mm_calc_lease_title),
                    style = MmType.current.overline,
                    color = MmColors.current.textPrimary,
                )
                Text(
                    text = stringResource(R.string.buyer_lease_example),
                    style = MmType.current.caption,
                    color = MmColors.current.textSecondary,
                )
            }

            // Down Payment Slider — clamped to >= 60 % so the financed share
            // never exceeds the CBSL 40 % max LTV the caption promises.
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.mm_calc_down_payment),
                        style = MmType.current.labelS,
                        color = MmColors.current.textSecondary,
                    )
                    Text(
                        text = "${downPaymentPct.toInt()}% (${LkrFormat.price(downPayment)})",
                        style = (MaterialTheme.typography.labelSmall).tabular(),
                        fontWeight = FontWeight.Bold,
                        color = MotormilaPrimaryBright,
                    )
                }
                Slider(
                    value = downPaymentPct,
                    onValueChange = { downPaymentPct = ((it / 5f).roundToInt() * 5f).coerceIn(60f, 80f) },
                    valueRange = 60f..80f,
                    steps = 3,
                    colors = SliderDefaults.colors(
                        thumbColor = MotormilaPrimaryBright,
                        activeTrackColor = MotormilaPrimary,
                        inactiveTrackColor = MotormilaSurfaceHighest,
                    ),
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = depositLabel },
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("60%", style = MaterialTheme.typography.labelSmall, color = MotormilaSecondaryText)
                    Text("80%", style = MaterialTheme.typography.labelSmall, color = MotormilaSecondaryText)
                }
            }

            // Interest Rate & Tenure
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.mm_calc_interest_rate),
                        style = MmType.current.labelS,
                        color = MmColors.current.textSecondary,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = MotormilaSurfaceHigh,
                            border = BorderStroke(1.dp, MotormilaOutline),
                            onClick = { interestRate = (interestRate - 0.5).coerceAtLeast(8.0) },
                            modifier = Modifier.size(48.dp).semantics { contentDescription = lowerRate },
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text("−", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = MotormilaOnSurface)
                            }
                        }
                        Text(
                            text = "${"%.1f".format(interestRate)}%",
                            style = (MaterialTheme.typography.labelLarge).tabular(),
                            fontWeight = FontWeight.Bold,
                            color = MotormilaOnSurface,
                        )
                        Surface(
                            shape = CircleShape,
                            color = MotormilaSurfaceHigh,
                            border = BorderStroke(1.dp, MotormilaOutline),
                            onClick = { interestRate = (interestRate + 0.5).coerceAtMost(30.0) },
                            modifier = Modifier.size(48.dp).semantics { contentDescription = raiseRate },
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text("+", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = MotormilaOnSurface)
                            }
                        }
                    }
                }

                // Loan Tenure Selector (1 to 5 years, default 5 years / 60 mo)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = stringResource(R.string.mm_calc_tenure),
                        style = MmType.current.labelS,
                        color = MmColors.current.textSecondary,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        (1..5).forEach { yr ->
                            val selected = tenureYears == yr
                            val label = when (yr) {
                                5 -> stringResource(R.string.mm_calc_tenure_max)
                                1 -> stringResource(R.string.mm_calc_tenure_year, yr)
                                else -> stringResource(R.string.mm_calc_tenure_years, yr)
                            }
                            Surface(
                                shape = MotormilaRadius.lg,
                                color = if (selected) MotormilaPrimary else MotormilaSurfaceHigh,
                                border = BorderStroke(1.dp, if (selected) MotormilaPrimary else MotormilaOutline),
                                onClick = { tenureYears = yr },
                                modifier = Modifier
                                    .weight(if (yr == 5) 1.5f else 1f)
                                    .heightIn(min = 48.dp),
                            ) {
                                Box(
                                    modifier = Modifier.padding(vertical = 8.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(
                                        text = label,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                        color = if (selected) MotormilaOnSurface else MotormilaSecondaryText,
                                        maxLines = 1,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Principal & Total Interest Breakdown
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MotormilaRadius.lg)
                    .background(MotormilaSurfaceHigh)
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = stringResource(R.string.mm_calc_principal),
                        style = MaterialTheme.typography.labelSmall,
                        color = MotormilaSecondaryText,
                    )
                    Text(
                        text = LkrFormat.full(principal),
                        style = (MaterialTheme.typography.labelSmall).tabular(),
                        fontWeight = FontWeight.SemiBold,
                        color = MotormilaOnSurface,
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = stringResource(R.string.mm_calc_total_interest),
                        style = MaterialTheme.typography.labelSmall,
                        color = MotormilaSecondaryText,
                    )
                    Text(
                        text = LkrFormat.full(totalInterest),
                        style = (MaterialTheme.typography.labelSmall).tabular(),
                        fontWeight = FontWeight.SemiBold,
                        color = MotormilaOnSurface,
                    )
                }
            }

            // Prominent electric blue container card: EST. MONTHLY PAYMENT
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = MotormilaRadius.lg,
                color = MotormilaPrimaryGlow,
                border = BorderStroke(1.5.dp, MotormilaPrimary.copy(alpha = 0.5f)),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = stringResource(R.string.mm_calc_monthly),
                        style = MmType.current.overline,
                        color = MotormilaPrimaryBright,
                    )
                    Row(
                        verticalAlignment = Alignment.Bottom,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            text = LkrFormat.full(monthlyPayment),
                            style = (MaterialTheme.typography.headlineLarge).tabular(),
                            fontWeight = FontWeight.ExtraBold,
                            color = MotormilaOnSurface,
                        )
                        Text(
                            text = stringResource(R.string.mm_calc_per_month),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            color = MotormilaSecondaryText,
                            modifier = Modifier.padding(bottom = 2.dp),
                        )
                    }
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
@Composable
private fun HistorySection(
    history: lk.motormila.app.domain.model.PriceHistory?,
    report: lk.motormila.app.domain.model.HistoryReport?,
    fmvLkr: Double?,
    modifier: Modifier = Modifier,
    historyState: DetailLoadState = DetailLoadState.LOADING,
    onRetryHistory: (() -> Unit)? = null,
) {
    MotormilaSurface(modifier = modifier) {
        val chartTitle = stringResource(R.string.mm_chart_title)
        when {
            history == null && historyState == DetailLoadState.FAILED -> {
                Text(chartTitle, style = MmType.current.titleS, color = MmColors.current.textPrimary)
                Spacer(Modifier.height(8.dp))
                if (onRetryHistory != null) {
                    InlineRetryRow(
                        text = stringResource(R.string.mm_detail_history_failed),
                        onRetry = onRetryHistory,
                    )
                } else {
                    Text(
                        stringResource(R.string.mm_detail_history_failed),
                        style = MmType.current.bodyS,
                        color = MmColors.current.textSecondary,
                    )
                }
            }
            history == null || history.points.size < 2 -> {
                Text(chartTitle, style = MmType.current.titleS, color = MmColors.current.textPrimary)
                Spacer(Modifier.height(8.dp))
                Text(
                    when {
                        history == null && historyState == DetailLoadState.LOADING -> stringResource(R.string.mm_detail_history_loading)
                        history == null || history.points.isEmpty() -> stringResource(R.string.buyer_no_recorded_asks)
                        else -> stringResource(R.string.mm_detail_history_single)
                    },
                    style = MmType.current.bodyS,
                    color = MmColors.current.textSecondary,
                )
            }
            else -> {
                MmPriceChart(
                    points = history.points,
                    typicalLkr = fmvLkr,
                    title = chartTitle,
                    modifier = Modifier.fillMaxWidth(),
                )
                val change = history.changePct
                if (change != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        stringResource(
                            R.string.mm_detail_history_summary,
                            LkrFormat.deltaPct(change),
                            history.cutCount,
                            history.raiseCount,
                        ),
                        style = MmType.current.caption,
                        color = MmColors.current.textSecondary,
                    )
                }
            }
        }
        val flags = report?.flags.orEmpty()
        if (flags.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text(stringResource(R.string.ui_detail_ownership_flags), fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(4.dp))
            flags.forEach { flag ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(vertical = 3.dp)
                        .semantics { contentDescription = "${flag.severity}: ${flag.detail}" },
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        Icons.Filled.Warning,
                        contentDescription = null,
                        tint = if (flag.severity.equals("critical", ignoreCase = true)) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.secondary
                        },
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(flag.detail, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 4. Seller Trust & Verification Card
// ─────────────────────────────────────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SellerCard(
    seller: SellerProfile?,
    sourceName: String,
    modifier: Modifier = Modifier,
    sellerState: DetailLoadState = DetailLoadState.LOADING,
    onRetrySeller: (() -> Unit)? = null,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MotormilaRadius.lg,
        color = MotormilaSurfaceColor,
        border = BorderStroke(1.dp, MotormilaOutline),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(MotormilaPrimaryGlow),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Shield,
                        contentDescription = null,
                        tint = MotormilaPrimary,
                        modifier = Modifier.size(22.dp),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    // Neutral until the profile loads — "Verified" is reserved for
                    // badges the source itself reports (below), never a default name.
                    Text(
                        text = seller?.sellerName?.takeIf { it.isNotBlank() }
                            ?: stringResource(R.string.mm_detail_seller_on_source, sourceName),
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium,
                        color = MotormilaOnSurface,
                    )
                    val typeLabel = when {
                        seller == null -> null
                        seller.sellerType.equals("dealer", ignoreCase = true) ->
                            stringResource(R.string.mm_detail_seller_type_dealer)
                        seller.sellerType.equals("private", ignoreCase = true) ->
                            stringResource(R.string.mm_detail_seller_type_private)
                        seller.sellerType.isNotBlank() && !seller.sellerType.equals("unknown", ignoreCase = true) ->
                            seller.sellerType.replaceFirstChar(Char::uppercase)
                        else -> stringResource(R.string.mm_detail_seller_generic)
                    }
                    if (typeLabel != null) {
                        Text(
                            text = typeLabel,
                            style = MaterialTheme.typography.labelSmall,
                            color = MotormilaSecondaryText,
                        )
                    }
                }
                seller?.rating?.let { rating ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clip(MotormilaRadius.lg)
                            .background(MotormilaWarnContainer)
                            .padding(horizontal = 6.dp, vertical = 3.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Star,
                            contentDescription = null,
                            tint = MotormilaWarn,
                            modifier = Modifier.size(14.dp),
                        )
                        Spacer(Modifier.width(3.dp))
                        Text(
                            text = "%.1f".format(rating),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MotormilaWarn,
                        )
                    }
                }
            }

            if (seller != null) {
                // Only badges the source actually reports — never invented.
                val badges = seller.verifiedBadges
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    badges.forEach { badge ->
                        Surface(
                            shape = MotormilaRadius.pill,
                            color = MotormilaGoodContainer,
                            border = BorderStroke(1.dp, MotormilaGood.copy(alpha = 0.3f)),
                        ) {
                            Text(
                                text = "✓ $badge",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = MotormilaGoodText,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            )
                        }
                    }
                }

                val meta = listOfNotNull(
                    seller.memberSince?.let { stringResource(R.string.mm_detail_member_since, it) },
                    seller.listingCount?.let { stringResource(R.string.mm_detail_listing_count, it) },
                ).joinToString(" · ")
                if (meta.isNotBlank()) {
                    Text(
                        text = meta,
                        style = MaterialTheme.typography.labelSmall,
                        color = MotormilaSecondaryText,
                    )
                }
            } else when (sellerState) {
                DetailLoadState.FAILED -> {
                    if (onRetrySeller != null) {
                        InlineRetryRow(
                            text = stringResource(R.string.mm_detail_seller_failed),
                            onRetry = onRetrySeller,
                        )
                    } else {
                        Text(
                            text = stringResource(R.string.mm_detail_seller_failed),
                            style = MaterialTheme.typography.labelSmall,
                            color = MotormilaSecondaryText,
                        )
                    }
                }
                DetailLoadState.LOADED -> {
                    Text(
                        text = stringResource(R.string.mm_detail_seller_unavailable),
                        style = MaterialTheme.typography.labelSmall,
                        color = MotormilaSecondaryText,
                    )
                }
                else -> {
                    Text(
                        text = stringResource(R.string.mm_detail_seller_loading),
                        style = MaterialTheme.typography.labelSmall,
                        color = MotormilaSecondaryText,
                    )
                }
            }

            // No phone/WhatsApp reveal: MotorMila does not republish seller
            // contact details; buyers contact the seller on the original listing.
            Text(
                text = stringResource(R.string.listing_contact_on_source, sourceName),
                style = MaterialTheme.typography.labelSmall,
                color = MotormilaSecondaryText,
            )
        }
    }
}

@Composable
private fun SimilarMiniCard(title: String, imageUrl: String?, price: String, onClick: () -> Unit, width: androidx.compose.ui.unit.Dp = 180.dp) {
    MotormilaSurface(
        onClick = onClick,
        fillMaxWidth = false,
        // Same "Title, Rs X" label as the Search cards so TalkBack (and the QA
        // card finder) reads the rail card as one listing (D6).
        modifier = Modifier.width(width).semantics { contentDescription = "$title, $price" },
        contentPadding = PaddingValues(0.dp),
    ) {
        ListingImage(
            model = imageUrl,
            contentDescription = null,
            modifier = Modifier.fillMaxWidth().height(90.dp),
        )
        Column(Modifier.padding(8.dp)) {
            Text(title, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text(price, style = (MaterialTheme.typography.labelLarge).tabular(), fontWeight = FontWeight.Bold)
        }
    }
}

private fun openUrl(context: Context, url: String) {
    // Allowlisted https source hosts only; anything else (or no handler)
    // falls back to copy-to-clipboard with a localized toast (audit P1-E).
    OutboundLinks.open(context, url)
}

private fun shareListing(context: Context, text: String) {
    val send = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(android.content.Intent.EXTRA_TEXT, text)
    }
    try {
        context.startActivity(android.content.Intent.createChooser(send, context.getString(R.string.share_listing_chooser)))
    } catch (_: android.content.ActivityNotFoundException) {
        OutboundLinks.copy(context, text)
    }
}

@Composable
private fun observationDate(raw: String?): String? {
    val locale = androidx.compose.ui.platform.LocalConfiguration.current.locales[0]
    return remember(raw, locale) {
        raw?.let { runCatching {
            java.time.LocalDate.parse(it.take(10)).format(
                java.time.format.DateTimeFormatter.ofLocalizedDate(java.time.format.FormatStyle.MEDIUM).withLocale(locale),
            )
        }.getOrNull() }
    }
}
