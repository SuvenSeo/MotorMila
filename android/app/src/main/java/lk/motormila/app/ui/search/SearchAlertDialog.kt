package lk.motormila.app.ui.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import lk.motormila.app.R
import lk.motormila.app.domain.model.VehicleCategory
import lk.motormila.app.ui.components.bodyLabel
import lk.motormila.app.ui.components.chipLabelRes
import lk.motormila.app.ui.components.optionLabel
import lk.motormila.app.ui.components.sourceLabel
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmType
import java.text.NumberFormat

@Composable
internal fun SearchAlertDialog(
    review: SearchAlertReview, signedIn: Boolean, saving: Boolean, error: String?,
    onConfirm: () -> Unit, onSignIn: () -> Unit, onEdit: () -> Unit,
) {
    val rule = review.rule
    val c = MmColors.current
    val t = MmType.current
    AlertDialog(
        onDismissRequest = { if (!saving) onEdit() },
        title = { Text(stringResource(R.string.buyer_search_review_title)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (rule != null) {
                    Text(stringResource(R.string.buyer_search_matches), style = t.label, color = c.textPrimary)
                    Text(listOfNotNull(
                        rule.make?.let { field(R.string.filter_make_label, it) },
                        rule.model?.let { field(R.string.filter_model_label, it) },
                        rule.district?.let { field(R.string.filter_section_district, it) },
                        rule.maxPriceLkr?.let { stringResource(R.string.filter_up_to, rupees(it)) },
                    ).joinToString("\n"), style = t.bodyM)
                } else {
                    Text(stringResource(R.string.buyer_search_need_filter), style = t.bodyM)
                }
                Text(stringResource(R.string.buyer_search_not_matched), style = t.label, color = c.textPrimary)
                Text(review.excluded.map { (key, value) -> excludedLabel(key, value) }.joinToString("\n"), style = t.bodyS)
                if (rule != null) Text(stringResource(R.string.buyer_search_delivery), style = t.bodyS)
                if (error != null) Text(error, style = t.bodyS)
            }
        },
        confirmButton = {
            if (rule != null) TextButton(enabled = !saving, onClick = if (signedIn) onConfirm else onSignIn) {
                Text(stringResource(when {
                    saving -> R.string.buyer_search_saving
                    !signedIn -> R.string.buyer_search_sign_in
                    else -> R.string.buyer_search_confirm
                }))
            } else TextButton(onClick = onEdit) { Text(stringResource(R.string.buyer_search_edit)) }
        },
        dismissButton = {
            if (rule != null) TextButton(enabled = !saving, onClick = onEdit) { Text(stringResource(R.string.buyer_search_edit)) }
        },
    )
}

@Composable
private fun rupees(amount: Double): String = stringResource(R.string.buyer_search_rupees,
    NumberFormat.getNumberInstance().apply { maximumFractionDigits = 340 }.format(amount))

@Composable
private fun field(label: Int, value: String) = stringResource(R.string.buyer_search_field, stringResource(label), value)

@Composable
private fun excludedLabel(key: SearchCriterion, value: String): String = when (key) {
    SearchCriterion.KEYWORD -> field(R.string.buyer_search_keyword, value)
    SearchCriterion.CATEGORY -> field(R.string.filter_section_vehicle, VehicleCategory.entries.firstOrNull { it.apiValue == value }
        ?.let { stringResource(it.chipLabelRes()) } ?: value)
    SearchCriterion.YEAR_MIN -> field(R.string.filter_from_year, value)
    SearchCriterion.YEAR_MAX -> field(R.string.filter_to_year, value)
    SearchCriterion.PRICE_MIN -> field(R.string.buyer_search_min_price, rupees(value.toDouble()))
    SearchCriterion.MILEAGE -> field(R.string.filter_section_mileage, "≤ $value km")
    SearchCriterion.FUEL -> field(R.string.filter_section_fuel, optionLabel(value))
    SearchCriterion.TRANSMISSION -> field(R.string.filter_section_transmission, optionLabel(value))
    SearchCriterion.CONDITION -> field(R.string.filter_section_condition, optionLabel(value))
    SearchCriterion.BODY -> field(R.string.filter_section_body, bodyLabel(value))
    SearchCriterion.SOURCE -> field(R.string.filter_section_source, sourceLabel(value))
    SearchCriterion.INVENTORY -> field(R.string.filter_section_inventory, when (value) {
        "priced" -> stringResource(R.string.filter_with_price)
        "unavailable" -> stringResource(R.string.filter_no_price)
        else -> value
    })
    SearchCriterion.ARCHIVE -> stringResource(R.string.filter_include_archive)
    SearchCriterion.SORT -> sortLabel(value)
}
