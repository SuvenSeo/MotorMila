@file:OptIn(ExperimentalSharedTransitionApi::class)

package lk.motormila.app.ui.components

import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.spring
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.SubcomposeAsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import java.time.Duration
import java.time.Instant
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.ui.navigation.LocalNavAnimatedVisibilityScope
import lk.motormila.app.ui.navigation.LocalSharedTransitionScope
import lk.motormila.app.ui.navigation.listingHeroKey
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.MotormilaSurfaceHigh
import lk.motormila.app.ui.theme.deal
import lk.motormila.app.ui.theme.glassEdges
import lk.motormila.app.ui.theme.mmPress

/** Photo, asking price and attributed observation only. A row carries no detailed comparison. */
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
    /** Reserved for a future feed carrying publishable verdicts. */
    onWhy: (() -> Unit)? = null,
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
    // Search rows have no detailed verdict (confidence, sample count, server withhold reason).
    // Do not infer a rating, typical-price graphic or Pro promise from a score/median.
    val lease = showDeal && remember(listing.title, listing.model) { MmLeaseTakeover.detect(listing.title, listing.model) }
    val priceText = MmPriceFormat.compact(listing.priceLkr?.takeIf { it.isFinite() }, stringResource(R.string.mm_price_on_request))
    val meta = metaLine(listing)
    val sourceText = listing.source?.takeIf { it.isNotBlank() }?.let { sourceLabel(it) }
    val agoText = checkedAgoText(listing.lastSeenAt ?: listing.scrapedAt)
    val footerText = listOfNotNull(sourceText, agoText).joinToString(" · ")
    val leaseLabel = if (lease) stringResource(R.string.mm_lease_short) else null
    val cardCd = listOfNotNull(listing.displayName, priceText, meta, leaseLabel, footerText.takeIf { it.isNotBlank() }).joinToString(", ")

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
            .semantics(mergeDescendants = true) { contentDescription = cardCd },
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
            if (leaseLabel != null) {
                Text(leaseLabel, style = t.labelS, color = c.onBrandContainer,
                    modifier = Modifier.padding(8.dp).clip(MmShapes.sm).background(c.brandContainer).padding(6.dp))
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
                // Two lines at every font scale: narrow 152dp cells clipped
                // names to ~6 chars ("Merced…") when limited to one line.
                maxLines = 2,
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
                // A price never ellipsizes: at 200 % on a 360 dp two-column grid
                // "Rs 1.85 Mn" needs ~0.45x (was floored at 0.55 -> "Rs 1.85 …").
                minScale = 0.3f,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = meta,
                style = t.caption,
                color = c.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            // Source + checked-ago footer, only where the data exists.
            if (footerText.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = footerText,
                    style = t.overline,
                    color = c.textTertiary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
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

/**
 * One quiet meta line, district FIRST so location survives narrow cells
 * (the old year-first order ellipsized the district away on 152dp cards).
 */
@Composable
private fun metaLine(l: Listing): String {
    val parts = mutableListOf<String>()
    listOfNotNull(l.district?.takeIf { it.isNotBlank() }, l.city?.takeIf { it.isNotBlank() })
        .joinToString(", ").takeIf { it.isNotBlank() }?.let { parts += it }
    l.year?.let { parts += it.toString() }
    l.mileageKm?.let { if (it > 0) parts += LkrFormat.km(it) }
    l.fuelType?.let { if (it.isNotBlank()) parts += it.replaceFirstChar(Char::uppercase) }
    l.transmission?.let { if (it.isNotBlank()) parts += it.replaceFirstChar(Char::uppercase) }
    val fallback = stringResource(R.string.v19_search_details_fallback)
    return parts.joinToString(" · ").ifBlank { fallback }
}

/** "Checked … ago" from an ISO timestamp; null when absent/unparseable. */
@Composable
private fun checkedAgoText(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    val instant = remember(iso) {
        runCatching { Instant.parse(iso) }.getOrNull()
            ?: runCatching { Instant.parse(iso.replace(' ', 'T') + "Z") }.getOrNull()
    } ?: return null
    val age = Duration.between(instant, Instant.now())
    if (age.isNegative) return null
    val hours = age.toHours()
    return when {
        hours < 1 -> stringResource(R.string.v19_search_checked_now)
        hours < 24 -> stringResource(R.string.v19_search_checked_hours, hours.toInt())
        else -> stringResource(R.string.v19_search_checked_days, (hours / 24).toInt())
    }
}

/**
 * Compact LIST row (list mode): 112×84 thumbnail + title/price/meta, matching
 * [MmListingRowSkeleton] geometry. Same asking-price and source evidence as
 * the grid card; save + compare stay reachable. No shared-element morph (the
 * grid card owns the card→Detail transition keys).
 */
@Composable
fun ListingRow(
    listing: Listing,
    isWatched: Boolean,
    onClick: () -> Unit,
    onWatchToggle: () -> Unit,
    modifier: Modifier = Modifier,
    showDeal: Boolean = true,
    compareSelected: Boolean? = null,
    compareEnabled: Boolean = true,
    onCompareToggle: (() -> Unit)? = null,
    /** Reserved for a future feed carrying publishable verdicts. */
    onWhy: (() -> Unit)? = null,
) {
    val c = MmColors.current
    val t = MmType.current
    val haptics = MmHaptics.current
    val reduced = MmMotion.reduced
    val leaseLabel = if (showDeal && remember(listing.title, listing.model) { MmLeaseTakeover.detect(listing.title, listing.model) }) stringResource(R.string.mm_lease_short) else null
    val priceText = MmPriceFormat.compact(listing.priceLkr?.takeIf { it.isFinite() }, stringResource(R.string.mm_price_on_request))
    val meta = metaLine(listing)
    val sourceText = listing.source?.takeIf { it.isNotBlank() }?.let { sourceLabel(it) }
    val agoText = checkedAgoText(listing.lastSeenAt ?: listing.scrapedAt)
    val footerText = listOfNotNull(sourceText, agoText).joinToString(" · ")
    val rowCd = listOfNotNull(listing.displayName, priceText, meta, leaseLabel, footerText.takeIf { it.isNotBlank() }).joinToString(", ")

    MmCard(
        onClick = {
            lk.motormila.app.ui.navigation.ListingPreviewCache.put(listing)
            onClick()
        },
        contentPadding = PaddingValues(0.dp),
        shape = MmShapes.md,
        modifier = modifier
            .fillMaxWidth()
            .then(
                if (compareSelected == true) Modifier.border(2.dp, c.brand, MmShapes.md) else Modifier,
            )
            .semantics(mergeDescendants = true) { contentDescription = rowCd },
    ) {
        Row(
            Modifier.padding(MmSpacing.md),
            horizontalArrangement = Arrangement.spacedBy(MmSpacing.md),
            verticalAlignment = Alignment.Top,
        ) {
            // Thumbnail (MmListingRowSkeleton geometry) with the short verdict
            // pill and the compare toggle on the photo, like the grid card.
            Box(
                Modifier
                    .size(width = 112.dp, height = 84.dp)
                    .clip(MmShapes.sm),
            ) {
                MmImage(
                    url = listing.heroImageUrl,
                    contentDescription = null,
                    modifier = Modifier.matchParentSize(),
                )
                if (compareSelected != null && onCompareToggle != null) {
                    RowCompareToggle(
                        selected = compareSelected,
                        enabled = compareEnabled || compareSelected,
                        listingName = listing.displayName,
                        onToggle = {
                            if (compareSelected) haptics.unsave() else haptics.save()
                            onCompareToggle()
                        },
                        modifier = Modifier.align(Alignment.BottomEnd),
                    )
                }
            }
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.Top) {
                    Text(
                        text = listing.displayName,
                        style = t.label.copy(fontSize = 15.sp, lineHeight = 20.sp),
                        color = c.textPrimary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    SaveButton(
                        saved = isWatched,
                        reduced = reduced,
                        onToggle = {
                            if (isWatched) haptics.unsave() else haptics.save()
                            onWatchToggle()
                        },
                        modifier = Modifier.size(48.dp),
                    )
                }
                MmFitText(
                    text = priceText,
                    style = t.priceS,
                    color = c.textPrimary,
                    minScale = 0.4f,
                )
                if (leaseLabel != null) Text(leaseLabel, style = t.caption, color = c.textSecondary)
                Spacer(Modifier.height(4.dp))
                Text(
                    text = meta,
                    style = t.caption,
                    color = c.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (footerText.isNotBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = footerText,
                        style = t.overline,
                        color = c.textTertiary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/** Icon-only compare toggle for list rows: 48dp hit box, 28dp glass disc. */
@Composable
private fun RowCompareToggle(
    selected: Boolean,
    enabled: Boolean,
    listingName: String,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    val cd = stringResource(if (selected) R.string.compare_remove_cd else R.string.compare_add_cd, listingName)
    Box(
        modifier
            .size(48.dp)
            .clip(RoundedCornerShape(percent = 50))
            .clickable(
                enabled = enabled,
                role = androidx.compose.ui.semantics.Role.Checkbox,
                onClickLabel = cd,
                onClick = onToggle,
            )
            .semantics { contentDescription = cd },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(28.dp)
                .graphicsLayer { alpha = if (enabled) 1f else 0.5f }
                .clip(RoundedCornerShape(percent = 50))
                .background(if (selected) c.brand else lk.motormila.app.ui.theme.PhotoGlassTint)
                .glassEdges(RoundedCornerShape(percent = 50), c, sheen = !selected),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (selected) Icons.Filled.Check else Icons.AutoMirrored.Filled.CompareArrows,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(14.dp),
            )
        }
    }
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
 * loading, crossfade on arrival, and a calm theme-aware vehicle-silhouette
 * plate on failure or blank URL. No image ever pops in from blank.
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

/**
 * Calm error/blank tile: theme-aware ground with a quiet vehicle silhouette
 * (was the Apex-M wordmark on hard Ink). Same plate as [MmImagePlaceholder].
 */
@Composable
private fun ListingImageErrorTile(modifier: Modifier = Modifier) {
    MmImagePlaceholder(modifier)
}
