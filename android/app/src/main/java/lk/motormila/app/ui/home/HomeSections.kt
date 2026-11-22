@file:OptIn(ExperimentalSharedTransitionApi::class)

package lk.motormila.app.ui.home

import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.WatchItem
import lk.motormila.app.ui.components.MmCard
import lk.motormila.app.ui.components.MmImage
import lk.motormila.app.ui.components.PriceMorphResize
import lk.motormila.app.ui.components.listingCardKey
import lk.motormila.app.ui.components.listingPriceKey
import lk.motormila.app.ui.components.listingTitleKey
import lk.motormila.app.ui.components.motormilaSharedBoundsTransform
import lk.motormila.app.ui.navigation.LocalNavAnimatedVisibilityScope
import lk.motormila.app.ui.navigation.LocalSharedTransitionScope
import lk.motormila.app.ui.navigation.listingHeroKey
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType

@Composable
private fun rupees(value: Double): String = stringResource(R.string.buyer_home_rupees, LkrFormat.group(value))

@Composable
internal fun SavedVehicleSection(item: WatchItem, onListingClick: (Int) -> Unit) {
    val previous = item.savedDropBaseline()
    BuyerVehicleEntry(
        section = stringResource(if (previous == null) R.string.buyer_home_saved else R.string.buyer_home_saved_drop),
        id = item.listingId,
        title = item.title.ifBlank { stringResource(R.string.buyer_home_listing_id, item.listingId) },
        image = item.thumbnailUrl,
        meta = item.district.orEmpty(),
        askLabel = stringResource(R.string.buyer_home_last_ask),
        ask = item.priceLkr.realAsk(),
        previous = previous?.let { stringResource(R.string.buyer_home_at_save, rupees(it)) },
        onClick = onListingClick,
    )
}

@Composable
internal fun RecordedDropSection(drop: PriceDrop, onListingClick: (Int) -> Unit) {
    val listing = drop.listing
    val locale = LocalConfiguration.current.locales[0] ?: java.util.Locale.getDefault()
    val date = drop.recordedDate()?.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale))
    BuyerVehicleEntry(
        section = stringResource(R.string.buyer_home_recorded_drop),
        id = listing.id,
        title = listing.displayName.trim(),
        image = listing.heroImageUrl,
        meta = listOfNotNull(listing.city?.takeIf { it.isNotBlank() } ?: listing.district,
            listing.source, date).filter { it.isNotBlank() }.joinToString(" · "),
        askLabel = stringResource(R.string.buyer_home_after_cut),
        ask = drop.newPriceLkr,
        previous = stringResource(R.string.buyer_home_previous_ask, rupees(drop.previousPriceLkr)),
        onClick = onListingClick,
    )
}

/** Text gets the full card width. Currency, place and provenance can each wrap at 200%. */
@Composable
private fun BuyerVehicleEntry(
    section: String, id: Int, title: String, image: String?, meta: String,
    askLabel: String, ask: Double?, previous: String?, onClick: (Int) -> Unit,
) {
    val t = MmType.current
    val c = MmColors.current
    Column(Modifier.fillMaxWidth().padding(horizontal = MmSpacing.gutter),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(section, style = t.titleL, color = c.textPrimary, modifier = Modifier.semantics { heading() })
        MmCard(modifier = Modifier.fillMaxWidth().then(rememberListingCardShared(id)),
            onClick = { onClick(id) }, onClickLabel = stringResource(R.string.buyer_home_open_listing),
            contentPadding = PaddingValues(0.dp)) {
            if (!image.isNullOrBlank()) {
                MmImage(image, contentDescription = null,
                    modifier = Modifier.fillMaxWidth().height(112.dp).then(rememberListingHeroShared(id)))
            }
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(title, style = t.titleM, color = c.textPrimary,
                        modifier = Modifier.weight(1f).then(rememberListingTitleShared(id)))
                    Icon(Icons.Filled.ChevronRight, null, tint = c.brandText, modifier = Modifier.size(22.dp))
                }
                if (meta.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(meta, style = t.bodyS, color = c.textSecondary)
                }
                Spacer(Modifier.height(12.dp))
                if (ask != null) {
                    Text(askLabel, style = t.bodyS, color = c.textSecondary)
                    Text(rupees(ask), style = t.priceM, color = c.textPrimary, modifier = rememberListingPriceShared(id))
                } else {
                    Text(stringResource(R.string.buyer_home_no_ask), style = t.bodyL, color = c.textPrimary)
                }
                if (previous != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(previous, style = t.bodyM, color = c.textSecondary)
                }
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
