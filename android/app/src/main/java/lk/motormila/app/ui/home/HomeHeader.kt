package lk.motormila.app.ui.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import lk.motormila.app.R
import lk.motormila.app.ui.components.MmIconButton
import lk.motormila.app.ui.components.MmIconButtonStyle
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.mmTappable

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
            contentDescription = stringResource(R.string.v19_brand_name),
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

/** The approved study's 132dp crop. It's editorial art, not a photo of a particular ad. */
@Composable
internal fun BuyerHomeIntroduction(onSearchClick: () -> Unit) {
    val c = MmColors.current
    val t = MmType.current
    val largeType = LocalDensity.current.fontScale >= 1.5f
    Column(Modifier.fillMaxWidth()) {
        Image(
            painter = painterResource(R.drawable.buyer_home_studio),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            alignment = BiasAlignment(1f, 0.2f), // right 60%, as in buyer-study.html
            modifier = Modifier.fillMaxWidth().height(if (largeType) 88.dp else 132.dp),
        )
        Column(Modifier.padding(start = MmSpacing.gutter, end = MmSpacing.gutter, top = 18.dp)) {
            Text(stringResource(R.string.buyer_home_headline),
                style = if (largeType) t.titleL else t.displayL, color = c.textPrimary,
                modifier = Modifier.semantics { heading() })
            if (!largeType) {
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.buyer_home_intro), style = t.bodyL, color = c.textSecondary)
            }
        }
        Spacer(Modifier.height(16.dp))
        BuyerHomeSearch(onSearchClick)
        if (largeType) {
            // Keep the action ahead of supporting copy when translations wrap to many lines.
            Spacer(Modifier.height(8.dp))
            Text(stringResource(R.string.buyer_home_intro), style = t.bodyL, color = c.textSecondary,
                modifier = Modifier.padding(horizontal = MmSpacing.gutter))
        }
    }
}

/** This is a route into Search, not a non-editable input pretending to hold a query. */
@Composable
internal fun BuyerHomeSearch(onClick: () -> Unit) {
    val c = MmColors.current
    Row(
        modifier = Modifier.padding(horizontal = MmSpacing.gutter).fillMaxWidth()
            .heightIn(min = 54.dp).clip(MmShapes.md).background(c.surfaceRaised)
            .border(1.dp, c.outlineStrong, MmShapes.md)
            .mmTappable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(Icons.Outlined.Search, null, tint = c.brandText, modifier = Modifier.size(22.dp))
        Text(stringResource(R.string.buyer_home_search), style = MmType.current.titleS, color = c.textPrimary)
    }
}
