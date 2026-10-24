@file:OptIn(ExperimentalSharedTransitionApi::class)

package lk.motormila.app.ui.detail

import lk.motormila.app.ui.theme.glassBackdrop
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.statusBars
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import lk.motormila.app.ui.theme.CalSansText
import lk.motormila.app.ui.theme.tabular
import android.content.Context
import android.content.Intent
import androidx.compose.animation.Crossfade
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateDp
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocalGasStation
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.util.lerp
import androidx.core.net.toUri
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.domain.model.DealBand
import lk.motormila.app.domain.model.Fmv
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PriceHistory
import lk.motormila.app.domain.model.SellerProfile
import lk.motormila.app.ui.components.DealBadge
import lk.motormila.app.ui.components.DealRing
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.MmDealVerdict
import lk.motormila.app.ui.components.MmLeaseTakeover
import lk.motormila.app.ui.components.MmPriceChart
import lk.motormila.app.ui.components.MmPullToRefresh
import lk.motormila.app.ui.components.MmDetailSkeleton
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.FmvGauge
import lk.motormila.app.ui.components.ListingImage
import lk.motormila.app.ui.components.SlidingLkr
import lk.motormila.app.ui.components.listingCardKey
import lk.motormila.app.ui.components.listingPriceKey
import lk.motormila.app.ui.components.rememberReducedMotion
import lk.motormila.app.ui.components.LoadingSkeletonCard
import lk.motormila.app.ui.components.LoadingSkeletonChart
import lk.motormila.app.ui.components.LockedValue
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaIconAction
import lk.motormila.app.ui.components.MotormilaPage
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.components.PriceChart
import lk.motormila.app.ui.navigation.LocalNavAnimatedVisibilityScope
import lk.motormila.app.ui.navigation.LocalSharedTransitionScope
import lk.motormila.app.ui.navigation.listingHeroKey
import lk.motormila.app.ui.share.FmvShare
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
import lk.motormila.app.ui.theme.MotormilaTeal
import lk.motormila.app.ui.theme.MotormilaWarn
import lk.motormila.app.ui.theme.MotormilaWarnContainer
import lk.motormila.app.ui.components.motormilaSharedBoundsTransform
import lk.motormila.app.ui.theme.rememberHaptics
import java.text.NumberFormat
import java.util.Calendar
import java.util.Locale
import kotlin.math.absoluteValue
import kotlin.math.roundToInt

/**
 * Listing detail. Signature MUST match NavGraph:
 * `ListingDetailScreen(listingId: Int, onBack: () -> Unit,
 * onCompare: (List<Int>) -> Unit, onEstimate: () -> Unit)`.
 *
 * Upgraded with full web platform parity:
 * - 2x3 Bento Specifications Grid (Year, Mileage, Transmission, Fuel, Condition, Body Type)
 * - Interactive CBSL Lease Payment Calculator (10%-80% slider, 1-5 yr tenure, principal/interest, est monthly payment)
 * - Import Duty and Tax Estimator (Fuel pills, CID/Excise/SSCL/VAT/Luxury, Total taxes & Landed cost, 2025 gazette alert)
 * - Seller Trust, WhatsApp Share Intent, View on Source, and Intelligence Pills
 */
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
    val haptics = LocalHapticFeedback.current
    var showFmvExplain by remember { mutableStateOf(false) }
    var viewerPage by remember { mutableStateOf<Int?>(null) }
    val mmHaptics = lk.motormila.app.ui.theme.MmHaptics.current
    var showWhy by remember { mutableStateOf(false) }

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
                state.listing == null -> {
                    ErrorState(
                        message = state.error ?: "Listing not found",
                        onRetry = viewModel::retry,
                        cachedAvailable = false,
                        modifier = Modifier.fillMaxSize().padding(top = statusTop + 56.dp),
                    )
                }
                else -> {
                    val listing = state.listing!!
                    val galleryImages = listing.images.ifEmpty { listOfNotNull(listing.thumbnailUrl) }
                    val sourceUrl = listing.externalUrl ?: listing.detailUrl
                    Box(Modifier.fillMaxSize()) {
                    // Room for the sticky price / "View on source" bar: its measured height
                    // (it grows with font scale), never less than the original 120 dp.
                    var actionBarHeightPx by androidx.compose.runtime.remember {
                        androidx.compose.runtime.mutableIntStateOf(0)
                    }
                    val actionBarRoom = with(androidx.compose.ui.platform.LocalDensity.current) {
                        maxOf(120.dp, actionBarHeightPx.toDp() + 16.dp)
                    }
                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .fillMaxSize()
                            .glassBackdrop(detailBackdrop)
                            // Pull-down past the top slides the page down; the photo zooms to fill.
                            .graphicsLayer { translationY = stretch.offset },
                        contentPadding = PaddingValues(bottom = actionBarRoom),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        if (state.isOffline) {
                            item { OfflineBanner(visible = true, modifier = Modifier.padding(top = statusTop + 56.dp)) }
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
                        item {
                            val verdict = remember(listing.id, listing.priceLkr, state.fmv) {
                                MmDealVerdict.compute(
                                    askingLkr = listing.priceLkr,
                                    typicalLkr = state.fmv?.fmvLkr ?: listing.marketMedianLkr,
                                    isLeaseTakeover = MmLeaseTakeover.detect(listing.title, listing.model),
                                    weakEstimate = state.fmv?.confidence?.equals("low", ignoreCase = true) == true,
                                    compsCount = state.fmv?.sampleCount?.takeIf { it > 0 },
                                    ratingAllowed = listing.dealScore != null || state.fmv?.hasSignal == true,
                                )
                            }
                            DealVerdictRow(
                                verdict = verdict,
                                onWhy = { showWhy = true },
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                        }
                        item {
                            PriceDealSection(
                                listing = listing,
                                isPro = state.isPro,
                                history = state.history,
                                onDealShown = {
                                    if ((listing.dealScore ?: 0.0) >= 8.0) {
                                        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    }
                                },
                            )
                        }
                        item {
                            HeroActionsRow(
                                listing = listing,
                                onViewSource = {
                                    val url = listing.externalUrl ?: listing.detailUrl
                                    if (url != null) openUrl(context, url)
                                },
                                onShareWhatsApp = { shareWhatsApp(context, listing, state.fmv) },
                                onShare = { shareListing(context, listing, state.fmv) },
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                        }
                        if (state.fmv != null) {
                            item {
                                MotormilaSurface(modifier = Modifier.padding(horizontal = 16.dp)) {
                                    FmvGauge(
                                        fmv = state.fmv!!,
                                        onExplainClick = { showFmvExplain = true },
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                }
                            }
                            item {
                                DealLadder(
                                    askingLkr = listing.priceLkr,
                                    fmvLkr = state.fmv!!.fmvLkr,
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                )
                            }
                        }
                        item {
                            BentoSpecsGrid(
                                listing = listing,
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                        }
                        item {
                            LeasePaymentCalculator(
                                priceLkr = listing.priceLkr ?: 12_500_000.0,
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                        }
                        item {
                            ImportDutyEstimator(
                                priceLkr = listing.priceLkr ?: 10_000_000.0,
                                engineCc = listing.engineCc ?: 1500.0,
                                initialFuel = listing.fuelType,
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                        }
                        item {
                            HistorySection(
                                history = state.history,
                                report = state.report,
                                fmvLkr = state.fmv?.fmvLkr,
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                        }
                        item {
                            SellerCard(
                                seller = state.seller,
                                sourceName = sourceDisplayName(listing.source),
                                onViewSource = {
                                    val url = listing.externalUrl ?: listing.detailUrl
                                    if (url != null) openUrl(context, url)
                                },
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                        }
                        item {
                            BeforeYouPayCard(Modifier.padding(horizontal = 16.dp))
                        }
                        item {
                            DeepLinksRow(
                                onEstimate = onEstimate,
                                onTax = onEstimate,
                                onLease = onEstimate,
                                onMap = {
                                    val q = "${listing.district ?: ""} ${listing.city ?: ""}".trim()
                                    openUrl(context, "https://www.openstreetmap.org/search?query=${q.ifBlank { "Sri Lanka" }}")
                                },
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                        }
                        if (state.similar.isNotEmpty()) {
                            item {
                                Text(
                                    "Similar vehicles",
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.bodyLarge,
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                )
                                Spacer(Modifier.height(8.dp))
                                LazyRow(
                                    contentPadding = PaddingValues(horizontal = 16.dp),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    items(state.similar, key = { it.id }) { s ->
                                        SimilarMiniCard(
                                            title = s.displayName,
                                            imageUrl = s.heroImageUrl,
                                            price = s.formattedPrice(),
                                            // Push a new Detail entry so Back returns to this listing;
                                            // without a navigator, swap the content in place.
                                            onClick = {
                                                lk.motormila.app.ui.navigation.ListingPreviewCache.put(s)
                                                onOpenListing?.invoke(s.id) ?: viewModel.load(s.id)
                                            },
                                        )
                                    }
                                }
                                MotormilaGhostButton(
                                    label = "Compare with similar",
                                    onClick = {
                                        // The listing on screen (may differ from the route id after an in-place swap).
                                        val shownId = state.listing?.id ?: listingId
                                        onCompare((listOf(shownId) + state.similar.map { it.id }.filter { it != shownId }.take(2)))
                                    },
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                                )
                            }
                        }
                        item {
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                MotormilaGhostButton(
                                    label = stringResource(R.string.listing_share_whatsapp),
                                    onClick = { shareWhatsApp(context, listing, state.fmv) },
                                    fillMaxWidth = false,
                                    leadingIcon = Icons.AutoMirrored.Filled.Chat,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }
                    androidx.compose.runtime.CompositionLocalProvider(
                        lk.motormila.app.ui.theme.LocalGlassEnv provides lk.motormila.app.ui.theme.LocalGlassEnv.current.copy(backdrop = detailBackdrop),
                    ) {
                    DetailActionBar(
                        priceLkr = listing.priceLkr,
                        sourceName = sourceDisplayName(listing.source),
                        onViewSource = sourceUrl?.let { url -> { openUrl(context, url) } },
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .onSizeChanged { actionBarHeightPx = it.height },
                    )
                    }
                    }
                }
            }
        }
        val listingNow = state.listing
        androidx.compose.runtime.CompositionLocalProvider(
            lk.motormila.app.ui.theme.LocalGlassEnv provides lk.motormila.app.ui.theme.LocalGlassEnv.current.copy(backdrop = detailBackdrop),
        ) {
            DetailTopChrome(
                title = listingNow?.displayName ?: "",
                collapse = collapse,
                backdrop = detailBackdrop,
                onBack = onBack,
                saved = state.isWatched,
                onToggleSave = {
                    if (state.isWatched) mmHaptics.unsave() else mmHaptics.save()
                    viewModel.toggleWatch()
                },
                onShare = { listingNow?.let { shareListing(context, it, state.fmv) } },
                modifier = Modifier.align(Alignment.TopStart),
            )
        }
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
    if (showWhy && viewerListing != null) {
        val typical = state.fmv?.fmvLkr ?: viewerListing.marketMedianLkr
        DealWhySheet(
            verdict = MmDealVerdict.compute(
                askingLkr = viewerListing.priceLkr,
                typicalLkr = typical,
                isLeaseTakeover = MmLeaseTakeover.detect(viewerListing.title, viewerListing.model),
                weakEstimate = state.fmv?.confidence?.equals("low", ignoreCase = true) == true,
                compsCount = state.fmv?.sampleCount?.takeIf { it > 0 },
            ),
            askingLkr = viewerListing.priceLkr,
            typicalLkr = typical,
            comparables = state.fmv?.sampleCount,
            onDismiss = { showWhy = false },
            onFullEstimate = {
                showWhy = false
                onEstimate()
            },
        )
    }

    if (showFmvExplain && state.fmv != null) {
        ModalBottomSheet(
            onDismissRequest = { showFmvExplain = false },
            shape = lk.motormila.app.ui.theme.MmShapes.sheet,
            containerColor = lk.motormila.app.ui.components.glassSheetColor(),
        ) {
            lk.motormila.app.ui.components.WindowBackdropBlur()
            Column(Modifier.padding(20.dp)) {
                Text(stringResource(R.string.ui_detail_how_this_valuation_works), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.headlineMedium)
                Spacer(Modifier.height(8.dp))
                val fmv = state.fmv!!
                Text("Method: ${fmv.method ?: "comparable sales"}", style = MaterialTheme.typography.labelLarge)
                Text("Sample: ${fmv.sampleCount} comparables · ${fmv.confidence} confidence", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(4.dp))
                Text(
                    "FMV compares this asking price against recent same make/model sales. " +
                        "It is a guide, not a guarantee — always inspect the vehicle.",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(16.dp))
                MotormilaPrimaryButton(label = "Get full estimate", onClick = onEstimate)
                Spacer(Modifier.height(12.dp))
            }
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
private fun PriceDealSection(
    listing: Listing,
    isPro: Boolean,
    onDealShown: () -> Unit,
    history: PriceHistory? = null,
) {
    LaunchedEffect(listing.id) { onDealShown() }
    // The card container key (listingCardKey) lives ONLY on the Detail root
    // (detailContainerTransform). A second sharedBounds with the same key here
    // made Compose pair the root against this section: the whole page was
    // ScaleToBounds-squeezed into this band and stayed there after settling.
    val sharedScope = LocalSharedTransitionScope.current
    val animatedScope = LocalNavAnimatedVisibilityScope.current
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
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
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.headlineMedium,
            color = MotormilaOnSurface,
            modifier = titleShared,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            PriceSlot(
                listing = listing,
                history = history,
                modifier = Modifier.weight(1f),
            )
            // Free tier already shows the PRO badge + locked "Deal score" row below;
            // an empty ring with a dash next to the price read as a broken widget.
            if (isPro && listing.dealScore != null) {
                DealRing(score = listing.dealScore, band = listing.dealBand())
            }
        }
        if (isPro) {
            DealBadge(band = listing.dealBand(), score = listing.dealScore)
        } else {
            // Free tier: backend nulls deal_score — LOCKED badge + blurred value
            // gatekept behind UserSession.isPro (DOMAIN_CONTRACT §5).
            DealBadge(band = DealBand.LOCKED, score = null)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.mm_deal_score_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(8.dp))
                LockedValue(placeholder = "8.4")
            }
        }
        // Intelligence Pills: MILEAGE LOOKS TYPICAL, 89 SELL SPEED, 71 AD HEALTH
        IntelligencePills(listing = listing)
    }
}

/**
 * Price slot on the detail screen. Normally the static price text — the
 * shared-bounds target for the card → detail price morph (spec §3) — which
 * swaps via a short crossfade to the [PriceDropTicker] choreography once a
 * genuine price drop is detected in the price history.
 */
@Composable
private fun PriceSlot(
    listing: Listing,
    history: PriceHistory?,
    modifier: Modifier = Modifier,
) {
    // The shared key lives on this container so the card → detail (and back)
    // morph keeps working whether the static price or the ticker is showing —
    // only one of them is ever composed at a time.
    val sharedScope = LocalSharedTransitionScope.current
    val animatedScope = LocalNavAnimatedVisibilityScope.current
    val priceShared = if (sharedScope != null && animatedScope != null) {
        with(sharedScope) {
            Modifier.sharedBounds(
                rememberSharedContentState(key = listingPriceKey(listing.id)),
                animatedScope,
                boundsTransform = motormilaSharedBoundsTransform(),
                resizeMode = lk.motormila.app.ui.components.PriceMorphResize,
            )
        }
    } else {
        Modifier
    }
    val priceStyle = TextStyle(
        fontFamily = CalSansText, fontFeatureSettings = "tnum",
        fontWeight = FontWeight.Bold,
        fontSize = 26.sp,
        color = MotormilaOnSurface,
    )
    val drop = remember(listing.id, history) { detectPriceDrop(listing.id, history) }
    // Shared bounds hug the price text (not the weight(1f) slot): matched
    // against the slot's full row width, the card's short "Rs 1.4 Mn" was
    // scaled up ~3x mid-morph.
    Box(modifier = modifier) {
        Box(Modifier.then(priceShared)) {
            Crossfade(
                targetState = drop,
                animationSpec = tween(durationMillis = 200),
                label = "price-slot",
            ) { activeDrop ->
                if (activeDrop != null) {
                    PriceDropTicker(drop = activeDrop, priceStyle = priceStyle)
                } else {
                    Text(text = LkrFormat.priceFull(listing.priceLkr), style = priceStyle)
                }
            }
        }
    }
}

/** A detected most-recent price cut. */
private data class PriceDrop(
    /** Stable id for one drop event — the ticker choreography is keyed on this. */
    val dropId: String,
    val oldPriceLkr: Double,
    val newPriceLkr: Double,
)

/**
 * Detects the most recent price cut from the last two tracked points.
 * Returns null unless the latest observation is a genuine cut — dust
 * (< 0.5%) is ignored so the ticker only fires on meaningful drops.
 */
private fun detectPriceDrop(listingId: Int, history: PriceHistory?): PriceDrop? {
    // Guard against stale history: similar-card taps swap the listing in
    // place while the previous history is still in state.
    if (history == null || history.listingId != listingId) return null
    val points = history.points
    if (points.size < 2) return null
    val previous = points[points.size - 2]
    val latest = points.last()
    if (latest.priceLkr >= previous.priceLkr || previous.priceLkr <= 0) return null
    val cutFraction = (previous.priceLkr - latest.priceLkr) / previous.priceLkr
    if (cutFraction < 0.005) return null
    val dropId = "$listingId@${history.lastChangeAt ?: latest.scrapedAt}"
    return PriceDrop(dropId = dropId, oldPriceLkr = previous.priceLkr, newPriceLkr = latest.priceLkr)
}

/**
 * Motion spec §7.2 — the price-drop ticker superpower.
 *
 * 900ms choreography, played ONCE per [PriceDrop.dropId] (all animation
 * state is keyed on the drop id, so recompositions never replay it):
 * 1. the old price strike-through draws left → right (400ms),
 * 2. digits roll down to the new price via [SlidingNumber] (650ms),
 * 3. a Deal-Green flash washes the price row,
 * 4. [HapticHelper.tick] lands on settle.
 *
 * Reduced motion collapses the whole moment to a simple crossfade.
 */
@Composable
private fun PriceDropTicker(
    drop: PriceDrop,
    priceStyle: TextStyle,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()
    if (reducedMotion) {
        Crossfade(
            targetState = drop.newPriceLkr,
            animationSpec = tween(durationMillis = 200),
            label = "price-drop-reduced",
        ) { price ->
            Text(text = LkrFormat.priceFull(price), style = priceStyle, modifier = modifier)
        }
        return
    }
    val haptics = rememberHaptics()
    var started by remember(drop.dropId) { mutableStateOf(false) }
    val strikeProgress by animateFloatAsState(
        targetValue = if (started) 1f else 0f,
        animationSpec = spring(dampingRatio = 1f, stiffness = Spring.StiffnessMediumLow, visibilityThreshold = 0.001f),
        label = "drop-strike",
    )
    val flash = remember(drop.dropId) { Animatable(0f) }
    LaunchedEffect(drop.dropId) {
        started = true
        // Green wash in, then out; the tick lands on settle (~900ms total).
        flash.animateTo(0.22f, tween(durationMillis = 150))
        flash.animateTo(0f, tween(durationMillis = 600))
        delay(150)
        haptics.tick()
    }
    Box(modifier = modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // Old price with a strike-through that draws left → right.
            Box {
                Text(
                    text = LkrFormat.full(drop.oldPriceLkr),
                    style = MaterialTheme.typography.headlineMedium.copy(
                        fontFeatureSettings = "tnum",
                        color = MotormilaSecondaryText,
                    ),
                )
                Canvas(Modifier.matchParentSize()) {
                    val y = size.height / 2f
                    drawLine(
                        color = MotormilaGood,
                        start = Offset(0f, y),
                        end = Offset(size.width * strikeProgress, y),
                        strokeWidth = 2.dp.toPx(),
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            SlidingLkr(
                valueLkr = if (started) drop.newPriceLkr else drop.oldPriceLkr,
                style = priceStyle,
                full = true,
            )
        }
        if (flash.value > 0.005f) {
            Box(
                Modifier
                    .matchParentSize()
                    .background(MotormilaGood.copy(alpha = flash.value)),
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun IntelligencePills(listing: Listing, modifier: Modifier = Modifier) {
    val mileageLabelRes = remember(listing.mileageKm, listing.year) {
        val mileage = listing.mileageKm
        val year = listing.year
        val currentYear = Calendar.getInstance().get(Calendar.YEAR)
        if (mileage != null && mileage > 0 && year != null && year in 1980..currentYear) {
            val age = (currentYear - year).coerceAtLeast(1)
            val kmPerYear = mileage / age
            val ratio = kmPerYear / 12000.0
            when {
                age >= 3 && ratio < 0.35 -> R.string.mm_km_low_anomaly
                ratio > 2.2 -> R.string.mm_km_high_usage
                ratio < 0.55 && age >= 2 -> R.string.mm_km_below_avg
                else -> R.string.mm_km_typical
            }
        } else {
            R.string.mm_km_typical
        }
    }
    val mileageLabel = stringResource(mileageLabelRes)

    val sellSpeedScore = remember(listing.dealScore) {
        val score = listing.dealScore ?: 7.5
        ((score * 2.5) + 68).toInt().coerceIn(30, 96)
    }

    val adHealthScore = remember(listing) {
        var score = 0
        if (!listing.thumbnailUrl.isNullOrBlank() || listing.images.isNotEmpty()) score += 15
        if ((listing.mileageKm ?: 0.0) > 0) score += 14
        if ((listing.engineCc ?: 0.0) > 0) score += 14
        if (!listing.fuelType.isNullOrBlank()) score += 14
        if (!listing.district.isNullOrBlank()) score += 14
        if (listing.title.isNotBlank()) score += 14
        if ((listing.year ?: 0) > 0) score += 15
        if (score == 0) 71 else score
    }

    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // Mileage Intelligence Pill
        Surface(
            shape = MotormilaRadius.lg,
            color = MotormilaGoodContainer,
            border = BorderStroke(1.dp, MotormilaGood.copy(alpha = 0.35f)),
        ) {
            Text(
                text = mileageLabel,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.5.sp,
                color = MotormilaGoodText,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }

        // Sell Speed Intelligence Pill
        Surface(
            shape = MotormilaRadius.lg,
            color = Color(0x2E38BDF8),
            border = BorderStroke(1.dp, MotormilaTeal.copy(alpha = 0.35f)),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Text(
                    text = "$sellSpeedScore",
                    style = (MaterialTheme.typography.labelSmall).tabular(),
                    fontWeight = FontWeight.ExtraBold,
                    color = MotormilaTeal,
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = stringResource(R.string.mm_pill_sell_speed),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.5.sp,
                    color = MotormilaTeal,
                )
            }
        }

        // Advert Health Intelligence Pill
        Surface(
            shape = MotormilaRadius.lg,
            color = MotormilaWarnContainer,
            border = BorderStroke(1.dp, MotormilaWarn.copy(alpha = 0.35f)),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Text(
                    text = "$adHealthScore",
                    style = (MaterialTheme.typography.labelSmall).tabular(),
                    fontWeight = FontWeight.ExtraBold,
                    color = MotormilaWarn,
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = stringResource(R.string.mm_pill_ad_health),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.5.sp,
                    color = MotormilaWarn,
                )
            }
        }
    }
}

@Composable
private fun HeroActionsRow(
    listing: Listing,
    onViewSource: () -> Unit,
    onShareWhatsApp: () -> Unit,
    onShare: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val sourceName = sourceDisplayName(listing.source)
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
    // Attribution: every listing is credited to the site it was listed on.
    Text(
        text = stringResource(R.string.listing_listed_on, sourceName),
        style = MaterialTheme.typography.labelMedium,
        color = MotormilaSecondaryText,
    )
    // Large Dynamic Type (> 1.3x): two side-by-side buttons can't hold their labels
    // ("Share o… WhatsA pp" at 200 %), so stack them full width instead.
    val largeText = androidx.compose.ui.platform.LocalDensity.current.fontScale > 1.3f
    if (largeText) {
        MotormilaPrimaryButton(
            label = stringResource(R.string.listing_view_on_source, sourceName),
            leadingIcon = Icons.AutoMirrored.Filled.OpenInNew,
            onClick = onViewSource,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MotormilaGhostButton(
                label = stringResource(R.string.listing_share_whatsapp),
                fillMaxWidth = false,
                leadingIcon = Icons.AutoMirrored.Filled.Chat,
                modifier = Modifier.weight(1f),
                onClick = onShareWhatsApp,
            )
            MotormilaIconAction(
                icon = Icons.Filled.Share,
                contentDescription = stringResource(R.string.listing_share_cd),
                onClick = onShare,
            )
        }
    } else {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MotormilaPrimaryButton(
            label = stringResource(R.string.listing_view_on_source, sourceName),
            fillMaxWidth = false,
            leadingIcon = Icons.AutoMirrored.Filled.OpenInNew,
            modifier = Modifier.weight(1f),
            onClick = onViewSource,
        )
        // Short "WhatsApp" label (icon + word) so it never wraps beside the
        // primary button ("Share on / WhatsApp" at 100 %); the full phrase stays
        // as the accessibility label.
        val waCd = stringResource(R.string.listing_share_whatsapp)
        MotormilaGhostButton(
            label = stringResource(R.string.listing_share_whatsapp_short),
            fillMaxWidth = false,
            leadingIcon = Icons.AutoMirrored.Filled.Chat,
            modifier = Modifier.semantics { contentDescription = waCd },
            onClick = onShareWhatsApp,
        )
        MotormilaIconAction(
            icon = Icons.Filled.Share,
            contentDescription = stringResource(R.string.listing_share_cd),
            onClick = onShare,
        )
    }
    }
    }
}

/** Human source name for attribution ("ikman", "Riyasewana"); generic fallback. */
@Composable
private fun sourceDisplayName(source: String?): String =
    source?.trim()?.takeIf { it.isNotEmpty() }?.replaceFirstChar { it.uppercase() }
        ?: stringResource(R.string.listing_source_fallback)

/** Deal ladder rungs: asking vs low/median/high markers. */
@Composable
private fun DealLadder(askingLkr: Double?, fmvLkr: Double?, modifier: Modifier = Modifier) {
    if (askingLkr == null || fmvLkr == null || fmvLkr <= 0) return
    MotormilaSurface(modifier = modifier) {
        Text(
            stringResource(R.string.mm_deal_ladder),
            fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.bodyMedium,
            color = MotormilaOnSurface,
        )
        Spacer(Modifier.height(8.dp))
        val low = fmvLkr * 0.9
        val high = fmvLkr * 1.1
        LadderRung(stringResource(R.string.mm_ladder_great), low, askingLkr <= low)
        LadderRung(stringResource(R.string.mm_ladder_fair), fmvLkr, askingLkr in low..high)
        LadderRung(stringResource(R.string.mm_ladder_high), high, askingLkr > high)
    }
}

@Composable
private fun LadderRung(label: String, value: Double, active: Boolean) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .semantics { contentDescription = "$label ${LkrFormat.full(value)}${if (active) ", your range" else ""}" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = MotormilaOnSurface,
            modifier = Modifier.weight(1f),
        )
        Text(LkrFormat.full(value), style = (MaterialTheme.typography.labelLarge).tabular(), fontWeight = if (active) FontWeight.Bold else FontWeight.Normal)
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
private fun BentoSpecsGrid(listing: Listing, modifier: Modifier = Modifier) {
    val numberFormatter = remember { NumberFormat.getIntegerInstance(Locale.US) }

    val yearVal = listing.year?.toString() ?: "Unknown"
    val mileageVal = if (listing.mileageKm != null && listing.mileageKm > 0) {
        "${numberFormatter.format(listing.mileageKm.toLong())} KM"
    } else {
        "Unknown"
    }
    val transVal = listing.transmission
        ?.replaceFirstChar { it.uppercase() }
        ?.replace("_", " ")
        ?.ifBlank { "Unknown" } ?: "Unknown"
    val fuelVal = listing.fuelType
        ?.replaceFirstChar { it.uppercase() }
        ?.replace("_", " ")
        ?.ifBlank { "Unknown" } ?: "Unknown"
    val condVal = listing.condition
        ?.replaceFirstChar { it.uppercase() }
        ?.replace("_", " ")
        ?.ifBlank { "Pre-Owned" } ?: "Pre-Owned"
    val bodyVal = listing.bodyType
        ?.replace("_", " ")
        ?.trim()
        ?.let { if (it.length <= 4) it.uppercase() else it.replaceFirstChar(Char::uppercase) }
        ?.ifBlank { "Unknown" } ?: "Unknown"

    val specs = listOf(
        BentoSpecItem("YEAR", yearVal, Icons.Filled.CalendarMonth),
        BentoSpecItem("MILEAGE", mileageVal, Icons.Filled.Speed),
        BentoSpecItem("TRANSMISSION", transVal, Icons.Filled.Tune),
        BentoSpecItem("FUEL", fuelVal, Icons.Filled.LocalGasStation),
        BentoSpecItem("CONDITION", condVal, Icons.Filled.AutoAwesome),
        BentoSpecItem("BODY TYPE", bodyVal, Icons.Filled.DirectionsCar),
    )

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "SPECIFICATIONS",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.4.sp,
            color = MotormilaSecondaryText,
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
                    contentDescription = item.label,
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
                )
                Text(
                    text = item.value,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = MotormilaOnSurface,
                    maxLines = 1,
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 2. Interactive CBSL Lease Payment Calculator
// ─────────────────────────────────────────────────────────────

@Composable
private fun LeasePaymentCalculator(
    priceLkr: Double,
    modifier: Modifier = Modifier,
) {
    val safePrice = if (priceLkr > 0) priceLkr else 12_500_000.0
    var downPaymentPct by remember { mutableStateOf(60f) }
    var interestRate by remember { mutableStateOf(15.0) }
    var tenureYears by remember { mutableStateOf(5) }

    val downPayment = safePrice * (downPaymentPct / 100.0)
    val principal = (safePrice - downPayment).coerceAtLeast(0.0)
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
                    text = "LEASE PAYMENT CALCULATOR",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 1.2.sp,
                    color = MotormilaOnSurface,
                )
                Text(
                    text = "CBSL-oriented max LTV 40% · Brand new / <1yr",
                    style = MaterialTheme.typography.labelSmall,
                    color = MotormilaSecondaryText,
                )
            }

            // Down Payment Slider
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "DOWN PAYMENT",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 0.8.sp,
                        color = MotormilaSecondaryText,
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
                    onValueChange = { downPaymentPct = ((it / 5f).roundToInt() * 5f).coerceIn(10f, 80f) },
                    valueRange = 10f..80f,
                    steps = 13,
                    colors = SliderDefaults.colors(
                        thumbColor = MotormilaPrimaryBright,
                        activeTrackColor = MotormilaPrimary,
                        inactiveTrackColor = MotormilaSurfaceHighest,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("10%", style = MaterialTheme.typography.labelSmall, color = MotormilaSecondaryText)
                    Text(stringResource(R.string.ui_detail_40_cbsl_cap), style = MaterialTheme.typography.labelSmall, color = MotormilaSecondaryText)
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
                        text = "INTEREST RATE",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 0.8.sp,
                        color = MotormilaSecondaryText,
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
                            modifier = Modifier.size(48.dp),
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
                            modifier = Modifier.size(48.dp),
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
                        text = "LOAN TENURE",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 0.8.sp,
                        color = MotormilaSecondaryText,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        (1..5).forEach { yr ->
                            val selected = tenureYears == yr
                            val label = if (yr == 5) "5 Yrs (60 mo)" else "$yr ${if (yr == 1) "Yr" else "Yrs"}"
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
                        text = "Principal Amount",
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
                        text = "Total Interest Paid",
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
                        text = "EST. MONTHLY PAYMENT",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.2.sp,
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
                            text = "/mo",
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
// 3. Import Duty and Tax Estimator (Indicative)
// ─────────────────────────────────────────────────────────────

private enum class ImportFuelClass(val label: String) {
    PETROL("Petrol"),
    DIESEL("Diesel"),
    HYBRID("Hybrid"),
    ELECTRIC("Electric");
}

@Composable
private fun ImportDutyEstimator(
    priceLkr: Double,
    engineCc: Double,
    initialFuel: String?,
    modifier: Modifier = Modifier,
) {
    val detectedFuel = remember(initialFuel) {
        val f = initialFuel?.lowercase() ?: ""
        when {
            f.contains("hybrid") || f.contains("phev") -> ImportFuelClass.HYBRID
            f.contains("electric") || f == "ev" -> ImportFuelClass.ELECTRIC
            f.contains("diesel") -> ImportFuelClass.DIESEL
            else -> ImportFuelClass.PETROL
        }
    }

    var selectedFuel by remember { mutableStateOf(detectedFuel) }
    val baseCif = if (priceLkr > 0) priceLkr else 10_000_000.0
    val cc = if (engineCc > 0) engineCc else 1500.0
    val evKw = 110.0 // standard rating

    // Post-2025 gazette import model calculations
    val cid = baseCif * 0.30
    val surcharge = cid * 0.50

    val excise = when (selectedFuel) {
        ImportFuelClass.PETROL -> {
            val rate = when {
                cc <= 1000 -> 3450.0
                cc <= 1500 -> 4000.0
                cc <= 1800 -> 5200.0
                cc <= 2000 -> 6300.0
                else -> 8050.0
            }
            cc * rate
        }
        ImportFuelClass.DIESEL -> {
            val rate = when {
                cc <= 1500 -> 4600.0
                cc <= 2000 -> 6900.0
                cc <= 2500 -> 8050.0
                else -> 9200.0
            }
            cc * rate
        }
        ImportFuelClass.HYBRID -> {
            val rate = when {
                cc <= 1000 -> 2000.0
                cc <= 1500 -> 2750.0
                cc <= 1800 -> 4000.0
                cc <= 2000 -> 5200.0
                else -> 6900.0
            }
            cc * rate
        }
        ImportFuelClass.ELECTRIC -> {
            val rate = when {
                evKw <= 50 -> 25000.0
                evKw <= 100 -> 37500.0
                evKw <= 150 -> 50000.0
                evKw <= 200 -> 65000.0
                else -> 80000.0
            }
            evKw * rate
        }
    }

    val (luxuryThreshold, luxuryRate) = when (selectedFuel) {
        ImportFuelClass.PETROL -> 7_000_000.0 to 1.00
        ImportFuelClass.DIESEL -> 7_000_000.0 to 1.00
        ImportFuelClass.HYBRID -> 8_000_000.0 to 1.00
        ImportFuelClass.ELECTRIC -> 12_000_000.0 to 0.60
    }
    val luxuryExcess = (baseCif - luxuryThreshold).coerceAtLeast(0.0)
    val luxuryTax = luxuryExcess * luxuryRate

    val ssclBase = baseCif + cid + surcharge + excise
    val sscl = ssclBase * 0.025
    val vatBase = ssclBase + sscl
    val vat = vatBase * 0.18

    val totalEstimatedTaxes = cid + surcharge + excise + luxuryTax + sscl + vat
    val estimatedLandedCost = baseCif + totalEstimatedTaxes

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
            // Header + Indicative Pill
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "IMPORT DUTY & TAX ESTIMATOR",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 1.2.sp,
                    color = MotormilaOnSurface,
                )
                Surface(
                    shape = MotormilaRadius.pill,
                    color = MotormilaPrimaryGlow,
                    border = BorderStroke(1.dp, MotormilaPrimary.copy(alpha = 0.4f)),
                ) {
                    Text(
                        text = "INDICATIVE",
                        style = (MaterialTheme.typography.labelSmall).tabular(),
                        fontWeight = FontWeight.Bold,
                        color = MotormilaPrimaryBright,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }

            // Fuel type selection filter pills
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                listOf(
                    ImportFuelClass.PETROL,
                    ImportFuelClass.DIESEL,
                    ImportFuelClass.HYBRID,
                    ImportFuelClass.ELECTRIC,
                ).forEach { fuel ->
                    val selected = selectedFuel == fuel
                    Surface(
                        shape = MotormilaRadius.lg,
                        color = if (selected) MotormilaPrimary else MotormilaSurfaceHigh,
                        border = BorderStroke(1.dp, if (selected) MotormilaPrimary else MotormilaOutline),
                        onClick = { selectedFuel = fuel },
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp),
                    ) {
                        Box(
                            modifier = Modifier.padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = fuel.label,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                color = if (selected) MotormilaOnSurface else MotormilaSecondaryText,
                            )
                        }
                    }
                }
            }

            // Tax breakdown rows
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MotormilaRadius.lg)
                    .background(MotormilaSurfaceHigh)
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                TaxBreakdownRow("Base CIF (Est.)", LkrFormat.price(baseCif))
                TaxBreakdownRow("Customs Import Duty (30%)", LkrFormat.price(cid))
                TaxBreakdownRow("CID Surcharge (50% of CID)", LkrFormat.price(surcharge))
                TaxBreakdownRow(
                    if (selectedFuel == ImportFuelClass.ELECTRIC) "Excise Duty (per kW band)" else "Excise Duty (per cm³ band)",
                    LkrFormat.price(excise)
                )
                TaxBreakdownRow("SSCL Levy (2.5%)", LkrFormat.price(sscl))
                TaxBreakdownRow("VAT (18% duty-inclusive)", LkrFormat.price(vat))
                if (luxuryTax > 0) {
                    TaxBreakdownRow("Luxury Tax", LkrFormat.price(luxuryTax))
                }
            }

            // Total estimated taxes and Estimated Landed Cost in LKR millions
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                // Total Estimated Taxes
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = MotormilaRadius.lg,
                    color = MotormilaSurfaceHigh,
                    border = BorderStroke(1.dp, MotormilaOutline),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Total Estimated Taxes",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Medium,
                            color = MotormilaSecondaryText,
                        )
                        Text(
                            text = "+${LkrFormat.price(totalEstimatedTaxes)}",
                            style = (MaterialTheme.typography.bodyMedium).tabular(),
                            fontWeight = FontWeight.Bold,
                            color = MotormilaPrimaryBright,
                        )
                    }
                }

                // Estimated Landed Cost
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = MotormilaRadius.lg,
                    color = MotormilaPrimaryGlow,
                    border = BorderStroke(1.5.dp, MotormilaPrimary.copy(alpha = 0.5f)),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text(
                                text = "ESTIMATED LANDED COST",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp,
                                color = MotormilaPrimaryBright,
                            )
                            Text(
                                text = "LKR Millions (On-Road Est.)",
                                style = MaterialTheme.typography.labelSmall,
                                color = MotormilaSecondaryText,
                            )
                        }
                        Text(
                            text = LkrFormat.price(estimatedLandedCost),
                            style = (MaterialTheme.typography.headlineMedium).tabular(),
                            fontWeight = FontWeight.ExtraBold,
                            color = MotormilaOnSurface,
                        )
                    }
                }
            }

            // Alert card
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = MotormilaRadius.lg,
                color = MotormilaWarnContainer,
                border = BorderStroke(1.dp, MotormilaWarn.copy(alpha = 0.35f)),
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Warning,
                        contentDescription = null,
                        tint = MotormilaWarn,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = "Indicative model of the post-2025 import regime. Verify current customs rates before committing an import.",
                        style = MaterialTheme.typography.labelSmall,
                        lineHeight = 16.sp,
                        color = MotormilaOnSurface.copy(alpha = 0.85f),
                    )
                }
            }
        }
    }
}

@Composable
private fun TaxBreakdownRow(label: String, amount: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MotormilaSecondaryText,
        )
        Text(
            text = amount,
            style = (MaterialTheme.typography.labelSmall).tabular(),
            fontWeight = FontWeight.Medium,
            color = MotormilaOnSurface,
        )
    }
}

@Composable
private fun HistorySection(
    history: lk.motormila.app.domain.model.PriceHistory?,
    report: lk.motormila.app.domain.model.HistoryReport?,
    fmvLkr: Double?,
    modifier: Modifier = Modifier,
) {
    MotormilaSurface(modifier = modifier) {
        Text(stringResource(R.string.ui_detail_price_history), fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(8.dp))
        if (history == null || history.points.size < 2) {
            Text(
                if (history == null) "Loading price history…" else "Only one price point so far — check back after the next scrape.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            MmPriceChart(points = history.points, typicalLkr = fmvLkr, modifier = Modifier.fillMaxWidth())
            val change = history.changePct
            if (change != null) {
                Spacer(Modifier.height(4.dp))
                Text(
                    "Overall ${LkrFormat.deltaPct(change)} · ${history.cutCount} cuts · ${history.raiseCount} rises",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
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
    onViewSource: () -> Unit,
    modifier: Modifier = Modifier,
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
                    Text(
                        text = seller?.sellerName ?: "Verified Seller",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium,
                        color = MotormilaOnSurface,
                    )
                    Text(
                        text = if (seller != null && seller.sellerType.isNotBlank()) {
                            seller.sellerType.replaceFirstChar(Char::uppercase)
                        } else {
                            "Direct Seller"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MotormilaSecondaryText,
                    )
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
                    seller.memberSince?.let { "Member since $it" },
                    seller.listingCount?.let { "$it listings" },
                ).joinToString(" · ")
                if (meta.isNotBlank()) {
                    Text(
                        text = meta,
                        style = MaterialTheme.typography.labelSmall,
                        color = MotormilaSecondaryText,
                    )
                }
            } else {
                Text(
                    text = "Loading seller profile and trust metrics…",
                    style = MaterialTheme.typography.labelSmall,
                    color = MotormilaSecondaryText,
                )
            }

            // No phone/WhatsApp reveal: MotorMila does not republish seller
            // contact details; buyers contact the seller on the original listing.
            Text(
                text = stringResource(R.string.listing_contact_on_source, sourceName),
                style = MaterialTheme.typography.labelSmall,
                color = MotormilaSecondaryText,
            )
            MotormilaGhostButton(
                label = stringResource(R.string.listing_view_on_source, sourceName),
                leadingIcon = Icons.AutoMirrored.Filled.OpenInNew,
                onClick = onViewSource,
            )
        }
    }
}

@Composable
private fun DeepLinksRow(
    onEstimate: () -> Unit,
    onTax: () -> Unit,
    onLease: () -> Unit,
    onMap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        MotormilaGhostButton(
            label = "Estimate",
            fillMaxWidth = false,
            // "Estimate" wrapped mid-word at equal weights on a 1080 px screen.
            modifier = Modifier.weight(1.4f),
            onClick = onEstimate,
        )
        MotormilaGhostButton(
            label = "Tax",
            fillMaxWidth = false,
            modifier = Modifier.weight(0.85f),
            onClick = onTax,
        )
        MotormilaGhostButton(
            label = "Lease",
            fillMaxWidth = false,
            modifier = Modifier.weight(1f),
            onClick = onLease,
        )
        MotormilaGhostButton(
            label = "Map",
            fillMaxWidth = false,
            modifier = Modifier.weight(0.85f),
            onClick = onMap,
        )
    }
}

@Composable
private fun SimilarMiniCard(title: String, imageUrl: String?, price: String, onClick: () -> Unit) {
    MotormilaSurface(
        onClick = onClick,
        fillMaxWidth = false,
        // Same "Title, Rs X" label as the Search cards so TalkBack (and the QA
        // card finder) reads the rail card as one listing (D6).
        modifier = Modifier.width(180.dp).semantics { contentDescription = "$title, $price" },
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
    val intent = Intent(Intent.ACTION_VIEW, url.toUri())
        .addCategory(Intent.CATEGORY_BROWSABLE)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (_: Exception) {
        // No browser / handler: tell the user instead of silently doing nothing.
        android.widget.Toast.makeText(context, "No app can open this link", android.widget.Toast.LENGTH_SHORT).show()
    }
}

private fun shareListing(context: Context, listing: Listing, fmv: Fmv?) {
    // Single share entry: FMV bitmap card + EXTRA_TEXT listing URL.
    // Web parity: singular /listing/{id} (App.tsx `/listing/:id`).
    FmvShare.share(context, listing, fmv)
}

private fun shareWhatsApp(context: Context, listing: Listing, fmv: Fmv?) {
    FmvShare.shareWhatsApp(context, listing, fmv)
}
