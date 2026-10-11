package lk.motormila.app.ui.components

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
import androidx.compose.material3.RangeSlider
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
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
 * Modal bottom sheet with 50/90 detents: make/model/year/budget/fuel/district
 * chips + sticky CTA showing live count. Callbacks Apply/Reset.
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
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    var draft by remember(current) { mutableStateOf(FilterDraft.from(current)) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        shape = lk.motormila.app.ui.theme.MotormilaSheetShape,
        modifier = modifier.semantics { contentDescription = "Search filters" },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .navigationBarsPadding(),
        ) {
            Text("Filters", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Spacer(Modifier.height(12.dp))

            SectionLabel("Make")
            MakeCombobox(
                options = makes,
                selected = draft.make,
                onSelect = { draft = draft.copy(make = it, model = null) },
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
            SectionLabel("Max budget")
            var budget by remember(draft.priceMaxLkr) {
                mutableStateOf(draft.priceMaxLkr ?: 30_000_000f)
            }
            RangeSlider(
                value = 2_000_000f..budget,
                onValueChange = {
                    budget = it.endInclusive
                    draft = draft.copy(priceMaxLkr = it.endInclusive)
                },
                valueRange = 2_000_000f..60_000_000f,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))

            Row(
                Modifier.fillMaxWidth().padding(vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                MotormilaGhostButton(
                    label = "Reset",
                    onClick = {
                        draft = FilterDraft()
                        onReset()
                    },
                    modifier = Modifier.weight(1f),
                )
                MotormilaPrimaryButton(
                    label = if (resultCount != null) "Show $resultCount results" else "Apply filters",
                    onClick = { onApply(draft.toQuery(current)) },
                    modifier = Modifier.weight(2f),
                )
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        fontWeight = FontWeight.SemiBold,
        fontSize = 13.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 10.dp, bottom = 6.dp),
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
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        options.forEach { option ->
            val isSel = selected.equals(option, ignoreCase = true)
            MotormilaChoiceChip(
                label = option,
                selected = isSel,
                onClick = { onSelect(if (isSel) null else option) },
            )
        }
    }
}
