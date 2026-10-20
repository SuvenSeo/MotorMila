package lk.motormila.app.ui.compare

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.ui.common.MmScreen
import lk.motormila.app.ui.common.ScreenError
import lk.motormila.app.ui.common.ScreenSkeleton
import lk.motormila.app.ui.components.MmChip
import lk.motormila.app.ui.components.MmDealBadge
import lk.motormila.app.ui.components.MmEmptyState
import lk.motormila.app.ui.components.MmIconButton
import lk.motormila.app.ui.components.MmImage
import lk.motormila.app.ui.components.MmPriceFormat
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType

private val LabelWidth = 104.dp
private val ColumnWidth = 156.dp
private val RowHeight = 52.dp
private val HeaderHeight = 200.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompareScreen(
    ids: List<Int>,
    onOpenDetail: (id: Int) -> Unit,
    onAddListing: () -> Unit,
    onBrowse: () -> Unit,
    viewModel: CompareViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    LaunchedEffect(ids) { viewModel.syncIds(ids) }
    LaunchedEffect(state.error) {
        state.error?.let {
            if (state.items.isNotEmpty()) {
                snacks.showSnackbar(it)
                viewModel.onEvent(CompareUiEvent.DismissError)
            }
        }
    }
    MmScreen(
        title = stringResource(R.string.scr_cmp_title),
        snackbarHostState = snacks,
        actions = {
            if (state.items.size < CompareUiState.MAX_IDS && state.items.isNotEmpty()) {
                MmIconButton(Icons.Filled.Add, stringResource(R.string.scr_cmp_add), onClick = onAddListing)
            }
        },
    ) {
        PullToRefreshBox(
            isRefreshing = state.isLoading && state.items.isNotEmpty(),
            onRefresh = { viewModel.onEvent(CompareUiEvent.Refresh) },
            modifier = Modifier.fillMaxSize(),
        ) {
            val phase = when {
                state.isLoading && state.items.isEmpty() -> 0
                state.error != null && state.items.isEmpty() -> 1
                state.items.isEmpty() -> 2
                else -> 3
            }
            AnimatedContent(phase, transitionSpec = { MmMotion.crossfade(MmMotion.reduced) }, label = "compare") { p ->
                when (p) {
                    0 -> ScreenSkeleton(rows = 3)
                    1 -> ScreenError(state.error, onRetry = { viewModel.onEvent(CompareUiEvent.Refresh) })
                    2 -> Box(Modifier.fillMaxSize().padding(MmSpacing.xxl), contentAlignment = Alignment.Center) {
                        MmEmptyState(
                            icon = Icons.AutoMirrored.Filled.CompareArrows,
                            title = stringResource(R.string.scr_cmp_empty_title),
                            message = stringResource(R.string.scr_cmp_empty_body),
                            primaryAction = stringResource(R.string.scr_cmp_browse) to onBrowse,
                        )
                    }
                    else -> CompareMatrix(
                        items = state.items,
                        onlyDifferences = state.onlyDifferences,
                        onToggleDifferences = { viewModel.onEvent(CompareUiEvent.OnlyDifferences(it)) },
                        onOpenDetail = onOpenDetail,
                        onRemove = { viewModel.onEvent(CompareUiEvent.Remove(it)) },
                        onAdd = onAddListing,
                    )
                }
            }
        }
    }
}

@Composable
private fun rememberCompareFormat(): CompareFormat {
    val below = stringResource(R.string.scr_cmp_below_market)
    val above = stringResource(R.string.scr_cmp_above_market)
    val at = stringResource(R.string.scr_cmp_at_market)
    return remember(below, above, at) {
        object : CompareFormat {
            override fun price(lkr: Double?) = lkr?.takeIf { it > 0 }?.let { MmPriceFormat.compact(it) }
            override fun km(km: Double?) = km?.takeIf { it > 0 }?.let { "%,d km".format(it.toLong()) }
            override fun vsMarket(pct: Double?) = pct?.let {
                when {
                    it <= -1 -> below.format("%.0f".format(-it))
                    it >= 1 -> above.format("%.0f".format(it))
                    else -> at
                }
            }
        }
    }
}

@Composable
private fun rowLabel(key: String): String = stringResource(
    when (key) {
        "price" -> R.string.scr_cmp_price
        "vsMarket" -> R.string.scr_cmp_vs_market
        "year" -> R.string.scr_cmp_year
        "mileage" -> R.string.scr_cmp_mileage
        "fuel" -> R.string.scr_cmp_fuel
        "transmission" -> R.string.scr_cmp_transmission
        "engine" -> R.string.scr_cmp_engine
        "body" -> R.string.scr_cmp_body
        "condition" -> R.string.scr_cmp_condition
        "district" -> R.string.scr_cmp_district
        else -> R.string.scr_cmp_source
    },
)

/**
 * Matrix with a sticky spec-label column: labels stay put while the car
 * columns scroll horizontally; the whole thing scrolls vertically together.
 * Best numeric values are tinted green; rows where cars differ get a brand dot.
 */
@Composable
fun CompareMatrix(
    items: List<Listing>,
    onlyDifferences: Boolean,
    onToggleDifferences: (Boolean) -> Unit,
    onOpenDetail: (Int) -> Unit,
    onRemove: (Int) -> Unit,
    onAdd: () -> Unit,
) {
    val c = MmColors.current
    val type = MmType.current
    val format = rememberCompareFormat()
    val allRows = remember(items, format) { CompareLogic.rows(items, format) }
    val rows = if (onlyDifferences && items.size > 1) allRows.filter { it.differs || it.best != null } else allRows
    val hScroll = rememberScrollState()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = MmSpacing.huge)) {
        Row(
            Modifier.padding(horizontal = MmSpacing.lg, vertical = MmSpacing.sm),
            horizontalArrangement = Arrangement.spacedBy(MmSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.scr_cmp_count, items.size, CompareUiState.MAX_IDS),
                style = type.label,
                color = c.textSecondary,
                modifier = Modifier.weight(1f),
            )
            if (items.size > 1) {
                MmChip(
                    label = stringResource(R.string.scr_cmp_only_diff),
                    selected = onlyDifferences,
                    onClick = { onToggleDifferences(!onlyDifferences) },
                )
            }
        }
        Row(Modifier.animateContentSize(MmMotion.orSnap(MmMotion.reduced, MmMotion.standard()))) {
            // Sticky label column
            Column(Modifier.width(LabelWidth).padding(start = MmSpacing.lg)) {
                Spacer(Modifier.height(HeaderHeight))
                rows.forEach { row ->
                    Row(Modifier.height(RowHeight), verticalAlignment = Alignment.CenterVertically) {
                        if (row.differs) {
                            Box(Modifier.size(6.dp).clip(MmShapes.pill).background(c.brand))
                            Spacer(Modifier.width(6.dp))
                        }
                        Text(rowLabel(row.key), style = type.labelS, color = c.textSecondary, maxLines = 2)
                    }
                }
                Row(Modifier.height(RowHeight), verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.scr_cmp_deal), style = type.labelS, color = c.textSecondary)
                }
            }
            // Scrolling car columns
            Row(Modifier.horizontalScroll(hScroll).padding(end = MmSpacing.lg)) {
                items.forEachIndexed { col, item ->
                    CarColumn(item, col, rows, onOpenDetail, onRemove)
                }
                if (items.size < CompareUiState.MAX_IDS) AddColumn(onAdd)
            }
        }
        Text(
            stringResource(R.string.scr_cmp_note),
            style = type.caption,
            color = c.textTertiary,
            modifier = Modifier.padding(horizontal = MmSpacing.lg, vertical = MmSpacing.md),
        )
    }
}

@Composable
private fun CarColumn(
    item: Listing,
    col: Int,
    rows: List<CompareLogic.Row>,
    onOpenDetail: (Int) -> Unit,
    onRemove: (Int) -> Unit,
) {
    val c = MmColors.current
    val type = MmType.current
    Column(
        Modifier
            .width(ColumnWidth)
            .padding(start = MmSpacing.sm),
    ) {
        Column(
            Modifier
                .height(HeaderHeight)
                .clip(MmShapes.md)
                .background(c.surface)
                .clickable(role = Role.Button, onClickLabel = item.displayName) { onOpenDetail(item.id) },
        ) {
            Box {
                MmImage(
                    url = item.heroImageUrl,
                    contentDescription = null,
                    modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f),
                )
                MmIconButton(
                    icon = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.scr_cmp_remove, item.displayName),
                    onClick = { onRemove(item.id) },
                    style = lk.motormila.app.ui.components.MmIconButtonStyle.Glass,
                    visualSize = 32.dp,
                    modifier = Modifier.align(Alignment.TopEnd),
                )
            }
            Text(
                item.displayName,
                style = type.titleS,
                color = c.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = MmSpacing.sm, vertical = MmSpacing.xs),
            )
        }
        rows.forEach { row ->
            val isBest = row.best == col
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(RowHeight)
                    .padding(vertical = 3.dp)
                    .clip(MmShapes.xs)
                    .background(if (isBest) c.dealGreatContainer else androidx.compose.ui.graphics.Color.Transparent)
                    .padding(horizontal = MmSpacing.sm),
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(
                    row.values.getOrElse(col) { "—" },
                    style = if (row.key == "price") type.priceS else type.bodyM,
                    color = if (isBest) c.onDealGreat else c.textPrimary,
                    fontWeight = if (row.differs || isBest) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Box(Modifier.height(RowHeight), contentAlignment = Alignment.CenterStart) {
            MmDealBadge(band = item.dealBand(), modifier = Modifier.padding(start = MmSpacing.xs))
        }
    }
}

@Composable
private fun AddColumn(onAdd: () -> Unit) {
    val c = MmColors.current
    Box(
        Modifier
            .padding(start = MmSpacing.sm)
            .width(ColumnWidth)
            .height(HeaderHeight)
            .clip(MmShapes.md)
            .border(1.dp, c.outlineStrong, MmShapes.md)
            .clickable(role = Role.Button, onClick = onAdd),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Filled.Add, contentDescription = null, tint = c.brandText)
            Spacer(Modifier.height(MmSpacing.xs))
            Text(stringResource(R.string.scr_cmp_add), style = MmType.current.label, color = c.brandText)
        }
    }
}
