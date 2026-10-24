package lk.motormila.app.ui.components

import lk.motormila.app.ui.theme.mmTappable
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import lk.motormila.app.R
import lk.motormila.app.domain.model.DealBand
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmDealTone
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.deal
import lk.motormila.app.ui.theme.tone

/**
 * Deal verdict pill. Tone colours come from [MmColors] (great/good/fair/high/
 * caution). [onWhy] adds a "Why?" affordance that opens the explanation sheet.
 * [onImage] gives the pill an opaque dark backing so it reads on photos.
 */
@Composable
fun MmDealBadge(
    label: String,
    tone: MmDealTone,
    modifier: Modifier = Modifier,
    onWhy: (() -> Unit)? = null,
    onImage: Boolean = false,
    locked: Boolean = false,
) {
    val c = MmColors.current
    val d = c.deal(tone)
    val bg = if (onImage) Color(0xCC0B0B0F) else d.container
    val fg = if (onImage) (if (tone == MmDealTone.NEUTRAL) Color.White else d.solid.lighten()) else d.content
    val whyLabel = stringResource(R.string.mm_deal_why)
    // On a photo the pill shares a fixed 4:3 frame with the save button, so its
    // text is capped at 1.15x (iOS-style) — at 200 % it read "Near …" / "Rs 0.…".
    lk.motormila.app.ui.theme.CappedFontScale(max = if (onImage) 1.15f else 2f) {
    Row(
        modifier = modifier
            .clip(MmShapes.pill)
            .background(bg)
            .then(
                if (onWhy != null) {
                    Modifier.mmTappable(role = Role.Button, onClickLabel = whyLabel, pressedScale = 1f, onClick = onWhy)
                } else {
                    Modifier
                },
            )
            .semantics(mergeDescendants = true) { contentDescription = label }
            .padding(start = 10.dp, end = if (onWhy != null) 8.dp else 10.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (locked) {
            Icon(Icons.Filled.Lock, null, tint = fg, modifier = Modifier.size(12.dp))
        } else {
            Box(Modifier.size(6.dp).clip(MmShapes.pill).background(if (onImage) fg else d.solid))
        }
        Text(label, style = MmType.current.labelS, color = fg, modifier = Modifier.weight(1f, fill = false), maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        if (onWhy != null) {
            Icon(Icons.AutoMirrored.Outlined.HelpOutline, null, tint = fg.copy(alpha = 0.8f), modifier = Modifier.size(14.dp))
        }
    }
    }
}

private fun Color.lighten(): Color = Color(
    red = red + (1f - red) * 0.35f,
    green = green + (1f - green) * 0.35f,
    blue = blue + (1f - blue) * 0.35f,
    alpha = 1f,
)

/** Badge for a domain [DealBand] with localised labels. */
@Composable
fun MmDealBadge(
    band: DealBand,
    modifier: Modifier = Modifier,
    onWhy: (() -> Unit)? = null,
    onImage: Boolean = false,
) {
    val label = when (band) {
        DealBand.GREAT -> stringResource(R.string.mm_deal_great)
        DealBand.FAIR -> stringResource(R.string.mm_deal_fair)
        DealBand.HIGH -> stringResource(R.string.mm_deal_high)
        DealBand.LOCKED -> stringResource(R.string.mm_deal_locked)
    }
    MmDealBadge(
        label = label,
        tone = band.tone(),
        modifier = modifier,
        onWhy = onWhy,
        onImage = onImage,
        locked = band == DealBand.LOCKED,
    )
}
