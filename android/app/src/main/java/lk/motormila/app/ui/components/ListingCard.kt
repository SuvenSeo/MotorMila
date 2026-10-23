@file:OptIn(ExperimentalSharedTransitionApi::class)

package lk.motormila.app.ui.components

import androidx.compose.animation.togetherWith
import androidx.compose.animation.animateContentSize
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.boundsInRoot
import lk.motormila.app.ui.theme.glassEdges
import lk.motormila.app.ui.theme.mmPress
import androidx.compose.animation.BoundsTransform
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.ui.res.stringResource
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmType
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.Check
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.SubcomposeAsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.domain.model.DealBand
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.ui.navigation.LocalNavAnimatedVisibilityScope
import lk.motormila.app.ui.navigation.LocalSharedTransitionScope
import lk.motormila.app.ui.navigation.listingHeroKey
import lk.motormila.app.ui.theme.MotormilaBad
import lk.motormila.app.ui.theme.MotormilaGoodContainer
import lk.motormila.app.ui.theme.MotormilaGoodSoft
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurfaceHigh
import lk.motormila.app.ui.theme.fluidSpring

/**
 * Listing card (design v2): 4:3 photo with a deal verdict pill (same rules
 * as web: asking vs typical asking, lease takeovers get no verdict, very
 * cheap → amber "verify") and a glass save button; below, title, compact
 * price in MILLIONS ("Rs 8.5 Mn") and one quiet meta line. Press-scale 0.97,
 * save haptic, hero image shared-element → detail gallery.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun ListingCard(
    listing: Listing,
    isWatched: Boolean,
    onClick: () -> Unit,
    onWatchToggle: () -> Unit,
    modifier: Modifier = Modifier,
    showDeal: Boolean = true,
    sharedElementModifier: Modifier = Modifier,
    compareSelected: Boolean? = null,
    compareEnabled: Boolean = true,
    onCompareToggle: (() -> Unit)? = null,
    /** Called with the photo's bounds (in root) when the car is ADDED to compare — drives the fly-to-tray motion. */
    onCompareFly: ((androidx.compose.ui.geometry.Rect) -> Unit)? = null,
) {
    val c = MmColors.current
    // Photo bounds for the fly-to-tray motion; a plain holder (no recomposition).
    val photoBounds = remember { arrayOf(androidx.compose.ui.geometry.Rect.Zero) }
    val t = MmType.current
    val haptics = MmHaptics.current
    val reduced = MmMotion.reduced
    val sharedScope = LocalSharedTransitionScope.current
    val animatedScope = LocalNavAnimatedVisibilityScope.current
    val heroShared = if (sharedScope != null && animatedScope != null) {
        with(sharedScope) {
            Modifier.sharedElement(
                rememberSharedContentState(key = listingHeroKey(listing.id)),
                animatedScope,
                boundsTransform = motormilaSharedBoundsTransform(),
            )
        }
    } else {
        sharedElementModifier
    }
    val priceShared = if (sharedScope != null && animatedScope != null) {
        with(sharedScope) {
            Modifier.sharedBounds(
                rememberSharedContentState(key = listingPriceKey(listing.id)),
                animatedScope,
                boundsTransform = motormilaSharedBoundsTransform(),
                resizeMode = PriceMorphResize,
            )
        }
    } else {
        Modifier
    }
    val titleShared = if (sharedScope != null && animatedScope != null) {
        with(sharedScope) {
            Modifier.sharedBounds(
                rememberSharedContentState(key = listingTitleKey(listing.id)),
                animatedScope,
                boundsTransform = motormilaSharedBoundsTransform(),
            )
        }
    } else {
        Modifier
    }
    // Container transform (card -> whole Detail page). Detail carries the
    // matching sharedBounds on its root only when opened from a card.
    val cardShared = if (sharedScope != null && animatedScope != null) {
        with(sharedScope) {
            Modifier.sharedBounds(
                rememberSharedContentState(key = listingCardKey(listing.id)),
                animatedScope,
                // Fade-through: the card's own content is scaled with the
                // container (ScaleToBounds), so at full-page bounds it read ~2x
                // (giant Compare pill / spec line). It leaves fast on open and
                // only comes back once the page has mostly shrunk into it.
                enter = androidx.compose.animation.fadeIn(
                    androidx.compose.animation.core.tween(200, delayMillis = 140, easing = lk.motormila.app.ui.theme.MmMotion.Standard),
                ),
                exit = androidx.compose.animation.fadeOut(
                    androidx.compose.animation.core.tween(90, easing = lk.motormila.app.ui.theme.MmMotion.Exit),
                ),
                boundsTransform = motormilaSharedBoundsTransform(),
                clipInOverlayDuringTransition = OverlayClip(lk.motormila.app.ui.theme.MmShapes.lg),
            )
        }
    } else {
        Modifier
    }
    val verdict = remember(listing.id, listing.priceLkr, listing.marketMedianLkr) {
        MmDealVerdict.compute(
            askingLkr = listing.priceLkr,
            typicalLkr = listing.marketMedianLkr,
            isLeaseTakeover = MmLeaseTakeover.detect(listing.title, listing.model),
            ratingAllowed = listing.dealScore != null,
        )
    }
    val priceText = MmPriceFormat.compact(listing.priceLkr, stringResource(R.string.mm_price_on_request))

    MmCard(
        onClick = {
            // Hand the row to Detail so its first frame is real content.
            lk.motormila.app.ui.navigation.ListingPreviewCache.put(listing)
            onClick()
        },
        contentPadding = PaddingValues(0.dp),
        modifier = modifier
            .fillMaxWidth()
            .then(cardShared)
            // Selected for compare: a brand ring on the whole card, so the state
            // reads at a glance in the grid (iOS selection style).
            .then(
                if (compareSelected == true) Modifier.border(2.dp, c.brand, lk.motormila.app.ui.theme.MmShapes.lg) else Modifier,
            )
            .semantics(mergeDescendants = false) { contentDescription = "${listing.displayName}, $priceText" },
    ) {
        Box {
            MmImage(
                url = listing.heroImageUrl,
                contentDescription = null,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(4f / 3f)
                    .then(
                        if (onCompareFly != null) {
                            Modifier.onGloballyPositioned { photoBounds[0] = it.boundsInRoot() }
                        } else {
                            Modifier
                        },
                    )
                    .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                    .then(heroShared),
            )
            if (showDeal) {
                val label = verdict.label()
                if (label != null) {
                    MmDealBadge(
                        label = if (verdict.kind == MmDealVerdict.Kind.LEASE) stringResource(R.string.mm_lease_short) else label,
                        tone = verdict.tone,
                        onImage = true,
                        // End inset keeps the pill clear of the 48dp save button
                        // (Cal Sans Text sets ~15% wider than the old face).
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(start = 10.dp, top = 10.dp, end = 52.dp),
                    )
                } else if (listing.dealBand() == DealBand.LOCKED && listing.priceLkr != null) {
                    MmDealBadge(
                        band = DealBand.LOCKED,
                        onImage = true,
                        // End inset keeps the pill clear of the 48dp save button
                        // (Cal Sans Text sets ~15% wider than the old face).
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(start = 10.dp, top = 10.dp, end = 52.dp),
                    )
                }
            }
            SaveButton(
                saved = isWatched,
                reduced = reduced,
                onToggle = {
                    if (isWatched) haptics.unsave() else haptics.save()
                    onWatchToggle()
                },
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(4.dp),
            )
            if (compareSelected != null && onCompareToggle != null) {
                CompareToggle(
                    selected = compareSelected,
                    enabled = compareEnabled || compareSelected,
                    listingName = listing.displayName,
                    onToggle = {
                        if (!compareSelected) onCompareFly?.invoke(photoBounds[0])
                        onCompareToggle()
                    },
                    modifier = Modifier.align(Alignment.BottomEnd),
                )
            }
        }
        Column(Modifier.padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 14.dp)) {
            Text(
                text = listing.displayName,
                style = t.label.copy(fontSize = 15.sp, lineHeight = 20.sp),
                color = c.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.then(titleShared),
            )
            Spacer(Modifier.height(4.dp))
            // Shrinks to fit instead of dropping "Mn" at large font scales.
            MmFitText(
                text = priceText,
                style = t.priceM,
                color = c.textPrimary,
                modifier = Modifier.then(priceShared),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = metaLine(listing),
                style = t.caption,
                color = c.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * Compare toggle that lives on the card photo's bottom-end corner (was a
 * detached chip row floating between cards). Scrim pill like the save button;
 * brand-filled with a check once the car is in the compare tray. 48dp touch
 * target, label capped at 1.15x so it never wraps on the photo.
 */
@Composable
private fun CompareToggle(
    selected: Boolean,
    enabled: Boolean,
    listingName: String,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    val label = stringResource(if (selected) R.string.compare_added else R.string.compare_add)
    val cd = stringResource(if (selected) R.string.compare_remove_cd else R.string.compare_add_cd, listingName)
    Box(
        modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(percent = 50))
            .clickable(
                enabled = enabled,
                role = androidx.compose.ui.semantics.Role.Checkbox,
                onClickLabel = cd,
                onClick = onToggle,
            )
            .padding(horizontal = 8.dp, vertical = 8.dp)
            .semantics { contentDescription = cd },
        contentAlignment = Alignment.Center,
    ) {
        lk.motormila.app.ui.theme.CappedFontScale(max = 1.15f) {
            // Morphing glass pill: dark photo-glass "⇄ Compare" ↔ brand "✓ Added".
            // Width springs between the two labels, the icon rotates in, and the
            // pill wobbles when it turns on (signature compare-toggle motion).
            val reduced = MmMotion.reduced
            val fill by androidx.compose.animation.animateColorAsState(
                if (selected) c.brand else lk.motormila.app.ui.theme.PhotoGlassTint,
                if (reduced) androidx.compose.animation.core.snap() else androidx.compose.animation.core.tween(MmMotion.Fast),
                label = "compare-fill",
            )
            Row(
                Modifier
                    .mmWobbleOnSelect(selected)
                    .graphicsLayer { alpha = if (enabled) 1f else 0.5f }
                    .clip(RoundedCornerShape(percent = 50))
                    .background(fill)
                    .glassEdges(RoundedCornerShape(percent = 50), c, sheen = !selected)
                    .animateContentSize(if (reduced) androidx.compose.animation.core.snap() else androidx.compose.animation.core.spring(dampingRatio = 0.7f, stiffness = 500f))
                    .padding(start = 8.dp, end = 10.dp, top = 5.dp, bottom = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                androidx.compose.animation.AnimatedContent(
                    targetState = selected,
                    transitionSpec = {
                        if (reduced) {
                            androidx.compose.animation.EnterTransition.None togetherWith androidx.compose.animation.ExitTransition.None
                        } else {
                            (androidx.compose.animation.scaleIn(androidx.compose.animation.core.spring(dampingRatio = 0.5f, stiffness = 600f), initialScale = 0.4f) +
                                androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(120))) togetherWith
                                (androidx.compose.animation.scaleOut(androidx.compose.animation.core.tween(120), targetScale = 0.4f) +
                                    androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(90)))
                        }
                    },
                    label = "compare-icon",
                ) { on ->
                    Icon(
                        imageVector = if (on) Icons.Filled.Check else Icons.AutoMirrored.Filled.CompareArrows,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(14.dp),
                    )
                }
                Spacer(Modifier.width(4.dp))
                Text(
                    text = label,
                    color = Color.White,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
    }
}

@Composable
private fun SaveButton(
    saved: Boolean,
    reduced: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    val label = stringResource(if (saved) R.string.glass_unsave else R.string.glass_save)
    val interaction = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
    Box(
        modifier
            .size(48.dp)
            .then(Modifier.mmPress(interaction, 0.86f))
            .clip(RoundedCornerShape(percent = 50))
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = androidx.compose.ui.semantics.Role.Button,
                onClickLabel = label,
                onClick = onToggle,
            )
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(34.dp)
                .clip(RoundedCornerShape(percent = 50))
                .background(lk.motormila.app.ui.theme.PhotoGlassTint)
                .glassEdges(RoundedCornerShape(percent = 50), c),
        )
        MmSaveBurstIcon(saved = saved, burstColor = c.brand)
    }
}

@Composable
private fun DeltaChip(deltaPct: Double) {
    val down = deltaPct < 0
    val container = if (down) MotormilaGoodContainer else Color(0x2EEF4444)
    val content = if (down) lk.motormila.app.ui.theme.MotormilaGoodText else lk.motormila.app.ui.theme.MotormilaBadText
    val border = if (down) MotormilaGoodSoft else Color(0x55EF4444)
    Text(
        text = "${if (down) "▼" else "▲"} ${LkrFormat.deltaPct(deltaPct)}",
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        color = content,
        modifier = Modifier
            .clip(MotormilaRadius.pill)
            .background(container)
            .border(1.dp, border, MotormilaRadius.pill)
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

private fun metaLine(l: Listing): String {
    val parts = mutableListOf<String>()
    l.year?.let { parts += it.toString() }
    l.mileageKm?.let { if (it > 0) parts += LkrFormat.km(it) }
    l.fuelType?.let { if (it.isNotBlank()) parts += it.replaceFirstChar(Char::uppercase) }
    l.transmission?.let { if (it.isNotBlank()) parts += it.replaceFirstChar(Char::uppercase) }
    listOfNotNull(l.district?.takeIf { it.isNotBlank() }, l.city?.takeIf { it.isNotBlank() })
        .joinToString(", ").takeIf { it.isNotBlank() }?.let { parts += it }
    return parts.joinToString(" · ").ifBlank { "Details on listing page" }
}

/**
 * Price card <-> Detail morph: scale by HEIGHT (= font size ratio), anchored at
 * the start, so "Rs 1.4 Mn" grows into "Rs 1,400,000" at the right size while
 * the two strings cross-fade. FillWidth (the default) blew the short card
 * string up to the long Detail string's width.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
val PriceMorphResize: androidx.compose.animation.SharedTransitionScope.ResizeMode =
    androidx.compose.animation.SharedTransitionScope.ResizeMode.ScaleToBounds(
        ContentScale.FillHeight,
        Alignment.CenterStart,
    )

/** Shared-transition key for the listing price text (card ↔ detail). Text morphs, so this is a [sharedBounds] key. */
fun listingPriceKey(listingId: Int): String = "listing-price-$listingId"

/** Shared-transition key for the listing title (card ↔ detail). */
fun listingTitleKey(listingId: Int): String = "listing-title-$listingId"

/** Shared-transition key for the listing card container (card ↔ detail price section). */
fun listingCardKey(listingId: Int): String = "listing-card-$listingId"

/**
 * House bounds transform for shared elements (motion spec §3): the bounds
 * rect itself rides the spatial spring (0.9/700). In this Compose version
 * [BoundsTransform] is `(Rect, Rect) -> FiniteAnimationSpec<Rect>` — it only
 * shapes the bounds interpolation; content enter/exit ride [sharedBounds]' own
 * defaults.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
fun motormilaSharedBoundsTransform(): BoundsTransform =
    BoundsTransform { _, _ -> MmMotion.containerSpring() }

/**
 * Listing photo with P0 image polish: a shimmer-tone placeholder while
 * loading, crossfade on arrival, and a branded error tile (Ink + Apex M
 * mark) on failure or blank URL. No image ever pops in from blank.
 *
 * [modifier] lands on the outer container (size / clip / shared-element
 * wiring live here); [imageModifier] is applied to the image node itself.
 */
@Composable
fun ListingImage(
    model: Any?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    imageModifier: Modifier = Modifier,
) {
    val blankModel = remember(model) {
        when (model) {
            null -> true
            is String -> model.isBlank()
            else -> false
        }
    }
    // Static shimmer-tone base so the crossfade never reveals a blank box.
    Box(modifier = modifier.background(MotormilaSurfaceHigh)) {
        if (blankModel) {
            ListingImageErrorTile(Modifier.matchParentSize())
        } else {
            val context = LocalContext.current
            val request = remember(context, model) {
                ImageRequest.Builder(context).data(model).crossfade(true).build()
            }
            val reducedMotion = rememberReducedMotion()
            SubcomposeAsyncImage(
                model = request,
                contentDescription = contentDescription,
                contentScale = contentScale,
                modifier = Modifier.matchParentSize().then(imageModifier),
                loading = {
                    Box(Modifier.matchParentSize().shimmer(enabled = !reducedMotion))
                },
                error = {
                    ListingImageErrorTile(Modifier.matchParentSize())
                },
            )
        }
    }
}

/** Branded error tile: Ink #09090B with the Apex M mark centred. */
@Composable
private fun ListingImageErrorTile(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.background(Color(0xFF09090B)),
        contentAlignment = Alignment.Center,
    ) {
        // Brand v2 mark (blue gradient vector) on Ink — no tint.
        Image(
            painter = painterResource(id = R.drawable.motormila_mark),
            contentDescription = null,
            modifier = Modifier.size(width = 40.dp, height = 32.6.dp),
        )
    }
}
