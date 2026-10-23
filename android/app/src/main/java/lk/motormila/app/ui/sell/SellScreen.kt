package lk.motormila.app.ui.sell

import lk.motormila.app.ui.common.mmScreenSafe
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaPrimarySoft
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.theme.MotormilaGood
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.pressKeyHaptic
import lk.motormila.app.ui.theme.rememberHaptics

/**
 * Basic sell-your-car flow — web `SellYourCar.tsx` parity (essentials only).
 * Single form → POST /api/v1/listings/mine; the listing lands as "pending"
 * for admin review. Requires a signed-in session.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SellScreen(
    onBack: () -> Unit,
    onLoginClick: () -> Unit,
    viewModel: SellViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val loggedIn by viewModel.loggedIn.collectAsStateWithLifecycle()
    val haptics = rememberHaptics()

    lk.motormila.app.ui.common.MmScreen(
        title = stringResource(R.string.sell_title),
        // Tab root: no back chevron (onBack kept for API compatibility).
        showBack = false,
        edgeToEdge = true,
    ) {
        when {
            !loggedIn -> Box(Modifier.mmScreenSafe()) { SellSignedOutCard(onLoginClick = onLoginClick) }
            state.created != null -> Box(Modifier.mmScreenSafe()) {
                SellSuccessCard(
                    make = state.created!!.make,
                    model = state.created!!.model,
                )
            }
            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(lk.motormila.app.ui.common.mmScreenPadding(horizontal = 16.dp, top = 12.dp, bottom = 12.dp)),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        text = stringResource(R.string.sell_subtitle),
                        fontSize = 13.sp,
                        color = MotormilaSecondaryText,
                    )
                    val form = state.form
                    SellField(
                        value = form.make,
                        onChange = { viewModel.updateForm(form.copy(make = it)) },
                        label = stringResource(R.string.sell_make),
                    )
                    SellField(
                        value = form.model,
                        onChange = { viewModel.updateForm(form.copy(model = it)) },
                        label = stringResource(R.string.sell_model),
                    )
                    SellField(
                        value = form.year,
                        onChange = { viewModel.updateForm(form.copy(year = it.filter { c -> c.isDigit() }.take(4))) },
                        label = stringResource(R.string.sell_year),
                        keyboardType = KeyboardType.Number,
                    )
                    SellField(
                        value = form.priceLkr,
                        onChange = { viewModel.updateForm(form.copy(priceLkr = it.filter { c -> c.isDigit() })) },
                        label = stringResource(R.string.sell_price_lkr),
                        keyboardType = KeyboardType.Number,
                    )
                    SellField(
                        value = form.mileage,
                        onChange = { viewModel.updateForm(form.copy(mileage = it.filter { c -> c.isDigit() })) },
                        label = stringResource(R.string.sell_mileage_km),
                        keyboardType = KeyboardType.Number,
                    )
                    ChipPicker(
                        label = stringResource(R.string.sell_fuel),
                        options = listOf("Petrol", "Diesel", "Hybrid", "Electric"),
                        selected = form.fuelType,
                        onSelect = { viewModel.updateForm(form.copy(fuelType = it)) },
                    )
                    ChipPicker(
                        label = stringResource(R.string.sell_transmission),
                        options = listOf("Automatic", "Manual", "CVT"),
                        selected = form.transmission,
                        onSelect = { viewModel.updateForm(form.copy(transmission = it)) },
                    )
                    ChipPicker(
                        label = stringResource(R.string.sell_condition),
                        options = listOf("Used", "Reconditioned", "Brand New"),
                        selected = form.condition,
                        onSelect = { viewModel.updateForm(form.copy(condition = it)) },
                    )
                    SellField(
                        value = form.district,
                        onChange = { viewModel.updateForm(form.copy(district = it)) },
                        label = stringResource(R.string.sell_district),
                    )
                    SellField(
                        value = form.city,
                        onChange = { viewModel.updateForm(form.copy(city = it)) },
                        label = stringResource(R.string.sell_city),
                    )
                    SellField(
                        value = form.contactName,
                        onChange = { viewModel.updateForm(form.copy(contactName = it)) },
                        label = stringResource(R.string.sell_contact_name),
                    )
                    SellField(
                        value = form.contactPhone,
                        onChange = { viewModel.updateForm(form.copy(contactPhone = it)) },
                        label = stringResource(R.string.sell_contact_phone),
                        keyboardType = KeyboardType.Phone,
                    )
                    SellField(
                        value = form.description,
                        onChange = { viewModel.updateForm(form.copy(description = it)) },
                        label = stringResource(R.string.sell_description),
                        singleLine = false,
                    )
                    if (state.error != null || state.needsLogin) {
                        ErrorState(
                            message = state.error ?: stringResource(R.string.sell_login_required),
                            onRetry = viewModel::submit,
                            cachedAvailable = false,
                            onLogin = onLoginClick,
                        )
                    }
                    MotormilaPrimaryButton(
                        label = if (state.submitting) {
                            stringResource(R.string.sell_submitting)
                        } else {
                            stringResource(R.string.sell_submit)
                        },
                        onClick = viewModel::submit,
                        enabled = !state.submitting,
                        loading = state.submitting,
                        modifier = Modifier.pressKeyHaptic(haptics),
                    )
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

/**
 * Signed-out Sell state: a compact, content-height card (hero icon, title, three benefit rows,
 * sign-in CTA) instead of a full-height slab with a single line (audit B12).
 */
@Composable
private fun SellSignedOutCard(onLoginClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        MotormilaSurface(modifier = Modifier.fillMaxWidth()) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 24.dp),
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(MotormilaPrimarySoft),
                ) {
                    Icon(
                        Icons.Filled.DirectionsCar,
                        contentDescription = null,
                        tint = MotormilaPrimaryBright,
                        modifier = Modifier.size(28.dp),
                    )
                }
                Text(
                    text = stringResource(R.string.sell_signed_out_title),
                    fontSize = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MotormilaOnSurface,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(R.string.sell_login_required),
                    fontSize = 14.sp,
                    color = MotormilaSecondaryText,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(4.dp))
                Column(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    SellBenefitRow(stringResource(R.string.sell_benefit_fast))
                    SellBenefitRow(stringResource(R.string.sell_benefit_price))
                    SellBenefitRow(stringResource(R.string.sell_benefit_reviewed))
                }
                Spacer(Modifier.height(4.dp))
                MotormilaPrimaryButton(
                    label = stringResource(R.string.sell_login_cta),
                    onClick = onLoginClick,
                )
            }
        }
    }
}

@Composable
private fun SellBenefitRow(text: String) {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Icon(
            Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = MotormilaGood,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = text,
            fontSize = 14.sp,
            color = MotormilaOnSurface,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun SellField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = singleLine,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        modifier = Modifier.fillMaxWidth(),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChipPicker(
    label: String,
    options: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = label,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = MotormilaSecondaryText,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            options.forEach { option ->
                MotormilaChoiceChip(
                    label = option,
                    selected = selected == option,
                    onClick = { onSelect(option) },
                    compact = true,
                )
            }
        }
    }
}

@Composable
private fun SellSuccessCard(make: String, model: String) {
    MotormilaSurface(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.padding(24.dp),
        ) {
            Icon(
                Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = MotormilaGood,
            )
            Text(
                text = stringResource(R.string.sell_success_title),
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = MotormilaOnSurface,
            )
            Text(
                text = stringResource(R.string.sell_success_body, "$make $model"),
                fontSize = 14.sp,
                color = MotormilaSecondaryText,
            )
        }
    }
}
