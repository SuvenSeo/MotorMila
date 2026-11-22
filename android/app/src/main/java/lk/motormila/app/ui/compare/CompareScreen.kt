package lk.motormila.app.ui.compare

import lk.motormila.app.ui.theme.mmTappable
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import lk.motormila.app.ui.components.MmChip

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
    onAddListing: (existingIds: List<Int>) -> Unit,
    onBrowse: () -> Unit,
    viewModel: CompareViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(ids) { viewModel.syncIds(ids) }
    val canAdd = state.entries.size < CompareUiState.MAX_IDS
    MmScreen(
        title = stringResource(R.string.scr_cmp_title),
        actions = {
            if (canAdd && state.entries.isNotEmpty()) {
                MmIconButton(Icons.Filled.Add, stringResource(R.string.scr_cmp_add), onClick = { onAddListing(state.ids) })
            }
        },
    ) {
        PullToRefreshBox(
            isRefreshing = state.entries.any { it.loading && it.listing != null },
            onRefresh = { viewModel.onEvent(CompareUiEvent.Refresh) },
            modifier = Modifier.fillMaxSize(),
        ) {
            if (state.entries.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(MmSpacing.xxl), contentAlignment = Alignment.Center) {
                    MmEmptyState(
                        icon = Icons.AutoMirrored.Filled.CompareArrows,
                        title = stringResource(R.string.scr_cmp_empty_title),
                        message = stringResource(R.string.scr_cmp_empty_body),
                        primaryAction = stringResource(R.string.scr_cmp_browse) to onBrowse,
                    )
                }
            } else {
                CompareTrayMatrix(
                    entries = state.entries,
                    onlyDifferences = state.onlyDifferences,
                    onToggleDifferences = { viewModel.onEvent(CompareUiEvent.OnlyDifferences(it)) },
                    onOpenDetail = onOpenDetail,
                    onRemove = { viewModel.onEvent(CompareUiEvent.Remove(it)) },
                    onRetry = { viewModel.onEvent(CompareUiEvent.Retry(it)) },
                    onAdd = { onAddListing(state.ids) },
                    canAdd = canAdd,
                )
            }
        }
    }
}

@Composable
private fun rememberCompareFormat(): CompareFormat {
    return remember {
        object : CompareFormat {
            override fun price(lkr: Double?) = lkr?.takeIf { it > 0 }?.let { MmPriceFormat.compact(it) }
            override fun km(km: Double?) = km?.takeIf { it > 0 }?.let { "%,d km".format(it.toLong()) }

        }
    }
}

@Composable
private fun rowLabel(key: String): String = stringResource(
    when (key) {
        "price" -> R.string.scr_cmp_price

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
    canAdd: Boolean = items.size < CompareUiState.MAX_IDS,
) = CompareTrayMatrix(items.map { CompareEntry(it.id, it) }, onlyDifferences, onToggleDifferences,
    onOpenDetail, onRemove, onRetry = {}, onAdd = onAdd, canAdd = canAdd)

@Composable
private fun CompareTrayMatrix(
    entries: List<CompareEntry>,
    onlyDifferences: Boolean,
    onToggleDifferences: (Boolean) -> Unit,
    onOpenDetail: (Int) -> Unit,
    onRemove: (Int) -> Unit,
    onRetry: (Int) -> Unit,
    onAdd: () -> Unit,
    canAdd: Boolean,
) {
    val items = entries.mapNotNull { it.listing }
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
                entries.size <= 2 -> avail / 2
                else -> avail / 2.4f
            }.coerceIn(MinColumnWidth * fontScale, MaxColumnWidth * fontScale)
            val rowH = RowHeight * fontScale
            val showAdd = canAdd
            Column(Modifier.fillMaxSize()) {
                Row(
                    Modifier.padding(horizontal = MmSpacing.lg, vertical = MmSpacing.sm),
                    horizontalArrangement = Arrangement.spacedBy(MmSpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        stringResource(R.string.scr_cmp_count, entries.size, CompareUiState.MAX_IDS),
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
                        entries.forEach { slot ->
                            if (slot.listing != null) CarHeader(slot.listing, colW, onOpenDetail, onRemove)
                            else MissingHeader(slot, colW, onRetry, onRemove)
                        }
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

                        }
                        // Scrolling car columns (same ScrollState as the header).
                        Row(Modifier.horizontalScroll(hScroll).padding(end = MmSpacing.lg)) {
                            entries.forEach { slot ->
                                if (slot.listing == null) Spacer(Modifier.width(colW))
                                else CarColumn(items.indexOf(slot.listing), rows, colW, rowH)
                            }
                            if (showAdd) Spacer(Modifier.width(colW))
                        }
                    }
                    if (items.isNotEmpty() && emptyRows.isNotEmpty()) {
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
                    if (items.isNotEmpty()) Text(
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
private fun MissingHeader(slot: CompareEntry, colW: androidx.compose.ui.unit.Dp, onRetry: (Int) -> Unit, onRemove: (Int) -> Unit) {
    val name = stringResource(R.string.buyer_home_listing_id, slot.id)
    Column(Modifier.width(colW).padding(horizontal = MmSpacing.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(name, modifier = Modifier.weight(1f), style = MmType.current.label)
            MmIconButton(Icons.Filled.Close, stringResource(R.string.scr_cmp_remove, name), onClick = { onRemove(slot.id) })
        }
        Text(stringResource(if (slot.loading) R.string.v19_search_loading else R.string.mm_detail_load_failed),
            style = MmType.current.bodyS)
        if (!slot.loading) TextButton(onClick = { onRetry(slot.id) }) { Text(stringResource(R.string.retry)) }
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
