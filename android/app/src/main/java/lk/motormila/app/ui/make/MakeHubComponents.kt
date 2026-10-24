package lk.motormila.app.ui.make

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.domain.model.TrendPoint
import lk.motormila.app.ui.components.LoadingSkeletonCard
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurface as MotormilaSurfaceColor
import lk.motormila.app.ui.theme.MotormilaSurfaceHigh

@Composable
internal fun MakeHubSkeleton() {
    val loadingCd = stringResource(R.string.make_hub_loading)
    Column(
        Modifier
            .fillMaxSize()
            .padding(16.dp)
            .semantics { contentDescription = loadingCd },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        repeat(5) { LoadingSkeletonCard() }
    }
}

@Composable
internal fun MakeHubHero(
    eyebrow: String,
    title: String,
    description: String,
    modifier: Modifier = Modifier,
    trailing: @Composable (() -> Unit)? = null,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = modifier.padding(top = 8.dp),
    ) {
        Surface(
            shape = MotormilaRadius.pill,
            color = MotormilaSurfaceHigh,
            border = BorderStroke(1.dp, MotormilaOutline),
        ) {
            Text(
                text = "• ${eyebrow.uppercase()}",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    color = MotormilaPrimaryBright,
                ),
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
        Text(
            text = title,
            style = MaterialTheme.typography.headlineLarge.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.5).sp,
                color = MotormilaOnSurface,
            ),
        )
        Text(
            text = description,
            style = MaterialTheme.typography.bodyMedium.copy(
                color = MotormilaSecondaryText,
                lineHeight = 20.sp,
            ),
        )
        if (trailing != null) trailing()
    }
}

@Composable
internal fun MakeHubMetricCard(
    label: String,
    value: String,
    note: String,
    modifier: Modifier = Modifier,
    valueColor: Color = MotormilaOnSurface,
) {
    MotormilaSurface(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.8.sp,
                fontSize = 10.sp,
                color = MotormilaSecondaryText,
            ),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.headlineMedium.copy(
                fontWeight = FontWeight.Bold,
                fontFeatureSettings = "tnum",
                color = valueColor,
            ),
        )
        if (note.isNotBlank()) {
            Text(
                text = note,
                style = MaterialTheme.typography.bodySmall.copy(
                    color = MotormilaSecondaryText,
                    fontSize = 11.sp,
                ),
            )
        }
    }
}

@Composable
internal fun MakeHubStatsGrid(
    listingCount: Int?,
    avgPriceLkr: Double?,
    medianPriceLkr: Double?,
    listingsNote: String,
    modifier: Modifier = Modifier,
) {
    val na = stringResource(R.string.make_hub_na)
    val countText = listingCount?.let { LkrFormat.count(it) } ?: na
    val avgText = avgPriceLkr?.let { lk.motormila.app.ui.common.mn(it) } ?: na
    val medianText = medianPriceLkr?.let { lk.motormila.app.ui.common.mn(it) } ?: na
    val countCd = stringResource(R.string.make_hub_cd_stat_listings, countText)
    val avgCd = stringResource(R.string.make_hub_cd_stat_avg, avgText)
    val medianCd = stringResource(R.string.make_hub_cd_stat_median, medianText)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        MakeHubMetricCard(
            label = stringResource(R.string.make_hub_live_listings),
            value = countText,
            note = listingsNote,
            valueColor = MotormilaPrimaryBright,
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = countCd },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MakeHubMetricCard(
                label = stringResource(R.string.make_hub_avg_price),
                value = avgText,
                note = stringResource(R.string.make_hub_avg_note),
                modifier = Modifier.weight(1f).semantics { contentDescription = avgCd },
            )
            MakeHubMetricCard(
                label = stringResource(R.string.make_hub_median_price),
                value = medianText,
                note = stringResource(R.string.make_hub_median_note),
                modifier = Modifier.weight(1f).semantics { contentDescription = medianCd },
            )
        }
    }
}

@Composable
internal fun MakeHubTrendSection(
    points: List<TrendPoint>,
    coverageNote: String?,
    modifier: Modifier = Modifier,
) {
    val visible = points.takeLast(MAKE_HUB_TREND_LIMIT)
    if (visible.isEmpty()) return
    MotormilaSurface(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(Icons.AutoMirrored.Filled.TrendingUp, contentDescription = null, tint = MotormilaPrimary)
            Column {
                Text(
                    text = stringResource(R.string.make_hub_trend_eyebrow).uppercase(),
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp,
                        color = MotormilaPrimaryBright,
                    ),
                )
                Text(
                    text = stringResource(R.string.make_hub_trend_title),
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                )
            }
        }
        if (!coverageNote.isNullOrBlank()) {
            Text(
                text = coverageNote,
                style = MaterialTheme.typography.bodySmall,
                color = MotormilaSecondaryText,
            )
        }
        visible.forEach { point ->
            MakeHubTrendRow(point)
        }
    }
}

@Composable
private fun MakeHubTrendRow(point: TrendPoint) {
    val period = stringResource(R.string.make_hub_trend_period, point.periodKey)
    val price = lk.motormila.app.ui.common.mn(trendPointPrice(point))
    val count = stringResource(R.string.make_hub_trend_count, point.listingCount)
    val rowCd = stringResource(R.string.make_hub_cd_trend, period, price)
    Surface(
        shape = MotormilaRadius.lg,
        color = MotormilaSurfaceColor,
        border = BorderStroke(1.dp, MotormilaOutline),
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = rowCd },
    ) {
        Row(
            Modifier
                .padding(horizontal = 12.dp, vertical = 12.dp)
                .heightIn(min = 48.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                period,
                style = MaterialTheme.typography.labelMedium.copy(
                    fontFeatureSettings = "tnum",
                    color = MotormilaPrimaryBright,
                ),
            )
            Text(
                price,
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontWeight = FontWeight.SemiBold,
                    fontFeatureSettings = "tnum",
                ),
                modifier = Modifier.weight(1f),
            )
            Text(
                count,
                style = MaterialTheme.typography.labelSmall,
                color = MotormilaSecondaryText,
            )
        }
    }
}

@Composable
internal fun MakeHubBrowseButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    MotormilaPrimaryButton(
        label = label,
        modifier = modifier,
        leadingIcon = Icons.Filled.Search,
        onClick = onClick,
    )
}

@Composable
internal fun MakeHubSectionLabel(text: String) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall.copy(
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp,
            color = MotormilaSecondaryText,
        ),
    )
}
