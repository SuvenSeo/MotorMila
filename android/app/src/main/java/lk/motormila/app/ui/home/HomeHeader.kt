package lk.motormila.app.ui.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.ui.components.MmIconButton
import lk.motormila.app.ui.components.MmIconButtonStyle
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.mmPress

/** Home top row: brand lockup (theme-aware artwork) + price-alerts button. */
@Composable
fun HomeTopRow(onAlertsClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = MmColors.current
    Row(
        modifier
            .fillMaxWidth()
            .padding(start = MmSpacing.gutter, end = 8.dp, top = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            painter = painterResource(lk.motormila.app.ui.components.motormilaWordmarkRes(c.isDark)),
            contentDescription = "MotorMila",
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .width(132.dp)
                .aspectRatio(lk.motormila.app.ui.components.MOTORMILA_WORDMARK_ASPECT),
        )
        Spacer(Modifier.weight(1f))
        MmIconButton(
            icon = Icons.Outlined.NotificationsNone,
            contentDescription = stringResource(R.string.mm_tools_alerts),
            onClick = onAlertsClick,
            style = MmIconButtonStyle.Filled,
        )
    }
}

/**
 * Calm hero: one confident line, one honest sub-line (live count only when
 * we actually have it), and a single search entry that opens Search.
 */
@Composable
fun HomeHero(
    totalListings: Int,
    sourceCount: Int,
    onSearchClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    val t = MmType.current
    Column(modifier.fillMaxWidth().padding(horizontal = MmSpacing.gutter)) {
        Text(stringResource(R.string.mm_home_title), style = t.displayM, color = c.textPrimary)
        Spacer(Modifier.height(10.dp))
        val sub = when {
            totalListings > 0 && sourceCount > 0 ->
                stringResource(R.string.mm_home_sub_counts, LkrFormat.count(totalListings), sourceCount)
            totalListings > 0 -> stringResource(R.string.mm_home_sub_count, LkrFormat.count(totalListings))
            else -> stringResource(R.string.mm_home_sub)
        }
        Text(sub, style = t.bodyL, color = c.textSecondary)
        Spacer(Modifier.height(MmSpacing.xl))
        val press = remember { MutableInteractionSource() }
        val hint = stringResource(R.string.mm_home_search_hint)
        Row(
            Modifier
                .fillMaxWidth()
                .height(56.dp)
                .mmPress(press)
                .clip(MmShapes.pill)
                .background(c.surfaceRaised)
                .border(1.dp, c.outlineStrong, MmShapes.pill)
                .clickable(interactionSource = press, indication = null, role = Role.Button, onClick = onSearchClick)
                .semantics { contentDescription = hint }
                .padding(horizontal = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(Icons.Outlined.Search, null, tint = c.textSecondary, modifier = Modifier.size(22.dp))
            Text(hint, style = t.bodyL, color = c.textTertiary, maxLines = 1)
        }
    }
}
