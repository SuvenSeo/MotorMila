@file:OptIn(ExperimentalSharedTransitionApi::class)

package lk.motormila.app.ui.home

import lk.motormila.app.ui.components.fitWidth
import lk.motormila.app.ui.theme.mmTappable
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.CellTower
import androidx.compose.material.icons.outlined.ElectricCar
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.R
import lk.motormila.app.domain.model.DistrictStat
import lk.motormila.app.domain.model.HotDeal
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.TrendingModel
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.ui.components.MmCard
import lk.motormila.app.ui.components.MmDealBadge
import lk.motormila.app.ui.components.MmImage
import lk.motormila.app.ui.components.MmPriceFormat
import lk.motormila.app.ui.components.MmSheet
import lk.motormila.app.ui.components.PriceMorphResize
import lk.motormila.app.ui.components.listingCardKey
import lk.motormila.app.ui.navigation.listingHeroKey
import lk.motormila.app.ui.components.listingPriceKey
import lk.motormila.app.ui.components.listingTitleKey
import lk.motormila.app.ui.components.motormilaSharedBoundsTransform
import lk.motormila.app.ui.navigation.LocalNavAnimatedVisibilityScope
import lk.motormila.app.ui.navigation.LocalSharedTransitionScope
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmDealTone
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.mmPress
import kotlin.math.roundToInt

/*
 * Home sections, design v2.1 (v1.9.0): theme-aware, one type scale, one card
 * language. One art-directed hero moment (the featured deal photo), dot-eyebrow
 * section headers, 32dp rhythm between major sections. Rail cards register the
 * same shared-element keys as ListingCard so Home → Detail runs the flagship
 * container transform. Every number shown comes from the backend payload;
 * nothing is filled in when a value is missing.
 */

/** Small brand dot used as the section eyebrow marker. */
@Composable
private fun SectionDot(modifier: Modifier = Modifier) {
    Box(modifier.size(6.dp).clip(MmShapes.pill).background(MmColors.current.brand))
}

/**
 * Section title with a dot eyebrow + optional "See all" (brand text, 48dp
 * touch target). [eyebrow], when given, renders as an uppercase kicker above
 * the title instead of the inline dot.
 */
@Composable
fun MmSectionHeader(
    title: String,
    onSeeAll: (() -> Unit)?,
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
) {
    val c = MmColors.current
    Column(modifier.fillMaxWidth().padding(start = MmSpacing.gutter, end = 8.dp)) {
        if (eyebrow != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SectionDot()
                Spacer(Modifier.width(8.dp))
                Text(
                    eyebrow.uppercase(),
                    style = MmType.current.caption,
                    color = c.brandText,
                    letterSpacing = 0.8.sp,
                )
            }
            Spacer(Modifier.height(6.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (eyebrow == null) {
                SectionDot(Modifier.padding(top = 2.dp))
                Spacer(Modifier.width(10.dp))
            }
            Text(title, style = MmType.current.titleM, color = c.textPrimary, modifier = Modifier.weight(1f))
            if (onSeeAll != null) {
                Text(
                    stringResource(R.string.mm_see_all),
                    style = MmType.current.label,
                    color = c.brandText,
                    modifier = Modifier
                        .clip(MmShapes.pill)
                        .mmTappable(role = Role.Button, onClick = onSeeAll)
                        .padding(horizontal = 12.dp, vertical = 14.dp),
                )
            }
        }
    }
}

/** One calm card with three honest market numbers, separated by hairlines. */
@Composable
fun HomeMarketStrip(
    totalListings: Int,
    new24h: Int,
    avgPriceLkr: Double?,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    MmCard(modifier = modifier.fillMaxWidth().padding(horizontal = MmSpacing.gutter), contentPadding = PaddingValues(vertical = 16.dp)) {
        Row(Modifier.fillMaxWidth().height(androidx.compose.foundation.layout.IntrinsicSize.Min)) {
            Stat(LkrFormat.count(totalListings), stringResource(R.string.mm_stat_listed), Modifier.weight(1f))
            Divider()
            Stat(if (new24h > 0) LkrFormat.count(new24h) else "—", stringResource(R.string.mm_stat_new24h), Modifier.weight(1f))
            Divider()
            Stat(MmPriceFormat.compact(avgPriceLkr), stringResource(R.string.mm_stat_avg_asking), Modifier.weight(1f))
        }
    }
}

@Composable
private fun Divider() {
    Box(Modifier.width(1.dp).fillMaxHeight().padding(vertical = 4.dp).background(MmColors.current.outline))
}

@Composable
private fun Stat(value: String, label: String, modifier: Modifier) {
    val c = MmColors.current
    // Three numbers share one row: cap the font scale so 200% never clips
    // "90,624" to "90,62"; labels wrap to two lines instead of ellipsising.
    lk.motormila.app.ui.theme.CappedFontScale(max = 1.3f) {
        Column(modifier.padding(horizontal = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            // Capped 1.3x still clipped "1,248,2" / "Rs 125 M" on 360 dp: scale to fit.
            Text(value, style = MmType.current.priceM, color = c.textPrimary, maxLines = 1, softWrap = false, modifier = Modifier.fitWidth())
            Spacer(Modifier.height(2.dp))
            Text(
                label,
                style = MmType.current.caption,
                color = c.textTertiary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
}

/**
 * The one art-directed hero moment on Home: the best-priced listing as a
 * large photo card with its verdict badge and a scrim caption (photo-forward,
 * web parity). Registers the ListingCard shared keys so tapping it runs the
 * card → Detail container transform.
 */
@Composable
fun HomeFeaturedDeal(
    deal: HotDeal,
    onClick: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    val t = MmType.current
    val pct = deal.dealScore.roundToInt()
    val tone = dealTone(pct)
    val title = listOfNotNull(deal.make, deal.model).joinToString(" ")
    val meta = listOfNotNull(deal.year?.toString(), deal.district).joinToString(" · ")
    Column(modifier.fillMaxWidth().padding(horizontal = MmSpacing.gutter)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionDot()
            Spacer(Modifier.width(8.dp))
            Text(
                stringResource(R.string.v19_home_featured_eyebrow).uppercase(),
                style = t.caption,
                color = c.brandText,
                letterSpacing = 0.8.sp,
            )
        }
        Spacer(Modifier.height(10.dp))
        MmCard(
            onClick = { onClick(deal.id) },
            contentPadding = PaddingValues(0.dp),
            modifier = Modifier
                .fillMaxWidth()
                .then(rememberListingCardShared(deal.id)),
        ) {
            Box(Modifier.fillMaxWidth().aspectRatio(16f / 10f)) {
                MmImage(
                    deal.thumbnailUrl,
                    contentDescription = title,
                    modifier = Modifier
                        .matchParentSize()
                        .then(rememberListingHeroShared(deal.id)),
                )
                if (pct >= 5) {
                    MmDealBadge(
                        stringResource(R.string.mm_pct_below_typical, pct),
                        tone,
                        onImage = true,
                        modifier = Modifier.align(Alignment.TopStart).padding(12.dp),
                    )
                }
                // Scrim caption: white type stays AA over any photo.
                Column(
                    Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                listOf(Color.Transparent, Color(0xB30B0B0F), Color(0xE60B0B0F)),
                            ),
                        )
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                ) {
                    Text(title, style = t.titleS, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(4.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(MmPriceFormat.compact(deal.priceLkr), style = t.priceM, color = Color.White, maxLines = 1)
                        if (meta.isNotBlank()) {
                            Text(
                                meta,
                                style = t.caption,
                                color = Color.White.copy(alpha = 0.78f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f, fill = false),
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun dealTone(pct: Int): MmDealTone = when {
    pct >= 15 -> MmDealTone.GREAT
    pct >= 5 -> MmDealTone.GOOD
    else -> MmDealTone.FAIR
}

private data class Shortcut(val title: String, val icon: ImageVector, val cd: String, val onClick: () -> Unit)

/**
 * Shortcut row, v1.9.0: four primary tiles (Best picks, Price index,
 * Calculator, EV hub) plus a quiet "More" overflow that opens a sheet with
 * the secondary tools (Market pulse, Permits). Calmer than the old 3×2 grid
 * of six equal-weight tiles.
 */
@Composable
fun HomeShortcutGrid(
    onBestPicksClick: () -> Unit,
    onPriceIndexClick: () -> Unit,
    onCalculatorClick: () -> Unit,
    onEvHubClick: () -> Unit,
    onPulseClick: () -> Unit,
    onPermitsClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    val primary = listOf(
        Shortcut(stringResource(R.string.hub_picks_title), Icons.Outlined.StarOutline, stringResource(R.string.hub_open_picks), onBestPicksClick),
        Shortcut(stringResource(R.string.hub_index_title), Icons.AutoMirrored.Outlined.TrendingUp, stringResource(R.string.hub_open_index), onPriceIndexClick),
        Shortcut(stringResource(R.string.hub_calc_title), Icons.Outlined.Calculate, stringResource(R.string.hub_open_calc), onCalculatorClick),
        Shortcut(stringResource(R.string.hub_ev_title), Icons.Outlined.ElectricCar, stringResource(R.string.hub_open_ev), onEvHubClick),
    )
    val overflow = listOf(
        Shortcut(stringResource(R.string.hub_pulse_title), Icons.Outlined.CellTower, stringResource(R.string.hub_open_pulse), onPulseClick),
        Shortcut(stringResource(R.string.hub_permits_title), Icons.Outlined.Verified, stringResource(R.string.hub_open_permits), onPermitsClick),
    )
    var showMore by remember { mutableStateOf(false) }
    Column(modifier.fillMaxWidth().padding(horizontal = MmSpacing.gutter), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // Equal-height tiles even when one title wraps to two lines.
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.height(androidx.compose.foundation.layout.IntrinsicSize.Min),
        ) {
            primary.forEach { s -> ShortcutTile(s, Modifier.weight(1f).fillMaxHeight()) }
        }
        val moreCd = stringResource(R.string.v19_home_more_cd)
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = MmSpacing.touch)
                .clip(MmShapes.md)
                .mmTappable(role = Role.Button, onClickLabel = moreCd) { showMore = true }
                .padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.MoreVert, contentDescription = null, tint = c.textSecondary, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.v19_home_more), style = MmType.current.label, color = c.textSecondary)
            Spacer(Modifier.weight(1f))
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = c.textTertiary, modifier = Modifier.size(20.dp))
        }
    }
    if (showMore) {
        MmSheet(
            onDismissRequest = { showMore = false },
            title = stringResource(R.string.v19_home_more_title),
        ) {
            overflow.forEach { s ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .mmTappable(role = Role.Button, onClickLabel = s.cd, pressedScale = 1f) {
                            showMore = false
                            s.onClick()
                        }
                        .padding(horizontal = MmSpacing.gutter, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(40.dp).clip(MmShapes.pill).background(c.brandContainer),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(s.icon, contentDescription = null, tint = c.onBrandContainer, modifier = Modifier.size(21.dp))
                    }
                    Spacer(Modifier.width(14.dp))
                    Text(s.title, style = MmType.current.bodyM, color = c.textPrimary)
                }
            }
        }
    }
}

@Composable
private fun ShortcutTile(s: Shortcut, modifier: Modifier) {
    val c = MmColors.current
    val press = remember { MutableInteractionSource() }
    Column(
        modifier
            .mmPress(press)
            .clip(MmShapes.md)
            .background(c.surface)
            .clickable(interactionSource = press, indication = null, role = Role.Button, onClickLabel = s.cd, onClick = s.onClick)
            .padding(vertical = 14.dp, horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(40.dp).clip(MmShapes.pill).background(c.brandContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(s.icon, contentDescription = null, tint = c.onBrandContainer, modifier = Modifier.size(21.dp))
        }
        Spacer(Modifier.height(8.dp))
        // Two centred lines (Sinhala/Tamil titles and 200 % text no longer cut
        // to "හොඳම තෝරා…"); scale capped like other fixed tiles.
        lk.motormila.app.ui.theme.CappedFontScale(max = 1.3f) {
            Text(
                s.title,
                style = MmType.current.labelS,
                color = c.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
}

/** Horizontal rail of best-priced listings: photo, deal badge on image, price in millions. */
@Composable
fun HomeDealRail(deals: List<HotDeal>, onClick: (Int) -> Unit) {
    // Responsive rail: phone peek width (212dp, unchanged) up to 480dp wide;
    // wider screens scale the card instead of wasting width on a fixed card.
    BoxWithConstraints {
        val cardWidth = if (maxWidth <= 480.dp) 212.dp else (maxWidth * 0.42f).coerceAtMost(320.dp)
        LazyRow(
        contentPadding = PaddingValues(horizontal = MmSpacing.gutter),
        horizontalArrangement = Arrangement.spacedBy(MmSpacing.cardGap),
    ) {
        items(deals, key = { it.id }) { d ->
            val pct = d.dealScore.roundToInt()
            RailCard(
                listingId = d.id,
                imageUrl = d.thumbnailUrl,
                title = listOfNotNull(d.make, d.model).joinToString(" "),
                price = MmPriceFormat.compact(d.priceLkr),
                meta = listOfNotNull(d.year?.toString(), d.district).joinToString(" · "),
                badge = if (pct >= 5) stringResource(R.string.mm_pct_below_typical, pct) else null,
                tone = dealTone(pct),
                width = cardWidth,
                onClick = { onClick(d.id) },
            )
        }
        }
    }
}

/** Rail of recorded price cuts: new price + "↓ x%" in the good-deal tone. */
@Composable
fun HomeDropRail(drops: List<PriceDrop>, onClick: (Int) -> Unit) {
    BoxWithConstraints {
        val cardWidth = if (maxWidth <= 480.dp) 212.dp else (maxWidth * 0.42f).coerceAtMost(320.dp)
        LazyRow(
        contentPadding = PaddingValues(horizontal = MmSpacing.gutter),
        horizontalArrangement = Arrangement.spacedBy(MmSpacing.cardGap),
    ) {
        items(drops, key = { it.listing.id }) { d ->
            RailCard(
                listingId = d.listing.id,
                imageUrl = d.listing.heroImageUrl,
                title = d.listing.displayName,
                price = MmPriceFormat.compact(d.newPriceLkr),
                meta = stringResource(R.string.mm_was_price, MmPriceFormat.compact(d.previousPriceLkr)),
                badge = "↓ ${"%.1f".format(d.dropPct)}%",
                tone = MmDealTone.GOOD,
                width = cardWidth,
                onClick = { onClick(d.listing.id) },
            )
        }
        }
    }
}

/**
 * Rail card with the flagship card → Detail morph: the same shared keys as
 * [lk.motormila.app.ui.components.ListingCard] (hero photo sharedElement,
 * card container / price / title sharedBounds). Detail carries the matching
 * bounds when opened with fromCard = true.
 */
@Composable
private fun RailCard(
    listingId: Int,
    imageUrl: String?,
    title: String,
    price: String,
    meta: String,
    badge: String?,
    tone: MmDealTone,
    onClick: () -> Unit,
    width: androidx.compose.ui.unit.Dp = 212.dp,
) {
    val c = MmColors.current
    MmCard(
        modifier = Modifier.width(width).then(rememberListingCardShared(listingId)),
        onClick = onClick,
        contentPadding = PaddingValues(0.dp),
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f)) {
            MmImage(
                imageUrl,
                contentDescription = title,
                modifier = Modifier.matchParentSize().then(rememberListingHeroShared(listingId)),
            )
            if (badge != null) {
                MmDealBadge(badge, tone, onImage = true, modifier = Modifier.align(Alignment.TopStart).padding(10.dp))
            }
        }
        Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Text(
                title,
                style = MmType.current.titleS,
                color = c.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.then(rememberListingTitleShared(listingId)),
            )
            Spacer(Modifier.height(4.dp))
            Text(
                price,
                style = MmType.current.priceM,
                color = c.textPrimary,
                maxLines = 1,
                modifier = Modifier.then(rememberListingPriceShared(listingId)),
            )
            if (meta.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(meta, style = MmType.current.caption, color = c.textTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

// ── Shared-transition wiring (mirrors ListingCard; keys live in ListingCard.kt) ──

/** Card container sharedBounds — the card → Detail container transform. */
@Composable
private fun rememberListingCardShared(listingId: Int): Modifier {
    val sharedScope = LocalSharedTransitionScope.current ?: return Modifier
    val animatedScope = LocalNavAnimatedVisibilityScope.current ?: return Modifier
    return with(sharedScope) {
        Modifier.sharedBounds(
            rememberSharedContentState(key = listingCardKey(listingId)),
            animatedScope,
            // Same fade-through as ListingCard: content leaves fast on open
            // and returns only once the page has mostly shrunk into the card.
            enter = fadeIn(tween(200, delayMillis = 140, easing = MmMotion.Standard)),
            exit = fadeOut(tween(90, easing = MmMotion.Exit)),
            boundsTransform = motormilaSharedBoundsTransform(),
            clipInOverlayDuringTransition = OverlayClip(MmShapes.lg),
        )
    }
}

/** Hero photo sharedElement — card photo → Detail gallery. */
@Composable
private fun rememberListingHeroShared(listingId: Int): Modifier {
    val sharedScope = LocalSharedTransitionScope.current ?: return Modifier
    val animatedScope = LocalNavAnimatedVisibilityScope.current ?: return Modifier
    return with(sharedScope) {
        Modifier.sharedElement(
            rememberSharedContentState(key = listingHeroKey(listingId)),
            animatedScope,
            boundsTransform = motormilaSharedBoundsTransform(),
        )
    }
}

/** Price text sharedBounds (height-scaled morph, same as ListingCard). */
@Composable
private fun rememberListingPriceShared(listingId: Int): Modifier {
    val sharedScope = LocalSharedTransitionScope.current ?: return Modifier
    val animatedScope = LocalNavAnimatedVisibilityScope.current ?: return Modifier
    return with(sharedScope) {
        Modifier.sharedBounds(
            rememberSharedContentState(key = listingPriceKey(listingId)),
            animatedScope,
            boundsTransform = motormilaSharedBoundsTransform(),
            resizeMode = PriceMorphResize,
        )
    }
}

/** Title text sharedBounds. */
@Composable
private fun rememberListingTitleShared(listingId: Int): Modifier {
    val sharedScope = LocalSharedTransitionScope.current ?: return Modifier
    val animatedScope = LocalNavAnimatedVisibilityScope.current ?: return Modifier
    return with(sharedScope) {
        Modifier.sharedBounds(
            rememberSharedContentState(key = listingTitleKey(listingId)),
            animatedScope,
            boundsTransform = motormilaSharedBoundsTransform(),
        )
    }
}

/** Trending models as a grouped list card (iOS-settings rhythm). */
@Composable
fun HomeTrendingList(models: List<TrendingModel>, onClick: (TrendingModel) -> Unit) {
    val c = MmColors.current
    MmCard(modifier = Modifier.fillMaxWidth().padding(horizontal = MmSpacing.gutter), contentPadding = PaddingValues(0.dp)) {
        models.forEachIndexed { i, m ->
            if (i > 0) Box(Modifier.padding(start = 60.dp).fillMaxWidth().height(1.dp).background(c.outline))
            Row(
                Modifier
                    .fillMaxWidth()
                    .mmTappable(role = Role.Button, pressedScale = 1f) { onClick(m) }
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(32.dp).clip(MmShapes.pill).background(c.surfaceHigh),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("${i + 1}", style = MmType.current.labelS, color = c.textSecondary)
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("${m.make} ${m.model}", style = MmType.current.label, color = c.textPrimary, maxLines = 1)
                    Text(
                        stringResource(R.string.mm_listed_count, LkrFormat.count(m.listingCount)),
                        style = MmType.current.caption,
                        color = c.textTertiary,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(MmPriceFormat.compact(m.avgPriceLkr), style = MmType.current.priceS, color = c.textPrimary)
                    m.movementPct?.let { mv ->
                        val up = mv > 0
                        Text(
                            (if (up) "↑ " else if (mv < 0) "↓ " else "") + "%.1f%%".format(kotlin.math.abs(mv)),
                            style = MmType.current.caption,
                            color = if (up) c.dealHigh else c.dealGood,
                        )
                    }
                }
            }
        }
    }
}

/** District pills: name, typical asking price, count. */
@Composable
fun HomeDistrictRail(districts: List<DistrictStat>, onClick: (String) -> Unit) {
    val c = MmColors.current
    LazyRow(
        contentPadding = PaddingValues(horizontal = MmSpacing.gutter),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(districts, key = { it.district }) { d ->
            val press = remember { MutableInteractionSource() }
            Column(
                Modifier
                    .mmPress(press)
                    .clip(MmShapes.md)
                    .background(c.surface)
                    .clickable(interactionSource = press, indication = null, role = Role.Button) { onClick(d.district) }
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                Text(d.district, style = MmType.current.label, color = c.textPrimary)
                Spacer(Modifier.height(2.dp))
                Text(MmPriceFormat.compact(d.medianPriceLkr), style = MmType.current.priceS, color = c.textPrimary)
                Text(
                    stringResource(R.string.mm_listed_count, LkrFormat.count(d.count)),
                    style = MmType.current.caption,
                    color = c.textTertiary,
                )
            }
        }
    }
}
