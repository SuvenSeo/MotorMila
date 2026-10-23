package lk.motormila.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import lk.motormila.app.R
import lk.motormila.app.domain.model.VehicleCategory
import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import java.text.NumberFormat
import java.util.Locale

// ─────────────────────────────────────────────────────────────────────────────
// Filters (round 5, full web parity — src/components/FilterSidebar.tsx +
// src/lib/searchUrlState.ts). Every filter the backend `GET /listings`
// accepts: vehicle category, priced / no-price inventory, 360K+ archive,
// make → model, price min–max, year min–max, max mileage, fuel,
// transmission, condition, body type (cars), district (all 25), source site.
// Single-select per group, exactly like the web and the API (one value per
// query key).
// ─────────────────────────────────────────────────────────────────────────────

/** Price slider scale (web src/lib/priceSteps.ts): 0.5 Mn steps to 10 Mn, then coarser. */
val PRICE_STEPS: List<Double> = buildList {
    var v = 500_000.0
    while (v <= 10_000_000.0 + 1) { add(v); v += 500_000.0 }
    var m = 12_000_000.0
    while (m <= 20_000_000.0 + 1) { add(m); m += 2_000_000.0 }
    addAll(listOf(25e6, 30e6, 40e6, 50e6, 75e6, 100e6))
}
const val FILTER_MIN_YEAR = 1990
const val FILTER_MAX_YEAR = 2026
const val FILTER_MAX_MILEAGE = 300_000
const val FILTER_MILEAGE_STEP = 10_000

val FUEL_VALUES = listOf("petrol", "diesel", "hybrid", "electric")
val TRANSMISSION_VALUES = listOf("automatic", "manual", "cvt")
val CONDITION_VALUES = listOf("brand_new", "reconditioned", "used")
val BODY_VALUES = listOf(
    "sedan", "suv", "hatchback", "crossover", "mpv", "jeep", "mini", "luxury",
    "van", "pickup", "wagon", "coupe", "convertible",
)

private fun priceIndex(v: Double?, fallbackMax: Boolean): Float {
    if (v == null) return if (fallbackMax) (PRICE_STEPS.size - 1).toFloat() else 0f
    var best = 0
    PRICE_STEPS.forEachIndexed { i, s -> if (kotlin.math.abs(s - v) < kotlin.math.abs(PRICE_STEPS[best] - v)) best = i }
    return best.toFloat()
}

/** Draft filter state edited inside the sheet; applied on CTA. */
data class FilterDraft(
    val vehicleCategory: String? = VehicleCategory.DEFAULT.apiValue,
    val make: String? = null,
    val model: String? = null,
    val yearMin: Int? = null,
    val yearMax: Int? = null,
    val priceMin: Double? = null,
    val priceMax: Double? = null,
    val mileageMax: Int? = null,
    val fuelType: String? = null,
    val transmission: String? = null,
    val condition: String? = null,
    val bodyType: String? = null,
    val district: String? = null,
    val source: String? = null,
    val priceAvailability: String? = null,
    val includeArchive: Boolean = false,
) {
    val noPrice: Boolean get() = priceAvailability == "unavailable"

    fun toQuery(base: ListingQuery): ListingQuery = base.copy(
        vehicleCategory = vehicleCategory,
        make = make,
        model = model,
        yearMin = yearMin,
        yearMax = yearMax,
        priceMin = if (noPrice) null else priceMin,
        priceMax = if (noPrice) null else priceMax,
        mileageMax = mileageMax,
        fuelType = fuelType,
        transmission = transmission,
        condition = condition,
        bodyType = if (vehicleCategory == "cars") bodyType else null,
        district = district,
        source = source,
        priceAvailability = priceAvailability,
        includeArchive = includeArchive,
    )

    /** Active groups (drives the badge and "Reset all"). Category counts only when it is not Cars. */
    val activeCount: Int
        get() = listOf(
            vehicleCategory != VehicleCategory.DEFAULT.apiValue,
            make != null, model != null,
            !noPrice && (priceMin != null || priceMax != null),
            yearMin != null || yearMax != null,
            mileageMax != null, fuelType != null, transmission != null, condition != null,
            bodyType != null, district != null, source != null, noPrice, includeArchive,
        ).count { it }

    companion object {
        fun from(query: ListingQuery): FilterDraft = FilterDraft(
            vehicleCategory = query.vehicleCategory,
            make = query.make,
            model = query.model,
            yearMin = query.yearMin,
            yearMax = query.yearMax,
            priceMin = query.priceMin,
            priceMax = query.priceMax,
            mileageMax = query.mileageMax,
            fuelType = query.fuelType,
            transmission = query.transmission,
            condition = query.condition,
            bodyType = query.bodyType,
            district = query.district,
            source = query.source,
            priceAvailability = query.priceAvailability,
            includeArchive = query.includeArchive,
        )
    }
}

/** Active-filter count of an applied query (badge on the filter button). */
fun ListingQuery.activeFilterCount(): Int = FilterDraft.from(this).activeCount

/** One removable chip above the results: [key] is understood by SearchViewModel.removeFilter. */
data class ActiveFilterChip(val key: String, val label: String)

@Composable
fun activeFilterChips(q: ListingQuery): List<ActiveFilterChip> {
    val out = mutableListOf<ActiveFilterChip>()
    q.make?.let { out += ActiveFilterChip("make", it) }
    q.model?.let { out += ActiveFilterChip("model", it) }
    if (q.priceAvailability != "unavailable" && (q.priceMin != null || q.priceMax != null)) {
        out += ActiveFilterChip("price", priceRangeLabel(q.priceMin, q.priceMax, stringResource(R.string.filter_any)))
    }
    if (q.yearMin != null || q.yearMax != null) {
        out += ActiveFilterChip("year", "${q.yearMin ?: FILTER_MIN_YEAR}–${q.yearMax ?: FILTER_MAX_YEAR}")
    }
    q.mileageMax?.let { out += ActiveFilterChip("mileage", "≤ ${kmLabel(it)}") }
    q.fuelType?.let { out += ActiveFilterChip("fuel", optionLabel(it)) }
    q.transmission?.let { out += ActiveFilterChip("transmission", optionLabel(it)) }
    q.condition?.let { out += ActiveFilterChip("condition", optionLabel(it)) }
    q.bodyType?.let { out += ActiveFilterChip("body", bodyLabel(it)) }
    q.district?.let { out += ActiveFilterChip("district", it) }
    q.source?.let { out += ActiveFilterChip("source", sourceLabel(it)) }
    if (q.priceAvailability == "unavailable") out += ActiveFilterChip("noprice", stringResource(R.string.filter_no_price))
    if (q.includeArchive) out += ActiveFilterChip("archive", "360K+")
    return out
}

private val grouping: NumberFormat get() = NumberFormat.getIntegerInstance(Locale.US)

fun kmLabel(km: Int): String = if (km >= 1000) "${km / 1000}k km" else "$km km"

fun priceRangeLabel(min: Double?, max: Double?, any: String): String = when {
    min != null && max != null -> "${MmPriceFormat.compact(min)} – ${MmPriceFormat.compactAmount(max)}"
    max != null -> "≤ ${MmPriceFormat.compact(max)}"
    min != null -> "≥ ${MmPriceFormat.compact(min)}"
    else -> any
}

fun sourceLabel(s: String): String = when (s.lowercase()) {
    "ikman" -> "ikman.lk"
    "riyasewana" -> "Riyasewana"
    "autolanka" -> "AutoLanka"
    "patpat" -> "PatPat"
    "saleme" -> "Saleme"
    "carshop" -> "CarShop"
    "autodirect" -> "AutoDirect"
    "autostream" -> "AutoStream"
    "riyahub" -> "RiyaHub"
    "dimo" -> "DIMO"
    else -> s.replaceFirstChar(Char::uppercase)
}

fun bodyLabel(b: String): String = when (b) {
    "suv" -> "SUV"
    "mpv" -> "MPV"
    "hatchback" -> "Hatchback"
    "coupe" -> "Coupé"
    "convertible" -> "Cabrio"
    else -> b.replaceFirstChar(Char::uppercase)
}

@Composable
fun optionLabel(v: String): String = when (v) {
    "petrol" -> stringResource(R.string.filter_fuel_petrol)
    "diesel" -> stringResource(R.string.filter_fuel_diesel)
    "hybrid" -> stringResource(R.string.filter_fuel_hybrid)
    "electric" -> stringResource(R.string.filter_fuel_electric)
    "automatic" -> stringResource(R.string.filter_trans_automatic)
    "manual" -> stringResource(R.string.filter_trans_manual)
    "cvt" -> stringResource(R.string.filter_trans_cvt)
    "brand_new" -> stringResource(R.string.filter_cond_new)
    "reconditioned" -> stringResource(R.string.filter_cond_recon)
    "used" -> stringResource(R.string.filter_cond_used)
    else -> v.replace('_', ' ').replaceFirstChar(Char::uppercase)
}

/**
 * Filters sheet: liquid-glass [MmSheet] with grouped, collapsible sections
 * (spring expand + chevron), Make → Model dependent searchable pickers,
 * dual-knob range sliders with editable min / max fields (price, year) and a
 * max-mileage slider, single-select chip groups, per-section Reset, Reset
 * all, and a pinned "Show N results" whose N is the live backend total for
 * the draft (debounced 300 ms).
 */
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
    models: List<String> = emptyList(),
    sources: List<String> = emptyList(),
    onMakeChange: (String?) -> Unit = {},
    countFor: (suspend (ListingQuery) -> Int?)? = null,
) {
    var draft by remember(current) { mutableStateOf(FilterDraft.from(current)) }
    var count by remember { mutableStateOf<Int?>(null) }
    var counting by remember { mutableStateOf(false) }
    if (countFor != null) {
        LaunchedEffect(draft) {
            counting = true
            delay(300)
            count = countFor(draft.toQuery(current))
            counting = false
        }
    }
    MmSheet(
        onDismissRequest = onDismiss,
        title = stringResource(R.string.ui_components_filters),
        modifier = modifier.semantics { contentDescription = "Search filters" },
    ) {
        FilterSheetBody(
            draft = draft,
            onDraftChange = {
                if (it.make != draft.make) onMakeChange(it.make)
                draft = it
            },
            makes = makes,
            districts = districts,
            models = models,
            sources = sources,
            liveCount = count,
            counting = counting,
            onReset = {
                draft = FilterDraft(vehicleCategory = current.vehicleCategory)
                onMakeChange(null)
            },
            onApply = { onApply(draft.toQuery(current)) },
        )
    }
}

/** Sheet body (sections + pinned CTA row); stateless so tests can render it in [MmSheetFrame]. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ColumnScope.FilterSheetBody(
    draft: FilterDraft,
    onDraftChange: (FilterDraft) -> Unit,
    makes: List<String>,
    districts: List<String>,
    onReset: () -> Unit,
    onApply: () -> Unit,
    models: List<String> = emptyList(),
    sources: List<String> = emptyList(),
    liveCount: Int? = null,
    counting: Boolean = false,
    initiallyExpanded: Set<String> = DEFAULT_EXPANDED,
) {
    val applyHaptics = MmHaptics.current
    val c = MmColors.current
    val t = MmType.current
    val any = stringResource(R.string.filter_any)
    // Sections open by default + any section with an active value.
    val expanded = remember {
        mutableStateMapOf<String, Boolean>().apply {
            initiallyExpanded.forEach { put(it, true) }
            if (draft.vehicleCategory != VehicleCategory.DEFAULT.apiValue) put("vehicle", true)
            if (draft.noPrice || draft.includeArchive) put("inventory", true)
            if (draft.mileageMax != null) put("mileage", true)
            if (draft.transmission != null) put("transmission", true)
            if (draft.condition != null) put("condition", true)
            if (draft.bodyType != null) put("body", true)
            if (draft.district != null) put("district", true)
            if (draft.source != null) put("source", true)
        }
    }
    fun toggle(k: String) { expanded[k] = !(expanded[k] ?: false) }

    Column(
        Modifier
            .fillMaxWidth()
            .weight(1f, fill = false)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MmSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // Vehicle type
        FilterSection(
            key = "vehicle",
            title = stringResource(R.string.filter_section_vehicle),
            summary = VehicleCategory.fromApi(draft.vehicleCategory).let { stringResource(it.chipLabelRes()) },
            active = draft.vehicleCategory != VehicleCategory.DEFAULT.apiValue,
            expanded = expanded["vehicle"] == true,
            onToggle = { toggle("vehicle") },
            onReset = { onDraftChange(draft.copy(vehicleCategory = VehicleCategory.DEFAULT.apiValue)) },
        ) {
            ChipGroup(
                options = VehicleCategory.entries.map { it.apiValue.orEmpty() },
                selected = draft.vehicleCategory.orEmpty(),
                label = { v -> stringResource(VehicleCategory.fromApi(v.ifEmpty { null }).chipLabelRes()) },
                onSelect = { v ->
                    val cat = v?.ifEmpty { null }
                    onDraftChange(draft.copy(vehicleCategory = cat, bodyType = if (cat == "cars") draft.bodyType else null))
                },
                allowNone = false,
            )
        }

        // Inventory (priced / no price) + archive
        FilterSection(
            key = "inventory",
            title = stringResource(R.string.filter_section_inventory),
            summary = listOfNotNull(
                stringResource(if (draft.noPrice) R.string.filter_no_price else R.string.filter_with_price),
                if (draft.includeArchive) "360K+" else null,
            ).joinToString(" · "),
            active = draft.noPrice || draft.includeArchive,
            expanded = expanded["inventory"] == true,
            onToggle = { toggle("inventory") },
            onReset = { onDraftChange(draft.copy(priceAvailability = null, includeArchive = false)) },
        ) {
            Segmented(
                left = stringResource(R.string.filter_with_price),
                right = stringResource(R.string.filter_no_price),
                rightSelected = draft.noPrice,
                onSelect = { right -> onDraftChange(draft.copy(priceAvailability = if (right) "unavailable" else null)) },
            )
            Spacer(Modifier.height(10.dp))
            MmChip(
                label = stringResource(R.string.filter_include_archive),
                selected = draft.includeArchive,
                onClick = { onDraftChange(draft.copy(includeArchive = !draft.includeArchive)) },
            )
        }

        // Make → Model
        FilterSection(
            key = "makeModel",
            title = stringResource(R.string.filter_section_make_model),
            summary = listOfNotNull(draft.make, draft.model).joinToString(" ").ifBlank { any },
            active = draft.make != null,
            expanded = expanded["makeModel"] == true,
            onToggle = { toggle("makeModel") },
            onReset = { onDraftChange(draft.copy(make = null, model = null)) },
        ) {
            MakeCombobox(
                options = makes,
                selected = draft.make,
                onSelect = { onDraftChange(draft.copy(make = it, model = null)) },
            )
            Spacer(Modifier.height(10.dp))
            MakeCombobox(
                options = if (draft.make != null) models else emptyList(),
                selected = draft.model,
                onSelect = { onDraftChange(draft.copy(model = it)) },
                label = stringResource(R.string.filter_model_label),
                searchHint = if (draft.make == null) stringResource(R.string.filter_pick_make_first) else stringResource(R.string.filter_model_search_hint),
                allLabel = stringResource(R.string.filter_all_models),
                enabled = draft.make != null,
            )
        }

        // Price min–max
        FilterSection(
            key = "price",
            title = stringResource(R.string.filter_section_price),
            summary = if (draft.noPrice) stringResource(R.string.filter_no_price) else priceRangeLabel(draft.priceMin, draft.priceMax, any),
            active = !draft.noPrice && (draft.priceMin != null || draft.priceMax != null),
            expanded = expanded["price"] == true,
            onToggle = { toggle("price") },
            onReset = { onDraftChange(draft.copy(priceMin = null, priceMax = null)) },
        ) {
            if (draft.noPrice) {
                Text(stringResource(R.string.filter_price_needs_priced), style = t.bodyS, color = c.textSecondary)
            } else {
                val last = (PRICE_STEPS.size - 1).toFloat()
                MmRangeSlider(
                    start = priceIndex(draft.priceMin, fallbackMax = false),
                    end = priceIndex(draft.priceMax, fallbackMax = true),
                    onChange = { s, e ->
                        onDraftChange(
                            draft.copy(
                                priceMin = if (s <= 0f) null else PRICE_STEPS[s.toInt()],
                                priceMax = if (e >= last) null else PRICE_STEPS[e.toInt()],
                            ),
                        )
                    },
                    valueRange = 0f..last,
                    startLabel = stringResource(R.string.filter_min),
                    endLabel = stringResource(R.string.filter_max),
                    startValueText = MmPriceFormat.compact(draft.priceMin, any),
                    endValueText = MmPriceFormat.compact(draft.priceMax, any),
                )
                MinMaxFields(
                    minText = draft.priceMin?.let { MmPriceFormat.mnNumber(it) }.orEmpty(),
                    maxText = draft.priceMax?.let { MmPriceFormat.mnNumber(it) }.orEmpty(),
                    suffix = stringResource(R.string.filter_mn_suffix),
                    decimal = true,
                    onMin = { txt -> onDraftChange(draft.copy(priceMin = txt.toDoubleOrNull()?.takeIf { it > 0 }?.times(1_000_000))) },
                    onMax = { txt -> onDraftChange(draft.copy(priceMax = txt.toDoubleOrNull()?.takeIf { it > 0 }?.times(1_000_000))) },
                )
            }
        }

        // Year min–max
        FilterSection(
            key = "year",
            title = stringResource(R.string.filter_section_year),
            summary = if (draft.yearMin == null && draft.yearMax == null) any else "${draft.yearMin ?: FILTER_MIN_YEAR}–${draft.yearMax ?: FILTER_MAX_YEAR}",
            active = draft.yearMin != null || draft.yearMax != null,
            expanded = expanded["year"] == true,
            onToggle = { toggle("year") },
            onReset = { onDraftChange(draft.copy(yearMin = null, yearMax = null)) },
        ) {
            MmRangeSlider(
                start = (draft.yearMin ?: FILTER_MIN_YEAR).toFloat(),
                end = (draft.yearMax ?: FILTER_MAX_YEAR).toFloat(),
                onChange = { s, e ->
                    onDraftChange(
                        draft.copy(
                            yearMin = s.toInt().takeIf { it > FILTER_MIN_YEAR },
                            yearMax = e.toInt().takeIf { it < FILTER_MAX_YEAR },
                        ),
                    )
                },
                valueRange = FILTER_MIN_YEAR.toFloat()..FILTER_MAX_YEAR.toFloat(),
                startLabel = stringResource(R.string.filter_from_year),
                endLabel = stringResource(R.string.filter_to_year),
                startValueText = (draft.yearMin ?: FILTER_MIN_YEAR).toString(),
                endValueText = (draft.yearMax ?: FILTER_MAX_YEAR).toString(),
            )
            MinMaxFields(
                minText = draft.yearMin?.toString().orEmpty(),
                maxText = draft.yearMax?.toString().orEmpty(),
                suffix = null,
                decimal = false,
                minPlaceholder = FILTER_MIN_YEAR.toString(),
                maxPlaceholder = FILTER_MAX_YEAR.toString(),
                onMin = { txt -> onDraftChange(draft.copy(yearMin = txt.toIntOrNull()?.takeIf { it in FILTER_MIN_YEAR..FILTER_MAX_YEAR })) },
                onMax = { txt -> onDraftChange(draft.copy(yearMax = txt.toIntOrNull()?.takeIf { it in FILTER_MIN_YEAR..FILTER_MAX_YEAR })) },
            )
        }

        // Mileage (max only: the API has mileage_max, no minimum)
        FilterSection(
            key = "mileage",
            title = stringResource(R.string.filter_section_mileage),
            summary = draft.mileageMax?.let { "≤ ${kmLabel(it)}" } ?: any,
            active = draft.mileageMax != null,
            expanded = expanded["mileage"] == true,
            onToggle = { toggle("mileage") },
            onReset = { onDraftChange(draft.copy(mileageMax = null)) },
        ) {
            MmRangeSlider(
                start = 0f,
                end = (draft.mileageMax ?: FILTER_MAX_MILEAGE).toFloat(),
                onChange = { _, e ->
                    onDraftChange(draft.copy(mileageMax = e.toInt().takeIf { it < FILTER_MAX_MILEAGE }))
                },
                valueRange = 0f..FILTER_MAX_MILEAGE.toFloat(),
                step = FILTER_MILEAGE_STEP.toFloat(),
                single = true,
                endLabel = stringResource(R.string.filter_max),
                endValueText = draft.mileageMax?.let { kmLabel(it) } ?: any,
            )
            SingleField(
                text = draft.mileageMax?.toString().orEmpty(),
                label = stringResource(R.string.filter_max),
                suffix = stringResource(R.string.filter_km_suffix),
                placeholder = grouping.format(FILTER_MAX_MILEAGE),
                onText = { txt ->
                    val v = txt.filter(Char::isDigit).toIntOrNull()
                    onDraftChange(draft.copy(mileageMax = v?.takeIf { it in 1 until FILTER_MAX_MILEAGE }))
                },
            )
        }

        chipSection("fuel", R.string.filter_section_fuel, FUEL_VALUES, draft.fuelType, expanded, { toggle("fuel") }, any, { optionLabel(it) }) {
            onDraftChange(draft.copy(fuelType = it))
        }
        chipSection("transmission", R.string.filter_section_transmission, TRANSMISSION_VALUES, draft.transmission, expanded, { toggle("transmission") }, any, { optionLabel(it) }) {
            onDraftChange(draft.copy(transmission = it))
        }
        chipSection("condition", R.string.filter_section_condition, CONDITION_VALUES, draft.condition, expanded, { toggle("condition") }, any, { optionLabel(it) }) {
            onDraftChange(draft.copy(condition = it))
        }
        if (draft.vehicleCategory == "cars") {
            chipSection("body", R.string.filter_section_body, BODY_VALUES, draft.bodyType, expanded, { toggle("body") }, any, { bodyLabel(it) }) {
                onDraftChange(draft.copy(bodyType = it))
            }
        }

        // District (all 25, first 8 until expanded)
        var allDistricts by remember { mutableStateOf(false) }
        FilterSection(
            key = "district",
            title = stringResource(R.string.filter_section_district),
            summary = draft.district ?: any,
            active = draft.district != null,
            expanded = expanded["district"] == true,
            onToggle = { toggle("district") },
            onReset = { onDraftChange(draft.copy(district = null)) },
        ) {
            val shown = if (allDistricts || districts.size <= 9) districts else {
                (districts.take(8) + listOfNotNull(draft.district)).distinct()
            }
            ChipGroup(options = shown, selected = draft.district, label = { it }, onSelect = { onDraftChange(draft.copy(district = it)) })
            if (districts.size > 9) {
                Text(
                    if (allDistricts) stringResource(R.string.filter_show_fewer) else stringResource(R.string.filter_show_all_n, districts.size),
                    style = t.label,
                    color = c.brandText,
                    modifier = Modifier
                        .padding(top = 8.dp)
                        .clip(MmShapes.pill)
                        .clickable(role = Role.Button) { allDistricts = !allDistricts }
                        .heightIn(min = 40.dp)
                        .padding(horizontal = 8.dp, vertical = 10.dp),
                )
            }
        }

        if (sources.isNotEmpty()) {
            chipSection("source", R.string.filter_section_source, sources, draft.source, expanded, { toggle("source") }, any, { sourceLabel(it) }) {
                onDraftChange(draft.copy(source = it))
            }
        }
        Spacer(Modifier.height(MmSpacing.sm))
    }

    // Pinned CTA row
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = MmSpacing.gutter, vertical = MmSpacing.md),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MmButton(
            text = stringResource(R.string.filter_reset_all),
            onClick = onReset,
            style = MmButtonStyle.Secondary,
            enabled = draft.activeCount > 0,
            modifier = Modifier.weight(1f),
        )
        val cta = when {
            // Never show the previous draft's total while the new one is counting.
            counting -> stringResource(R.string.filter_count_loading)
            liveCount == null -> stringResource(R.string.filter_show_results)
            liveCount == 0 -> stringResource(R.string.filter_no_matches)
            liveCount == 1 -> stringResource(R.string.filter_show_one_result)
            else -> stringResource(R.string.filter_show_n_results, grouping.format(liveCount))
        }
        MmButton(
            text = cta,
            onClick = {
                applyHaptics.save() // confirm tick on filter apply
                onApply()
            },
            loading = false,
            modifier = Modifier
                .weight(1.6f)
                .graphicsLayer { alpha = if (counting) 0.92f else 1f },
        )
    }
}

/** Sections open the first time the sheet shows. */
val DEFAULT_EXPANDED: Set<String> = setOf("makeModel", "price", "year", "fuel")

@Composable
private fun chipSection(
    key: String,
    titleRes: Int,
    options: List<String>,
    selected: String?,
    expanded: MutableMap<String, Boolean>,
    onToggle: () -> Unit,
    any: String,
    label: @Composable (String) -> String,
    onSelect: (String?) -> Unit,
) {
    FilterSection(
        key = key,
        title = stringResource(titleRes),
        summary = selected?.let { label(it) } ?: any,
        active = selected != null,
        expanded = expanded[key] == true,
        onToggle = onToggle,
        onReset = { onSelect(null) },
    ) {
        ChipGroup(options = options, selected = selected, label = label, onSelect = onSelect)
    }
}

/**
 * One collapsible, inset-grouped section: header (title, current value,
 * Reset when active, chevron that springs 180°) and spring expand/collapse.
 */
@Composable
private fun FilterSection(
    key: String,
    title: String,
    summary: String,
    active: Boolean,
    expanded: Boolean,
    onToggle: () -> Unit,
    onReset: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = MmColors.current
    val t = MmType.current
    val haptics = MmHaptics.current
    val reduced = MmMotion.reduced
    val chevron by animateFloatAsState(if (expanded) 180f else 0f, MmMotion.snappy(), label = "chev-$key")
    Column(
        Modifier
            .fillMaxWidth()
            .clip(MmShapes.lg)
            .background(c.surface.copy(alpha = if (c.isDark) 0.55f else 0.72f))
            .border(0.5.dp, c.outline, MmShapes.lg),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = androidx.compose.material3.ripple(),
                    role = Role.Button,
                ) {
                    haptics.toggle()
                    onToggle()
                }
                .heightIn(min = 56.dp)
                .padding(start = 16.dp, end = 8.dp, top = 10.dp, bottom = 10.dp)
                .semantics(mergeDescendants = true) {
                    heading()
                    stateDescription = summary
                },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(title, style = t.titleS, color = c.textPrimary, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    summary,
                    style = t.caption,
                    color = if (active) c.brandText else c.textTertiary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (active) {
                Text(
                    stringResource(R.string.filter_reset),
                    style = t.label,
                    color = c.brandText,
                    maxLines = 1,
                    modifier = Modifier
                        .clip(MmShapes.pill)
                        .clickable(role = Role.Button) {
                            haptics.unsave()
                            onReset()
                        }
                        .heightIn(min = 40.dp)
                        .padding(horizontal = 10.dp, vertical = 10.dp),
                )
            }
            Icon(
                Icons.Filled.ExpandMore,
                contentDescription = null,
                tint = c.textSecondary,
                modifier = Modifier
                    .padding(start = 2.dp)
                    .size(24.dp)
                    .graphicsLayer { rotationZ = chevron },
            )
        }
        AnimatedVisibility(
            visible = expanded,
            enter = if (reduced) fadeIn(tween(0)) else expandVertically(MmMotion.gentle()) + fadeIn(tween(MmMotion.Base, delayMillis = 40)),
            exit = if (reduced) fadeOut(tween(0)) else shrinkVertically(MmMotion.snappy()) + fadeOut(tween(MmMotion.Fast)),
        ) {
            Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp)) { content() }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChipGroup(
    options: List<String>,
    selected: String?,
    label: @Composable (String) -> String,
    onSelect: (String?) -> Unit,
    allowNone: Boolean = true,
) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { option ->
            val isSel = selected.equals(option, ignoreCase = true)
            MmChip(
                label = label(option),
                selected = isSel,
                onClick = { onSelect(if (isSel && allowNone) null else option) },
            )
        }
    }
}

/** Two-option capsule segmented control (With price / No price). */
@Composable
private fun Segmented(left: String, right: String, rightSelected: Boolean, onSelect: (Boolean) -> Unit) {
    val c = MmColors.current
    val t = MmType.current
    Row(
        Modifier
            .fillMaxWidth()
            .clip(MmShapes.pill)
            .background(c.surfaceHigh)
            .padding(4.dp),
    ) {
        listOf(false to left, true to right).forEach { (isRight, text) ->
            val sel = isRight == rightSelected
            Box(
                Modifier
                    .weight(1f)
                    .clip(MmShapes.pill)
                    .background(if (sel) c.surfaceRaised else androidx.compose.ui.graphics.Color.Transparent)
                    .clickable(role = Role.Tab) { onSelect(isRight) }
                    .heightIn(min = 40.dp)
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(text, style = t.label, color = if (sel) c.textPrimary else c.textSecondary, maxLines = 2)
            }
        }
    }
}

@Composable
private fun MinMaxFields(
    minText: String,
    maxText: String,
    suffix: String?,
    decimal: Boolean,
    onMin: (String) -> Unit,
    onMax: (String) -> Unit,
    minPlaceholder: String = "",
    maxPlaceholder: String = "",
) {
    val any = stringResource(R.string.filter_any)
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        NumberField(minText, stringResource(R.string.filter_min), suffix, minPlaceholder.ifEmpty { any }, decimal, onMin, Modifier.weight(1f))
        NumberField(maxText, stringResource(R.string.filter_max), suffix, maxPlaceholder.ifEmpty { any }, decimal, onMax, Modifier.weight(1f))
    }
}

@Composable
private fun SingleField(text: String, label: String, suffix: String?, placeholder: String, onText: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
        NumberField(text, label, suffix, placeholder, false, onText, Modifier.weight(1f))
        Spacer(Modifier.weight(1f))
    }
}

/**
 * Editable number pill. Keeps its own text while focused so partial input
 * ("2.") is not rewritten by the parsed value; commits on every change.
 */
@Composable
private fun NumberField(
    value: String,
    label: String,
    suffix: String?,
    placeholder: String,
    decimal: Boolean,
    onValue: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    val t = MmType.current
    var text by remember(value) { mutableStateOf(value) }
    Column(
        modifier
            .clip(MmShapes.sm)
            .background(c.surfaceRaised)
            .border(0.5.dp, c.outlineStrong, MmShapes.sm)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(label, style = t.caption, color = c.textTertiary, maxLines = 1)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                if (text.isEmpty()) Text(placeholder, style = t.bodyM.copy(fontFeatureSettings = "tnum"), color = c.textTertiary, maxLines = 1)
                BasicTextField(
                    value = text,
                    onValueChange = { raw ->
                        val cleaned = raw.filter { it.isDigit() || (decimal && it == '.') }.take(if (decimal) 7 else 7)
                        text = cleaned
                        onValue(cleaned)
                    },
                    singleLine = true,
                    textStyle = t.bodyM.copy(color = c.textPrimary, fontFeatureSettings = "tnum"),
                    cursorBrush = SolidColor(c.brand),
                    keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number),
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = label },
                )
            }
            if (suffix != null) {
                Spacer(Modifier.width(4.dp))
                Text(suffix, style = t.bodyS, color = c.textSecondary, maxLines = 1)
            }
        }
    }
}

/** Localised chip label for a category (same strings as the Search chip row). */
@androidx.annotation.StringRes
fun VehicleCategory.chipLabelRes(): Int = when (this) {
    VehicleCategory.CARS -> R.string.vehicle_category_cars
    VehicleCategory.ALL -> R.string.vehicle_category_all
    VehicleCategory.MOTORBIKES -> R.string.vehicle_category_bikes
    VehicleCategory.THREE_WHEELERS -> R.string.vehicle_category_three_wheelers
    VehicleCategory.VANS -> R.string.vehicle_category_vans
    VehicleCategory.LORRIES -> R.string.vehicle_category_lorries
    VehicleCategory.BUSES -> R.string.vehicle_category_buses
    VehicleCategory.HEAVY_DUTY -> R.string.vehicle_category_heavy
    VehicleCategory.TRACTORS -> R.string.vehicle_category_tractors
    VehicleCategory.BOATS -> R.string.vehicle_category_boats
    VehicleCategory.BICYCLES -> R.string.vehicle_category_cycles
    VehicleCategory.OTHERS -> R.string.vehicle_category_other
}
