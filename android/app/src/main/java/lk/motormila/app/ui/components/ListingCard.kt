@file:OptIn(ExperimentalSharedTransitionApi::class)

package lk.motormila.app.ui.components

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
) {
    val c = MmColors.current
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
                boundsTransform = { _, _ -> MmMotion.gentle() },
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
        onClick = onClick,
        contentPadding = PaddingValues(0.dp),
        modifier = modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = false) { contentDescription = "${listing.displayName}, $priceText" },
    ) {
        Box {
            MmImage(
                url = listing.heroImageUrl,
                contentDescription = null,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(4f / 3f)
                    .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
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
        }
        Column(Modifier.padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 14.dp)) {
            Text(
                text = listing.displayName,
                style = t.label.copy(fontSize = 15.sp, lineHeight = 20.sp),
                color = c.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = priceText,
                style = t.priceM,
                color = c.textPrimary,
                maxLines = 1,
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

@Composable
private fun SaveButton(
    saved: Boolean,
    reduced: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scale by animateFloatAsState(
        targetValue = if (saved && !reduced) 1f else 0.9f,
        animationSpec = if (reduced) androidx.compose.animation.core.snap() else MmMotion.bouncy(),
        label = "save-scale",
    )
    val label = if (saved) "Remove from saved" else "Save"
    Box(
        modifier
            .size(48.dp)
            .clip(RoundedCornerShape(percent = 50))
            .clickable(role = androidx.compose.ui.semantics.Role.Button, onClickLabel = label, onClick = onToggle)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(34.dp)
                .clip(RoundedCornerShape(percent = 50))
                .background(Color(0x8C000000)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (saved) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier
                    .size(18.dp)
                    .graphicsLayer {
                        scaleX = scale + 0.1f
                        scaleY = scale + 0.1f
                    },
            )
        }
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

/** Shared-transition key for the listing price text (card ↔ detail). Text morphs, so this is a [sharedBounds] key. */
fun listingPriceKey(listingId: Int): String = "listing-price-$listingId"

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
    BoundsTransform { _, _ ->
        spring(dampingRatio = 0.9f, stiffness = 700f)
    }

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
        // motormila_logo is blue-on-Ink artwork — no tint, it already matches.
        Image(
            painter = painterResource(id = R.drawable.motormila_logo),
            contentDescription = null,
            modifier = Modifier.size(48.dp),
        )
    }
}
