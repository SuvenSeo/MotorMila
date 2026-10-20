package lk.motormila.app.ui.components

import lk.motormila.app.R
import androidx.compose.ui.res.stringResource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.ui.theme.pressKeyHaptic
import lk.motormila.app.ui.theme.rememberHaptics

/** Draft filter state edited inside the sheet; applied on CTA. */
data class FilterDraft(
    val make: String? = null,
    val model: String? = null,
    val yearMin: Int? = null,
    val yearMax: Int? = null,
    val priceMaxLkr: Float? = null,
    val fuelType: String? = null,
    val transmission: String? = null,
    val condition: String? = null,
    val bodyType: String? = null,
    val district: String? = null,
) {
    fun toQuery(base: ListingQuery): ListingQuery = base.copy(
        make = make,
        model = model,
        yearMin = yearMin,
        yearMax = yearMax,
        priceMax = priceMaxLkr?.toDouble(),
        fuelType = fuelType,
        transmission = transmission,
        condition = condition,
        bodyType = bodyType,
        district = district,
    )

    companion object {
        fun from(query: ListingQuery): FilterDraft = FilterDraft(
            make = query.make,
            model = query.model,
            yearMin = query.yearMin,
            yearMax = query.yearMax,
            priceMaxLkr = query.priceMax?.toFloat(),
            fuelType = query.fuelType,
            transmission = query.transmission,
            condition = query.condition,
            bodyType = query.bodyType,
            district = query.district,
        )
    }
}

/**
 * Filters (design v2): [MmSheet] (28dp, content rides in on a gentle
 * spring), grouped chip sections, a single max-budget slider labelled in
 * millions, and a pinned Reset / Show results row. Toggle haptics on chips.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun FilterSheet(
    current: ListingQuery,
    makes: List<String>,
    districts: List<String>,
    resultCount: Int?,
    onApply: (ListingQuery) -> Unit,
    onReset: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var draft by remember(current) { mutableStateOf(FilterDraft.from(current)) }
    val c = MmColors.current
    MmSheet(
        onDismissRequest = onDismiss,
        title = stringResource(R.string.ui_components_filters),
        modifier = modifier.semantics { contentDescription = "Search filters" },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .weight(1f, fill = false)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MmSpacing.gutter),
        ) {
            SectionLabel("Make")
            MakeCombobox(
                options = makes,
                selected = draft.make,
                onSelect = { draft = draft.copy(make = it, model = null) },
            )
            SectionLabel("Max budget")
            val budget = draft.priceMaxLkr
            Text(
                text = if (budget == null || budget >= MAX_BUDGET) "Any price" else "Up to ${MmPriceFormat.compact(budget.toDouble())}",
                style = MmType.current.priceS,
                color = c.textPrimary,
            )
            Slider(
                value = (budget ?: MAX_BUDGET).coerceIn(MIN_BUDGET, MAX_BUDGET),
                onValueChange = { v ->
                    // Snap to Rs 0.5 Mn steps so the label reads cleanly.
                    val snapped = (Math.round(v / 500_000f) * 500_000f).coerceIn(MIN_BUDGET, MAX_BUDGET)
                    draft = draft.copy(priceMaxLkr = if (snapped >= MAX_BUDGET) null else snapped)
                },
                valueRange = MIN_BUDGET..MAX_BUDGET,
                colors = SliderDefaults.colors(
                    thumbColor = c.brand,
                    activeTrackColor = c.brand,
                    inactiveTrackColor = c.surfaceHigh,
                ),
                modifier = Modifier.fillMaxWidth(),
            )
            SectionLabel("Fuel")
            ChipFlow(
                options = listOf("petrol", "diesel", "hybrid", "electric"),
                selected = draft.fuelType,
                onSelect = { draft = draft.copy(fuelType = it) },
            )
            SectionLabel("Transmission")
            ChipFlow(
                options = listOf("automatic", "manual", "cvt"),
                selected = draft.transmission,
                onSelect = { draft = draft.copy(transmission = it) },
            )
            SectionLabel("Condition")
            ChipFlow(
                options = listOf("brand_new", "reconditioned", "used"),
                selected = draft.condition,
                onSelect = { draft = draft.copy(condition = it) },
            )
            SectionLabel("District")
            ChipFlow(
                options = districts.take(14),
                selected = draft.district,
                onSelect = { draft = draft.copy(district = it) },
            )
            Spacer(Modifier.height(MmSpacing.lg))
        }
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = MmSpacing.gutter, vertical = MmSpacing.md),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            MmButton(
                text = "Reset",
                onClick = {
                    draft = FilterDraft()
                    onReset()
                },
                style = MmButtonStyle.Secondary,
                modifier = Modifier.weight(1f),
            )
            MmButton(
                // resultCount is only the loaded page count, never a total —
                // so the CTA never claims a number it can't stand behind.
                text = "Show results",
                onClick = { onApply(draft.toQuery(current)) },
                modifier = Modifier.weight(2f),
            )
        }
    }
}

private const val MIN_BUDGET = 1_000_000f
private const val MAX_BUDGET = 60_000_000f

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text.uppercase(),
        style = MmType.current.overline,
        color = MmColors.current.textTertiary,
        modifier = Modifier.padding(top = MmSpacing.xl, bottom = MmSpacing.sm),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChipFlow(
    options: List<String>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { option ->
            val isSel = selected.equals(option, ignoreCase = true)
            MmChip(
                label = option.replace('_', ' ').replaceFirstChar(Char::uppercase),
                selected = isSel,
                onClick = { onSelect(if (isSel) null else option) },
            )
        }
    }
}
