@file:OptIn(ExperimentalSharedTransitionApi::class)

package lk.motormila.app.ui.components

import androidx.compose.animation.togetherWith
import androidx.compose.animation.animateContentSize
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.boundsInRoot
import lk.motormila.app.ui.theme.glassEdges
import lk.motormila.app.ui.theme.mmPress
import androidx.compose.animation.BoundsTransform
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.ui.res.stringResource
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmDealTone
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.clearAndSetSemantics
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
import lk.motormila.app.ui.theme.deal
import lk.motormila.app.ui.theme.MotormilaBad
import lk.motormila.app.ui.theme.MotormilaGoodContainer
import lk.motormila.app.ui.theme.MotormilaGoodSoft
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurfaceHigh
import lk.motormila.app.ui.theme.fluidSpring
import java.time.Duration
import java.time.Instant

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
    /** Opens the verdict explanation sheet (same Why sheet Detail uses). Null = badge is decorative. */
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
    // The one price verdict from the row (same rules as the detail screen).
    val verdict = remember(listing.id, listing.priceLkr, listing.marketMedianLkr, listing.title, listing.model) {
        MmDealVerdict.from(
            listing.rowVerdict(),
            isLeaseTakeover = MmLeaseTakeover.detect(listing.title, listing.model),
        )
    }
    val isPro = LocalIsPro.current
    val priceText = MmPriceFormat.compact(listing.priceLkr, stringResource(R.string.mm_price_on_request))
    // Evidence layer: typical-price anchor + market position + source/checked-ago.
    val typicalLkr = listing.marketMedianLkr?.takeIf { it > 0 }
    val typicalText = if (typicalLkr != null) {
        stringResource(R.string.v19_search_typical_price, MmPriceFormat.compact(typicalLkr))
    } else {
        null
    }
    val meta = metaLine(listing)
    val sourceText = listing.source?.takeIf { it.isNotBlank() }?.let { sourceLabel(it) }
    val agoText = checkedAgoText(listing.lastSeenAt ?: listing.scrapedAt)
    val footerText = listOfNotNull(sourceText, agoText).joinToString(" · ")
    val verdictLabel = if (showDeal) verdict.label() else null
    val lockedBadge = showDeal && verdictLabel == null && !isPro &&
        listing.dealBand() == DealBand.LOCKED && listing.priceLkr != null
    // ONE composed description (name + price + verdict + typical + meta) so
    // TalkBack reads the card once, verdict included — not name+price twice.
    val cardCd = composeListingCd(listing.displayName, priceText, verdictLabel, typicalText, meta, lockedBadge)

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
                    .aspectRatio(16f / 10f)
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
                minLines = 2,
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
            // Deal verdict sits cleanly under the price (web parity), keeping photography uncluttered.
            if (showDeal) {
                if (verdictLabel != null) {
                    Spacer(Modifier.height(6.dp))
                    MmDealBadge(
                        label = if (verdict.kind == MmDealVerdict.Kind.LEASE) stringResource(R.string.mm_lease_short) else verdictLabel,
                        tone = verdict.tone,
                        onImage = false,
                        onWhy = onWhy,
                        modifier = Modifier
                            .then(if (onWhy == null) Modifier.clearAndSetSemantics { } else Modifier),
                    )
                } else if (lockedBadge) {
                    Spacer(Modifier.height(6.dp))
                    MmDealBadge(
                        band = DealBand.LOCKED,
                        onImage = false,
                        onWhy = onWhy,
                        modifier = Modifier
                            .then(if (onWhy == null) Modifier.clearAndSetSemantics { } else Modifier),
                    )
                }
            }
            // Evidence layer (web parity): the typical-price anchor the verdict
            // argues from, plus a thin market-position bar. Quiet, not a shout.
            if (typicalText != null) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = typicalText,
                    style = t.caption,
                    color = c.textTertiary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                val asking = listing.priceLkr
                if (asking != null && asking > 0 && typicalLkr != null) {
                    Spacer(Modifier.height(4.dp))
                    MarketPositionBar(
                        askingLkr = asking,
                        typicalLkr = typicalLkr,
                        tone = verdict.tone,
                    )
                }
            }
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

/**
 * One quiet meta line, district FIRST so location survives narrow cells
 * (the old year-first order ellipsized the district away on 152dp cards).
 */
@Composable
private fun metaLine(l: Listing): String {
    val parts = mutableListOf<String>()
    l.year?.let { parts += it.toString() }
    listOfNotNull(l.district?.takeIf { it.isNotBlank() }, l.city?.takeIf { it.isNotBlank() })
        .joinToString(", ").takeIf { it.isNotBlank() }?.let { parts += it }
    l.mileageKm?.let { if (it > 0) parts += LkrFormat.km(it) }
    l.fuelType?.let { if (it.isNotBlank()) parts += it.replaceFirstChar(Char::uppercase) }
    l.transmission?.let { if (it.isNotBlank()) parts += it.replaceFirstChar(Char::uppercase) }
    val fallback = stringResource(R.string.v19_search_details_fallback)
    return parts.joinToString(" · ").ifBlank { fallback }
}

/** One composed card description: name, price, verdict, typical anchor, meta. */
@Composable
private fun composeListingCd(
    name: String,
    priceText: String,
    verdictLabel: String?,
    typicalText: String?,
    meta: String,
    lockedBadge: Boolean,
): String {
    val lockedLabel = if (lockedBadge && verdictLabel == null) stringResource(R.string.mm_deal_locked) else null
    return buildString {
        append(name)
        append(", ")
        append(priceText)
        if (verdictLabel != null) {
            append(", ")
            append(verdictLabel)
        } else if (lockedLabel != null) {
            append(", ")
            append(lockedLabel)
        }
        if (typicalText != null) {
            append(", ")
            append(typicalText)
        }
        append(", ")
        append(meta)
    }
}

/**
 * Thin market-position bar: the asking price's position against the typical
 * asking price (centre tick), on a quiet 0.6×–1.4× typical scale. Decorative —
 * the card's composed description carries the numbers for screen readers.
 */
@Composable
private fun MarketPositionBar(
    askingLkr: Double,
    typicalLkr: Double,
    tone: MmDealTone,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    val accent = c.deal(tone).solid
    val track = c.surfaceHigh
    val tick = c.textTertiary
    val fraction = ((askingLkr / typicalLkr - 0.6) / 0.8).coerceIn(0.0, 1.0).toFloat()
    Canvas(
        modifier
            .fillMaxWidth()
            .height(6.dp)
            .clearAndSetSemantics { },
    ) {
        val r = size.height / 2f
        drawRoundRect(track, cornerRadius = CornerRadius(r, r))
        // Typical-price anchor at the centre.
        drawLine(
            tick,
            Offset(size.width / 2f, 0f),
            Offset(size.width / 2f, size.height),
            strokeWidth = 1.5.dp.toPx(),
        )
        // Asking-price marker.
        val x = r + fraction * (size.width - 2f * r)
        drawCircle(accent, radius = r, center = Offset(x, size.height / 2f))
    }
}

/** Short verdict label for compact list rows (the full sentence is too wide for a 112dp thumb). */
@Composable
private fun MmDealVerdict.shortLabel(): String? = when (kind) {
    MmDealVerdict.Kind.BELOW -> stringResource(R.string.mm_badge_below, pct)
    MmDealVerdict.Kind.ABOVE -> stringResource(R.string.mm_badge_above, pct)
    MmDealVerdict.Kind.FAIR -> stringResource(R.string.mm_deal_fair)
    MmDealVerdict.Kind.VERIFY -> stringResource(R.string.v19_search_deal_verify_short)
    MmDealVerdict.Kind.LEASE -> stringResource(R.string.mm_lease_short)
    MmDealVerdict.Kind.NONE -> null
}

/** "Checked … ago" from an ISO timestamp; null when absent/unparseable. */
@Composable
private fun checkedAgoText(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    val instant = remember(iso) {
        runCatching { Instant.parse(iso) }.getOrNull()
            ?: runCatching { Instant.parse(iso.replace(' ', 'T') + "Z") }.getOrNull()
    } ?: return null
    val hours = Duration.between(instant, Instant.now()).toHours()
    return when {
        hours < 1 -> stringResource(R.string.v19_search_checked_now)
        hours < 24 -> stringResource(R.string.v19_search_checked_hours, hours.toInt())
        else -> stringResource(R.string.v19_search_checked_days, (hours / 24).toInt())
    }
}

/**
 * Compact LIST row (list mode): 112×84 thumbnail + title/price/meta, matching
 * [MmListingRowSkeleton] geometry. Same evidence layer and tappable verdict as
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
    /** Opens the verdict explanation sheet (same Why sheet Detail uses). */
    onWhy: (() -> Unit)? = null,
) {
    val c = MmColors.current
    val t = MmType.current
    val haptics = MmHaptics.current
    val reduced = MmMotion.reduced
    val verdict = remember(listing.id, listing.priceLkr, listing.marketMedianLkr, listing.title, listing.model) {
        MmDealVerdict.from(
            listing.rowVerdict(),
            isLeaseTakeover = MmLeaseTakeover.detect(listing.title, listing.model),
        )
    }
    val isPro = LocalIsPro.current
    val priceText = MmPriceFormat.compact(listing.priceLkr, stringResource(R.string.mm_price_on_request))
    val typicalLkr = listing.marketMedianLkr?.takeIf { it > 0 }
    val typicalText = if (typicalLkr != null) {
        stringResource(R.string.v19_search_typical_price, MmPriceFormat.compact(typicalLkr))
    } else {
        null
    }
    val meta = metaLine(listing)
    val sourceText = listing.source?.takeIf { it.isNotBlank() }?.let { sourceLabel(it) }
    val agoText = checkedAgoText(listing.lastSeenAt ?: listing.scrapedAt)
    val footerText = listOfNotNull(sourceText, agoText).joinToString(" · ")
    val verdictLabel = if (showDeal) verdict.label() else null
    val shortLabel = if (showDeal) verdict.shortLabel() else null
    val lockedBadge = showDeal && shortLabel == null && !isPro &&
        listing.dealBand() == DealBand.LOCKED && listing.priceLkr != null
    val rowCd = composeListingCd(listing.displayName, priceText, verdictLabel, typicalText, meta, lockedBadge)

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
                if (shortLabel != null) {
                    MmDealBadge(
                        label = shortLabel,
                        tone = verdict.tone,
                        onImage = true,
                        onWhy = onWhy,
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(4.dp)
                            .then(if (onWhy == null) Modifier.clearAndSetSemantics { } else Modifier),
                    )
                } else if (lockedBadge) {
                    MmDealBadge(
                        band = DealBand.LOCKED,
                        onImage = true,
                        onWhy = onWhy,
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(4.dp)
                            .then(if (onWhy == null) Modifier.clearAndSetSemantics { } else Modifier),
                    )
                }
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
                if (typicalText != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = typicalText,
                        style = t.caption,
                        color = c.textTertiary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val asking = listing.priceLkr
                    if (asking != null && asking > 0 && typicalLkr != null) {
                        Spacer(Modifier.height(4.dp))
                        MarketPositionBar(askingLkr = asking, typicalLkr = typicalLkr, tone = verdict.tone)
                    }
                }
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
