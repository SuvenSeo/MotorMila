package lk.motormila.app.ui.compare

import lk.motormila.app.ui.theme.mmTappable
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.ui.platform.LocalDensity
import lk.motormila.app.ui.theme.CappedFontScale
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
import androidx.compose.material.icons.outlined.Info
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

private val LabelWidth = 108.dp
private val MinColumnWidth = 128.dp
private val MaxColumnWidth = 220.dp
private val RowHeight = 52.dp

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
            val reducedMotion = MmMotion.reduced
            val phase = when {
                state.isLoading && state.items.isEmpty() -> 0
                state.error != null && state.items.isEmpty() -> 1
                state.items.isEmpty() -> 2
                else -> 3
            }
            AnimatedContent(phase, transitionSpec = { MmMotion.crossfade(reducedMotion) }, label = "compare") { p ->
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
 * Matrix with a sticky spec-label column AND a sticky car header: the car
 * photos/names stay pinned while the spec rows scroll vertically, and header +
 * rows scroll horizontally together (one shared ScrollState). Two cars fill
 * the width exactly; three or four scroll, with the next column peeking.
 * Best numeric values are tinted green; rows where cars differ get a brand dot.
 * Row heights follow the font scale (capped at 1.5x) so 2-line values never clip.
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
    // Rows where no car has a value (Fuel/Gearbox/Engine are often missing
    // from the sources) are hidden and named once in a small "No data" note.
    val (filledRows, emptyRows) = remember(allRows) {
        allRows.partition { r -> r.values.any { v -> v.isNotBlank() && v != "—" } }
    }
    val rows = if (onlyDifferences && items.size > 1) filledRows.filter { it.differs || it.best != null } else filledRows
    val hScroll = rememberScrollState()
    CappedFontScale(max = 1.5f) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val fontScale = LocalDensity.current.fontScale.coerceAtLeast(1f)
            // Label and car columns widen with the text size so words never break
            // mid-word ("Conditio/n", "hatchbac/k", "Volkswa/gen") at large text.
            val growth = 1f + (fontScale - 1f) * 0.7f
            val labelW = (if (maxWidth < 380.dp) 96.dp else LabelWidth) * growth
            val avail = maxWidth - labelW - MmSpacing.lg
            val colW = when {
                items.size <= 2 -> avail / 2
                else -> avail / 2.4f
            }.coerceIn(MinColumnWidth * fontScale, MaxColumnWidth * fontScale)
            val rowH = RowHeight * fontScale
            val showAdd = items.size < CompareUiState.MAX_IDS
            Column(Modifier.fillMaxSize()) {
                Row(
                    Modifier.padding(horizontal = MmSpacing.lg, vertical = MmSpacing.sm),
                    horizontalArrangement = Arrangement.spacedBy(MmSpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        stringResource(R.string.scr_cmp_count, items.size, CompareUiState.MAX_IDS),
                        style = type.label,
                        color = c.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
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
                // Sticky car header.
                Row(Modifier.fillMaxWidth().padding(bottom = MmSpacing.xs)) {
                    Spacer(Modifier.width(labelW))
                    Row(Modifier.horizontalScroll(hScroll).padding(end = MmSpacing.lg)) {
                        items.forEach { item -> CarHeader(item, colW, onOpenDetail, onRemove) }
                        if (showAdd) AddColumn(colW, onAdd)
                    }
                }
                Box(Modifier.fillMaxWidth().height(0.5.dp).background(c.outline))
                Column(
                    Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(bottom = MmSpacing.huge),
                ) {
                    Row(Modifier.animateContentSize(MmMotion.orSnap(MmMotion.reduced, MmMotion.standard()))) {
                        // Sticky label column
                        Column(Modifier.width(labelW)) {
                            rows.forEach { row ->
                                LabelCell(rowH) {
                                    if (row.differs) {
                                        Box(Modifier.size(6.dp).clip(MmShapes.pill).background(c.brand))
                                        Spacer(Modifier.width(6.dp))
                                    }
                                    Text(
                                        rowLabel(row.key),
                                        style = type.labelS,
                                        color = c.textSecondary,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                            LabelCell(rowH, divider = false) {
                                Text(
                                    stringResource(R.string.scr_cmp_deal),
                                    style = type.labelS,
                                    color = c.textSecondary,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                        // Scrolling car columns (same ScrollState as the header).
                        Row(Modifier.horizontalScroll(hScroll).padding(end = MmSpacing.lg)) {
                            items.forEachIndexed { col, item ->
                                CarColumn(item, col, rows, colW, rowH)
                            }
                            if (showAdd) Spacer(Modifier.width(colW))
                        }
                    }
                    if (emptyRows.isNotEmpty()) {
                        val names = emptyRows.map { rowLabel(it.key) }.joinToString(" · ")
                        Row(
                            Modifier.padding(start = MmSpacing.lg, end = MmSpacing.lg, top = MmSpacing.md),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                Icons.Outlined.Info,
                                contentDescription = null,
                                tint = c.textTertiary,
                                modifier = Modifier.size(14.dp),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                stringResource(R.string.scr_cmp_no_data, names),
                                style = type.caption,
                                color = c.textSecondary,
                            )
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
        }
    }
}

@Composable
private fun LabelCell(rowH: androidx.compose.ui.unit.Dp, divider: Boolean = true, content: @Composable () -> Unit) {
    val c = MmColors.current
    Box(Modifier.fillMaxWidth().height(rowH)) {
        Row(
            Modifier.fillMaxSize().padding(start = MmSpacing.lg, end = MmSpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) { content() }
        if (divider) {
            Box(
                Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = MmSpacing.lg)
                    .fillMaxWidth()
                    .height(0.5.dp)
                    .background(c.outline),
            )
        }
    }
}

@Composable
private fun CarHeader(
    item: Listing,
    colW: androidx.compose.ui.unit.Dp,
    onOpenDetail: (Int) -> Unit,
    onRemove: (Int) -> Unit,
) {
    val c = MmColors.current
    val type = MmType.current
    Box(Modifier.width(colW).padding(horizontal = 4.dp)) {
        Column(
            Modifier
                .fillMaxWidth()
                .mmTappable(role = Role.Button, shape = MmShapes.md, onClickLabel = item.displayName) { onOpenDetail(item.id) }
                .clip(MmShapes.md)
                .background(c.surface),
        ) {
            Box {
                MmImage(
                    url = item.heroImageUrl,
                    contentDescription = null,
                    modifier = Modifier.fillMaxWidth().aspectRatio(16f / 10f),
                )
                MmIconButton(
                    icon = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.scr_cmp_remove, item.displayName),
                    onClick = { onRemove(item.id) },
                    style = lk.motormila.app.ui.components.MmIconButtonStyle.Glass,
                    visualSize = 28.dp,
                    modifier = Modifier.align(Alignment.TopEnd),
                )
            }
            Text(
                item.displayName,
                style = type.label,
                color = c.textPrimary,
                minLines = 2,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = MmSpacing.sm, vertical = MmSpacing.sm),
            )
        }
    }
}

@Composable
private fun CarColumn(
    item: Listing,
    col: Int,
    rows: List<CompareLogic.Row>,
    colW: androidx.compose.ui.unit.Dp,
    rowH: androidx.compose.ui.unit.Dp,
) {
    val c = MmColors.current
    val type = MmType.current
    Column(Modifier.width(colW)) {
        rows.forEach { row ->
            val isBest = row.best == col
            Box(Modifier.fillMaxWidth().height(rowH)) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .padding(horizontal = 4.dp, vertical = 4.dp)
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
                Box(
                    Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .height(0.5.dp)
                        .background(c.outline),
                )
            }
        }
        Box(Modifier.height(rowH).padding(start = MmSpacing.sm), contentAlignment = Alignment.CenterStart) {
            MmDealBadge(band = item.dealBand())
        }
    }
}

@Composable
private fun AddColumn(colW: androidx.compose.ui.unit.Dp, onAdd: () -> Unit) {
    val c = MmColors.current
    val type = MmType.current
    Box(Modifier.width(colW).padding(horizontal = 4.dp)) {
        Column(
            Modifier
                .fillMaxWidth()
                .mmTappable(role = Role.Button, shape = MmShapes.md, onClick = onAdd)
                .clip(MmShapes.md)
                .border(1.dp, c.outlineStrong, MmShapes.md),
        ) {
            // Same structure as CarHeader (16:10 slot + 2-line title) so the
            // add tile always matches the car headers' height.
            Box(Modifier.fillMaxWidth().aspectRatio(16f / 10f), contentAlignment = Alignment.Center) {
                Box(
                    Modifier.size(40.dp).clip(MmShapes.pill).background(c.brandContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null, tint = c.onBrandContainer)
                }
            }
            Text(
                stringResource(R.string.scr_cmp_add),
                style = type.label,
                color = c.brandText,
                minLines = 2,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(horizontal = MmSpacing.sm, vertical = MmSpacing.sm),
            )
        }
    }
}
