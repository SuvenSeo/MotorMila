package lk.motormila.app.ui.home

import lk.motormila.app.ui.theme.mmTappable
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.CellTower
import androidx.compose.material.icons.outlined.ElectricCar
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
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
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmDealTone
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.mmPress
import kotlin.math.roundToInt

/*
 * Home sections, design v2: theme-aware (no hard-coded dark colours), one
 * type scale, one card language. Every number shown comes from the backend
 * payload; nothing is filled in when a value is missing.
 */

/** Section title + optional "See all" (brand text, 48dp touch target). */
@Composable
fun MmSectionHeader(title: String, onSeeAll: (() -> Unit)?, modifier: Modifier = Modifier) {
    val c = MmColors.current
    Row(
        modifier.fillMaxWidth().padding(start = MmSpacing.gutter, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
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
            Text(value, style = MmType.current.priceM, color = c.textPrimary, maxLines = 1, softWrap = false)
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

private data class Shortcut(val title: String, val icon: ImageVector, val cd: String, val onClick: () -> Unit)

/** 3×2 grid of quiet shortcut tiles (icon in a tinted circle + one-word title). */
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
    val items = listOf(
        Shortcut(stringResource(R.string.hub_picks_title), Icons.Outlined.StarOutline, stringResource(R.string.hub_open_picks), onBestPicksClick),
        Shortcut(stringResource(R.string.hub_index_title), Icons.AutoMirrored.Outlined.TrendingUp, stringResource(R.string.hub_open_index), onPriceIndexClick),
        Shortcut(stringResource(R.string.hub_calc_title), Icons.Outlined.Calculate, stringResource(R.string.hub_open_calc), onCalculatorClick),
        Shortcut(stringResource(R.string.hub_ev_title), Icons.Outlined.ElectricCar, stringResource(R.string.hub_open_ev), onEvHubClick),
        Shortcut(stringResource(R.string.hub_pulse_title), Icons.Outlined.CellTower, stringResource(R.string.hub_open_pulse), onPulseClick),
        Shortcut(stringResource(R.string.hub_permits_title), Icons.Outlined.Verified, stringResource(R.string.hub_open_permits), onPermitsClick),
    )
    Column(modifier.fillMaxWidth().padding(horizontal = MmSpacing.gutter), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items.chunked(3).forEach { row ->
            // Equal-height tiles even when one title wraps to two lines.
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.height(androidx.compose.foundation.layout.IntrinsicSize.Min),
            ) {
                row.forEach { s -> ShortcutTile(s, Modifier.weight(1f).fillMaxHeight()) }
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
        // to "හොඳම තෝරා…" / "Best p…"); scale capped like other fixed tiles.
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
    LazyRow(
        contentPadding = PaddingValues(horizontal = MmSpacing.gutter),
        horizontalArrangement = Arrangement.spacedBy(MmSpacing.cardGap),
    ) {
        items(deals, key = { it.id }) { d ->
            val pct = d.dealScore.roundToInt()
            val tone = when {
                pct >= 15 -> MmDealTone.GREAT
                pct >= 5 -> MmDealTone.GOOD
                else -> MmDealTone.FAIR
            }
            RailCard(
                imageUrl = d.thumbnailUrl,
                title = listOfNotNull(d.make, d.model).joinToString(" "),
                price = MmPriceFormat.compact(d.priceLkr),
                meta = listOfNotNull(d.year?.toString(), d.district).joinToString(" · "),
                badge = if (pct >= 5) stringResource(R.string.mm_pct_below_typical, pct) else null,
                tone = tone,
                onClick = { onClick(d.id) },
            )
        }
    }
}

/** Rail of recorded price cuts: new price + "↓ x%" in the good-deal tone. */
@Composable
fun HomeDropRail(drops: List<PriceDrop>, onClick: (Int) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = MmSpacing.gutter),
        horizontalArrangement = Arrangement.spacedBy(MmSpacing.cardGap),
    ) {
        items(drops, key = { it.listing.id }) { d ->
            RailCard(
                imageUrl = d.listing.heroImageUrl,
                title = d.listing.displayName,
                price = MmPriceFormat.compact(d.newPriceLkr),
                meta = stringResource(R.string.mm_was_price, MmPriceFormat.compact(d.previousPriceLkr)),
                badge = "↓ ${"%.1f".format(d.dropPct)}%",
                tone = MmDealTone.GOOD,
                onClick = { onClick(d.listing.id) },
            )
        }
    }
}

@Composable
private fun RailCard(
    imageUrl: String?,
    title: String,
    price: String,
    meta: String,
    badge: String?,
    tone: MmDealTone,
    onClick: () -> Unit,
) {
    val c = MmColors.current
    MmCard(modifier = Modifier.width(212.dp), onClick = onClick, contentPadding = PaddingValues(0.dp)) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f)) {
            MmImage(imageUrl, contentDescription = title, modifier = Modifier.matchParentSize())
            if (badge != null) {
                MmDealBadge(badge, tone, onImage = true, modifier = Modifier.align(Alignment.TopStart).padding(10.dp))
            }
        }
        Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Text(title, style = MmType.current.titleS, color = c.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(4.dp))
            Text(price, style = MmType.current.priceM, color = c.textPrimary, maxLines = 1)
            if (meta.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(meta, style = MmType.current.caption, color = c.textTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
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
