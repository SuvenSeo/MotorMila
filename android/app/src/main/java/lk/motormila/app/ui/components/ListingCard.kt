@file:OptIn(ExperimentalSharedTransitionApi::class)

package lk.motormila.app.ui.components

import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.domain.model.DealBand
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.ui.navigation.LocalNavAnimatedVisibilityScope
import lk.motormila.app.ui.navigation.LocalSharedTransitionScope
import lk.motormila.app.ui.navigation.listingHeroKey
import lk.motormila.app.ui.theme.MotormilaBad
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.fluidSpring

/**
 * 28dp card, 16:10 Coil image, source badge, 48dp heart with burst scale,
 * mono price + delta chip, [DealBadge]/[DealRing], meta line.
 * Press scale 0.97. Hero image uses shared-element transitions when the
 * navigation graph provides [LocalSharedTransitionScope].
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
    val reducedMotion = rememberReducedMotion()
    val haptics = LocalHapticFeedback.current
    val watchScale by animateFloatAsState(
        targetValue = if (isWatched) 1.15f else 1f,
        animationSpec = fluidSpring(),
        label = "heart-burst",
    )
    val band = listing.dealBand()
    val delta = listing.deltaVsMedianPct()
    val sharedScope = LocalSharedTransitionScope.current
    val animatedScope = LocalNavAnimatedVisibilityScope.current
    val heroShared = if (sharedScope != null && animatedScope != null) {
        with(sharedScope) {
            Modifier.sharedElement(
                rememberSharedContentState(key = listingHeroKey(listing.id)),
                animatedScope,
            )
        }
    } else {
        sharedElementModifier
    }

    MotormilaGlass(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = "${listing.displayName}, ${listing.formattedPrice()}" },
    ) {
        Column {
            Box {
                AsyncImage(
                    model = listing.heroImageUrl,
                    contentDescription = "Photo of ${listing.displayName}",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 10f)
                        .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                        .then(heroShared),
                )
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .background(
                            Brush.verticalGradient(
                                0f to Color.Transparent,
                                0.55f to Color.Transparent,
                                1f to Color(0xCC09090B),
                            ),
                        ),
                )
                if (!listing.source.isNullOrBlank()) {
                    Text(
                        text = listing.source.uppercase(),
                        fontSize = 9.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White,
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(8.dp)
                            .clip(RoundedCornerShape(999.dp))
                            .background(Color(0xCC09090B))
                            .border(0.5.dp, Color(0x44FFFFFF), RoundedCornerShape(999.dp))
                            .padding(horizontal = 7.dp, vertical = 3.dp),
                    )
                }
                IconButton(
                    onClick = {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        onWatchToggle()
                    },
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .size(48.dp)
                        .semantics {
                            contentDescription = if (isWatched) "Remove from watchlist" else "Add to watchlist"
                        },
                ) {
                    Icon(
                        imageVector = if (isWatched) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                        contentDescription = null,
                        tint = if (isWatched) MotormilaBad else Color.White,
                        modifier = Modifier.graphicsLayer {
                            val s = if (reducedMotion) 1f else watchScale
                            scaleX = s
                            scaleY = s
                        },
                    )
                }
            }
            Column(Modifier.padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = listing.displayName,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                        color = MotormilaOnSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    if (showDeal && band == DealBand.LOCKED) {
                        DealBadge(band = band, score = null)
                    } else if (showDeal) {
                        DealRing(score = listing.dealScore, band = band)
                    }
                }
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = listing.formattedPrice(),
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = MotormilaOnSurface,
                    )
                    if (delta != null && band != DealBand.LOCKED) {
                        Spacer(Modifier.size(8.dp))
                        DeltaChip(deltaPct = delta)
                    }
                }
                if (showDeal && band != DealBand.LOCKED) {
                    Spacer(Modifier.height(6.dp))
                    DealBadge(band = band, score = listing.dealScore)
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = metaLine(listing),
                    fontSize = 12.sp,
                    color = MotormilaSecondaryText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun DeltaChip(deltaPct: Double) {
    val down = deltaPct < 0
    val container = if (down) Color(0x2E00C853) else Color(0x2EEF4444)
    val content = if (down) Color(0xFF69F0AE) else Color(0xFFFCA5A5)
    val border = if (down) Color(0x5500C853) else Color(0x55EF4444)
    Text(
        text = "${if (down) "▼" else "▲"} ${LkrFormat.deltaPct(deltaPct)}",
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        color = content,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(container)
            .border(0.5.dp, border, RoundedCornerShape(999.dp))
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
