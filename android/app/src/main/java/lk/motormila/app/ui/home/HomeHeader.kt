package lk.motormila.app.ui.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

/**
 * Showroom hero (web parity): stage-ink (#05060B) surface with a soft
 * electric-blue headlamp wash, live-market eyebrow, 44sp display headline with
 * the final word accented in Motormila Blue (#5CA5FF), and an integrated
 * search pill.
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
    val rawTitle = stringResource(R.string.mm_home_title)
    val styledTitle = remember(rawTitle, c.onStage, c.stageAccent) {
        val lastSpace = rawTitle.trimEnd().lastIndexOf(' ')
        buildAnnotatedString {
            if (lastSpace > 0) {
                withStyle(SpanStyle(color = c.onStage)) {
                    append(rawTitle.substring(0, lastSpace + 1))
                }
                withStyle(SpanStyle(color = c.stageAccent)) {
                    append(rawTitle.substring(lastSpace + 1))
                }
            } else {
                withStyle(SpanStyle(color = c.onStage)) { append(rawTitle) }
            }
        }
    }
    val sub = when {
        totalListings > 0 && sourceCount > 0 ->
            stringResource(R.string.mm_home_sub_counts, LkrFormat.count(totalListings), sourceCount)
        totalListings > 0 -> stringResource(R.string.mm_home_sub_count, LkrFormat.count(totalListings))
        else -> stringResource(R.string.mm_home_sub)
    }

    Box(
        modifier
            .fillMaxWidth()
            .padding(horizontal = MmSpacing.gutter)
            .clip(MmShapes.lg)
            .background(c.stage)
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0x380A7AFF), Color.Transparent),
                    center = Offset(720f, -40f),
                    radius = 700f,
                ),
            )
            .border(1.dp, c.stageOutline, MmShapes.lg)
            .padding(horizontal = 20.dp, vertical = 22.dp),
    ) {
        Column(Modifier.fillMaxWidth()) {
            // Live market eyebrow pill
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    Modifier
                        .size(7.dp)
                        .clip(MmShapes.pill)
                        .background(c.brandBright),
                )
                Text(
                    text = if (totalListings > 0 && sourceCount > 0) {
                        "${LkrFormat.count(totalListings)} LIVE ADS · $sourceCount SOURCES"
                    } else {
                        "SRI LANKA VEHICLE MARKET"
                    },
                    style = t.overline,
                    color = c.stageAccent,
                    letterSpacing = 1.0.sp,
                    maxLines = 1,
                )
            }
            Spacer(Modifier.height(12.dp))
            Text(styledTitle, style = t.displayXL)
            Spacer(Modifier.height(10.dp))
            Text(sub, style = t.bodyM, color = c.onStageMuted)
            Spacer(Modifier.height(20.dp))
            val press = remember { MutableInteractionSource() }
            val hint = stringResource(R.string.mm_home_search_hint)
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(54.dp)
                    .mmPress(press)
                    .clip(MmShapes.pill)
                    .background(c.stageRaised)
                    .border(1.dp, c.stageOutline, MmShapes.pill)
                    .clickable(interactionSource = press, indication = null, role = Role.Button, onClick = onSearchClick)
                    .semantics { contentDescription = hint }
                    .padding(horizontal = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(Icons.Outlined.Search, null, tint = c.stageAccent, modifier = Modifier.size(21.dp))
                Text(hint, style = t.bodyM, color = c.onStageMuted, maxLines = 1)
            }
        }
    }
}
