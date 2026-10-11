package lk.motormila.app.ui.compare

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import java.util.Locale
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.format.formatLkr
import lk.motormila.app.core.ui.ErrorRetry
import lk.motormila.app.core.ui.SkeletonList
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.ui.components.DealBadge
import lk.motormila.app.ui.components.MotormilaGlass
import lk.motormila.app.ui.components.MotormilaIconAction
import lk.motormila.app.ui.components.MotormilaPage
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.theme.MotormilaBg
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaPrimaryBorder
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaPrimaryContainer
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurface
import lk.motormila.app.ui.theme.applePress

private val BestCellHighlight = MotormilaPrimaryContainer
private val BestCellBorder = MotormilaPrimaryBorder

/**
 * Compare up to 3 listings side by side (web parity: MAX_COMPARE_IDS = 3).
 * - Eyebrow pill: • ⚖️ COMPARE
 * - Headline: "Vehicle Comparison"
 * - Subtitle: "Side-by-side specs, pricing, and deal scores for up to 4 vehicles."
 * - Multi-vehicle comparison matrix (Price, FMV, Deal Score badge, Mileage, Year, District).
 * - Empty state matching web: Scales icon in electric blue halo,
 *   "No vehicles selected. Select vehicles from the Dashboard or Search to compare."
 */
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

    // The Search add-picker navigates back with a new ids list; reconcile the VM.
    LaunchedEffect(ids) { viewModel.syncIds(ids) }

    LaunchedEffect(state.error) {
        state.error?.let {
            snacks.showSnackbar(it)
            viewModel.onEvent(CompareUiEvent.DismissError)
        }
    }

    MotormilaPage(
        title = if (state.items.isEmpty()) "Compare" else "Compare (${state.items.size}/${CompareUiState.MAX_IDS})",
        onBack = onBrowse,
        snackbarHostState = snacks,
        actions = {
            if (state.items.size < CompareUiState.MAX_IDS) {
                MotormilaIconAction(
                    icon = Icons.Filled.Add,
                    contentDescription = "Add listing to compare",
                    onClick = onAddListing,
                    tint = MotormilaPrimaryBright,
                )
            }
        },
    ) {
        // Refresh keeps the loaded matrix visible: the skeleton only shows on
        // first load (items empty); a mid-session refresh just spins the PTR
        // indicator over the existing content.
        PullToRefreshBox(
            isRefreshing = state.isLoading && state.items.isNotEmpty(),
            onRefresh = { viewModel.onEvent(CompareUiEvent.Refresh) },
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                state.isLoading && state.items.isEmpty() -> {
                    Box(Modifier.fillMaxSize()) { SkeletonList() }
                }
            state.error != null && state.items.isEmpty() -> {
                Box(Modifier.fillMaxSize()) {
                    ErrorRetry(
                        message = state.error ?: "Error loading comparison",
                        onRetry = { viewModel.onEvent(CompareUiEvent.Refresh) },
                    )
                }
            }
            state.items.isEmpty() -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CompareEmptyState(onBrowse = onBrowse)
                }
            }
            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState()),
                ) {
                    // Eyebrow & Header section matching web platform
                    CompareHeaderSection()

                    // Multi-vehicle comparison matrix
                    CompareMatrixTable(
                        items = state.items,
                        onOpenDetail = onOpenDetail,
                        onRemove = { viewModel.onEvent(CompareUiEvent.Remove(it)) },
                        onAddListing = onAddListing,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 24.dp),
                    )
                }
            }
        } // when
        } // PullToRefreshBox
    }
}

/** Header block with Eyebrow pill, Headline, and Subtitle. */
@Composable
private fun CompareHeaderSection(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        // Eyebrow pill: • ⚖️ COMPARE
        Row(
            modifier = Modifier
                .clip(MotormilaRadius.pill)
                .background(MotormilaPrimaryContainer)
                .border(1.dp, Color(0x660A7AFF), MotormilaRadius.pill)
                .padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = "• ⚖️ COMPARE",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 1.sp,
                color = MotormilaPrimaryBright,
            )
        }

        Spacer(Modifier.height(8.dp))

        // Headline: Vehicle Comparison
        Text(
            text = "Vehicle Comparison",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = MotormilaOnSurface,
            letterSpacing = (-0.5).sp,
        )

        Spacer(Modifier.height(4.dp))

        // Subtitle: Side-by-side specs, pricing, and deal scores for up to 3 vehicles.
        Text(
            text = "Side-by-side specs, pricing, and deal scores for up to ${CompareUiState.MAX_IDS} vehicles.",
            style = MaterialTheme.typography.labelLarge,
            color = MotormilaSecondaryText,
            lineHeight = 18.sp,
        )

        Spacer(Modifier.height(8.dp))
    }
}

/** Empty state matching web: Scales icon in electric blue halo. */
@Composable
private fun CompareEmptyState(
    onBrowse: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        // Scales icon in electric blue halo
        Box(
            modifier = Modifier
                .size(68.dp)
                .clip(MotormilaRadius.lg)
                .background(MotormilaPrimaryContainer)
                .border(1.dp, Color(0x663D94FF), MotormilaRadius.lg),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "⚖️",
                fontSize = 32.sp,
            )
        }

        Spacer(Modifier.height(18.dp))

        Text(
            text = "No vehicles selected",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MotormilaOnSurface,
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(8.dp))

        Text(
            text = "No vehicles selected. Select vehicles from the Dashboard or Search to compare.",
            style = MaterialTheme.typography.bodyMedium,
            color = MotormilaSecondaryText,
            textAlign = TextAlign.Center,
            lineHeight = 20.sp,
            modifier = Modifier.padding(horizontal = 20.dp),
        )

        Spacer(Modifier.height(24.dp))

        MotormilaPrimaryButton(
            label = "Browse listings",
            fillMaxWidth = false,
            leadingIcon = Icons.Filled.Search,
            modifier = Modifier.semantics { contentDescription = "Browse listings" },
            onClick = onBrowse,
        )
    }
}

/** Multi-vehicle comparison matrix with sticky row labels and horizontal scrolling columns. */
@Composable
private fun CompareMatrixTable(
    items: List<Listing>,
    onOpenDetail: (Int) -> Unit,
    onRemove: (Int) -> Unit,
    onAddListing: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scrollState = rememberScrollState()

    // Leaders calculation
    val bestPrice = items.mapNotNull { it.priceLkr }.minOrNull()
    val bestYear = items.mapNotNull { it.year }.maxOrNull()
    val bestMileage = items.mapNotNull { it.mileageKm }.filter { it > 0 }.minOrNull()

    Row(modifier = modifier) {
        // Sticky First Column: Row labels
        Column(
            modifier = Modifier
                .width(115.dp)
                .background(MotormilaBg),
        ) {
            // Spacer to align perfectly with the vehicle card header
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .padding(start = 16.dp, bottom = 12.dp),
                contentAlignment = Alignment.BottomStart,
            ) {
                Text(
                    text = "SPECIFICATION",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 0.8.sp,
                    color = Color(0xFF6E6E73),
                )
            }

            // Metric labels (52dp height each)
            LabelCell("Price")
            LabelCell("FMV")
            LabelCell("Deal Score")
            LabelCell("Mileage")
            LabelCell("Year")
            LabelCell("District")
            LabelCell("Fuel")
            LabelCell("Gearbox")
            LabelCell("Condition")
        }

        // Horizontal Scrolling Vehicle Columns
        Row(
            modifier = Modifier
                .horizontalScroll(scrollState)
                .padding(end = 16.dp),
        ) {
            items.forEach { listing ->
                VehicleMatrixColumn(
                    listing = listing,
                    isBestPrice = listing.priceLkr != null && listing.priceLkr == bestPrice,
                    isBestYear = listing.year != null && listing.year == bestYear,
                    isBestMileage = listing.mileageKm != null && listing.mileageKm == bestMileage,
                    onOpenDetail = { onOpenDetail(listing.id) },
                    onRemove = { onRemove(listing.id) },
                )
            }

            // Slot to add another vehicle if < max
            if (items.size < CompareUiState.MAX_IDS) {
                AddVehicleColumnSlot(
                    onAdd = onAddListing,
                    currentCount = items.size,
                )
            }
        }
    }
}

/** Individual vehicle column with header card and aligned spec cells. */
@Composable
private fun VehicleMatrixColumn(
    listing: Listing,
    isBestPrice: Boolean,
    isBestYear: Boolean,
    isBestMileage: Boolean,
    onOpenDetail: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .width(180.dp)
            .padding(end = 10.dp),
    ) {
        // Vehicle Header Card (height 180dp)
        MotormilaGlass(
            modifier = Modifier
                .fillMaxWidth()
                .height(180.dp)
                .semantics { contentDescription = "Vehicle ${listing.displayName}" },
            onClick = onOpenDetail,
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Photo header
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(95.dp)
                        .background(MotormilaBg),
                ) {
                    if (!listing.heroImageUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = listing.heroImageUrl,
                            contentDescription = listing.displayName,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.DirectionsCar,
                                contentDescription = null,
                                tint = MotormilaSecondaryText,
                                modifier = Modifier.size(32.dp),
                            )
                        }
                    }

                    // Remove button top right (48dp target, 28dp visual).
                    IconButton(
                        onClick = onRemove,
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .size(48.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(CircleShape)
                                .background(Color(0xCC09090B)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Close,
                                contentDescription = "Remove ${listing.displayName}",
                                tint = MotormilaOnSurface,
                                modifier = Modifier.size(14.dp),
                            )
                        }
                    }
                }

                // Details footer
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        Text(
                            text = listing.displayName,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MotormilaOnSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "${listing.year ?: "—"} · ${listing.district ?: "Sri Lanka"}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MotormilaSecondaryText,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Open",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MotormilaPrimaryBright,
                        )
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = null,
                            tint = MotormilaPrimaryBright,
                            modifier = Modifier.size(12.dp),
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // Multi-vehicle comparison matrix cells (matching 52dp height):
        // 1. Price
        ValueCell(
            text = formatLkr(listing.priceLkr),
            isBest = isBestPrice,
            isPrice = true,
            desc = "Price ${formatLkr(listing.priceLkr)}",
        )

        // 2. FMV
        val fmvText = listing.marketMedianLkr?.let { formatLkr(it) } ?: "—"
        val delta = listing.deltaVsMedianPct()
        val deltaText = if (delta != null) {
            " (${if (delta <= 0) "" else "+"}${String.format(Locale.US, "%.1f", delta)}%)"
        } else {
            ""
        }
        ValueCell(
            text = "$fmvText$deltaText",
            isBest = false,
            desc = "FMV $fmvText",
        )

        // 3. Deal Score badge
        BadgeCell {
            DealBadge(band = listing.dealBand(), score = listing.dealScore)
        }

        // 4. Mileage
        ValueCell(
            text = listing.mileageKm?.let { LkrFormat.km(it) } ?: "—",
            isBest = isBestMileage,
            desc = "Mileage ${listing.mileageKm ?: "—"}",
        )

        // 5. Year
        ValueCell(
            text = listing.year?.toString() ?: "—",
            isBest = isBestYear,
            desc = "Year ${listing.year ?: "—"}",
        )

        // 6. District
        ValueCell(
            text = listing.district ?: "—",
            isBest = false,
            desc = "District ${listing.district ?: "—"}",
        )

        // 7. Fuel
        ValueCell(
            text = listing.fuelType?.replaceFirstChar(Char::uppercase) ?: "—",
            isBest = false,
            desc = "Fuel",
        )

        // 8. Gearbox
        ValueCell(
            text = listing.transmission?.replaceFirstChar(Char::uppercase) ?: "—",
            isBest = false,
            desc = "Transmission",
        )

        // 9. Condition
        ValueCell(
            text = listing.condition?.replaceFirstChar(Char::uppercase) ?: "—",
            isBest = false,
            desc = "Condition",
        )
    }
}

/** Slot to add another vehicle when count < 4. */
@Composable
private fun AddVehicleColumnSlot(
    onAdd: () -> Unit,
    currentCount: Int,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .width(150.dp)
            .height(180.dp),
    ) {
        val slotPress = remember { MutableInteractionSource() }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .applePress(slotPress)
                .clip(MotormilaRadius.lg)
                .background(MotormilaSurface)
                .border(1.dp, Color(0x443D94FF), MotormilaRadius.lg)
                .clickable(interactionSource = slotPress, indication = null, onClick = onAdd)
                .padding(16.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(MotormilaPrimaryContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Add,
                        contentDescription = "Add vehicle to compare",
                        tint = MotormilaPrimaryBright,
                        modifier = Modifier.size(20.dp),
                    )
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "Add vehicle",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MotormilaOnSurface,
                )
                Text(
                    text = "Slot ${currentCount + 1}/${CompareUiState.MAX_IDS}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MotormilaSecondaryText,
                )
            }
        }
    }
}

/** Sticky row label cell (height 52dp). */
@Composable
private fun LabelCell(text: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MotormilaSecondaryText,
        )
    }
}

/** Metric value cell with optional "best" leader highlight (height 52dp). */
@Composable
private fun ValueCell(
    text: String,
    isBest: Boolean,
    desc: String,
    isPrice: Boolean = false,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .clip(MotormilaRadius.lg)
            .background(if (isBest) BestCellHighlight else Color.Transparent)
            .border(
                width = if (isBest) 0.8.dp else 0.dp,
                color = if (isBest) BestCellBorder else Color.Transparent,
                shape = MotormilaRadius.lg,
            )
            .padding(horizontal = 12.dp)
            .semantics { contentDescription = "$desc${if (isBest) ", leader" else ""}" },
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(
            text = text,
            fontSize = if (isPrice) 13.5.sp else 13.sp,
            fontFamily = if (isPrice) FontFamily.Monospace else FontFamily.Default,
            fontWeight = if (isBest || isPrice) FontWeight.Bold else FontWeight.Normal,
            color = if (isBest) MotormilaPrimaryBright else MotormilaOnSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Badge cell for Deal Score and other pill-style badges (height 52dp). */
@Composable
private fun BadgeCell(content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .padding(horizontal = 10.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        content()
    }
}
