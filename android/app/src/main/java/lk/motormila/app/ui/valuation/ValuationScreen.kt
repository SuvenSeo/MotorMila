package lk.motormila.app.ui.valuation

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.core.format.formatLkr
import lk.motormila.app.core.ui.SectionTitle
import lk.motormila.app.ui.components.MotormilaChipTabs
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaMetricTile
import lk.motormila.app.ui.components.MotormilaPage
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.SlidingNumber
import lk.motormila.app.ui.components.rememberReducedMotion
import lk.motormila.app.ui.components.shimmer
import lk.motormila.app.ui.theme.MotionTokens
import lk.motormila.app.ui.theme.MotormilaBad
import lk.motormila.app.ui.theme.MotormilaGood
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurface as MotormilaSurfaceColor
import lk.motormila.app.ui.theme.MotormilaSurfaceHigh
import lk.motormila.app.ui.theme.MotormilaWarn
import lk.motormila.app.ui.theme.applePress
import lk.motormila.app.ui.theme.rememberHaptics
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

private val calcTabs = listOf("Workbench", "Landed", "Lease", "TCO", "Bundle", "Permits", "Deprec.")

/** EaseOutCubic (0.2, 0, 0, 1) — the spec's standard easing for the valuation reveal. */
private val EaseOutCubic = CubicBezierEasing(0.2f, 0f, 0f, 1f)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ValuationScreen(
    onOpenListing: (id: Int) -> Unit,
    viewModel: ValuationViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    var tab by remember { mutableIntStateOf(0) }

    LaunchedEffect(state.error, state.estimateError) {
        (state.error ?: state.estimateError)?.let {
            snacks.showSnackbar(it)
            viewModel.onEvent(ValuationUiEvent.DismissError)
        }
    }

    MotormilaPage(title = "Valuation", snackbarHostState = snacks) {
        Column(Modifier.fillMaxSize()) {
            MotormilaChipTabs(
                tabs = calcTabs,
                selected = tab,
                onSelect = { tab = it },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            when (tab) {
                // Pull-to-refresh re-runs the appraisal with the current inputs;
                // the indicator tracks the estimate — no full-screen takeover.
                0 -> PullToRefreshBox(
                    isRefreshing = state.estimating,
                    onRefresh = { viewModel.onEvent(ValuationUiEvent.Estimate) },
                    modifier = Modifier.fillMaxSize(),
                ) {
                    ValuationWorkbenchTab(state, viewModel, onOpenListing)
                }
                1 -> LandedTab(state, viewModel)
                2 -> LeaseTab(state, viewModel)
                3 -> TcoTab(state, viewModel)
                4 -> BundleTab(state, viewModel)
                5 -> PermitsTab()
                else -> DeprecationTab(state, viewModel)
            }
        }
    }
}

// ---------- 1. Valuation Workbench (Multi-Step Appraisal Wizard) ----------

@Composable
private fun ValuationWorkbenchTab(
    state: ValuationUiState,
    viewModel: ValuationViewModel,
    onOpenListing: (Int) -> Unit,
) {
    var step by remember { mutableIntStateOf(1) }

    // When a result arrives, advance to Step 3
    LaunchedEffect(state.result) {
        if (state.result != null) {
            step = 3
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Hero Header Section
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                // Eyebrow pill
                Surface(
                    shape = MotormilaRadius.pill,
                    color = MotormilaSurfaceHigh,
                    border = BorderStroke(1.dp, MotormilaOutline),
                ) {
                    Text(
                        text = "• ⏱ VALUATION WORKBENCH",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp,
                            color = MotormilaPrimaryBright,
                        ),
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }

                // Headline with negative letter spacing
                Text(
                    text = "What's your car worth?",
                    style = MaterialTheme.typography.headlineLarge.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.5).sp,
                        color = MotormilaOnSurface,
                    ),
                )

                // Subtitle
                Text(
                    text = "District-aware fair value ranges, trend projection, and seller ask guidance from live Sri Lanka inventory.",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = MotormilaSecondaryText,
                        lineHeight = 20.sp,
                    ),
                )
            }
        }

        // Multi-step appraisal wizard indicator
        item {
            MotormilaSurface(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp)) {
                AppraisalWizardStepIndicator(
                    currentStep = step,
                    onStepClick = { targetStep ->
                        if (targetStep == 1) {
                            step = 1
                        } else if (targetStep == 2) {
                            val f = state.form
                            if (f.make.isNotBlank() && f.model.isNotBlank()) {
                                step = 2
                            }
                        } else if (targetStep == 3 && state.result != null) {
                            step = 3
                        }
                    },
                )
            }
        }

        // Wizard Step Content
        when (step) {
            1 -> {
                item {
                    Step01VehicleProfile(
                        state = state,
                        viewModel = viewModel,
                        onNext = { step = 2 },
                    )
                }
            }
            2 -> {
                item {
                    Step02MileageCondition(
                        state = state,
                        viewModel = viewModel,
                        onBack = { step = 1 },
                        onEstimate = {
                            viewModel.onEvent(ValuationUiEvent.Estimate)
                            step = 3
                        },
                    )
                }
            }
            else -> {
                item {
                    Step03ValuationGuidance(
                        state = state,
                        viewModel = viewModel,
                        onModify = { step = 2 },
                        onReset = {
                            step = 1
                            viewModel.onEvent(
                                ValuationUiEvent.FormChanged(
                                    ValuationForm(
                                        make = "",
                                        model = "",
                                        year = "",
                                        condition = "Good",
                                        transmission = "Automatic",
                                        fuel = "Petrol",
                                        mileageKm = "",
                                        district = "Colombo",
                                    ),
                                ),
                            )
                        },
                        onOpenListing = onOpenListing,
                    )
                }
            }
        }
    }
}

@Composable
private fun AppraisalWizardStepIndicator(
    currentStep: Int,
    onStepClick: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val steps = listOf(
        1 to "Profile",
        2 to "Mileage & Cond.",
        3 to "Valuation",
    )
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        steps.forEachIndexed { index, (stepNum, title) ->
            val isActive = currentStep == stepNum
            val isCompleted = currentStep > stepNum
            val statusColor = when {
                isActive -> MotormilaPrimary
                isCompleted -> MotormilaGood
                else -> MotormilaSecondaryText.copy(alpha = 0.5f)
            }

            val stepPress = remember { MutableInteractionSource() }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .applePress(stepPress)
                    .clip(MotormilaRadius.lg)
                    .clickable(
                        interactionSource = stepPress,
                        indication = null,
                        onClick = { onStepClick(stepNum) },
                    )
                    .padding(vertical = 4.dp, horizontal = 2.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(
                            if (isActive) MotormilaPrimary
                            else if (isCompleted) MotormilaGood.copy(alpha = 0.2f)
                            else MotormilaSurfaceColor,
                        )
                        .border(1.dp, statusColor, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    if (isCompleted) {
                        Icon(
                            imageVector = Icons.Filled.Check,
                            contentDescription = null,
                            tint = MotormilaGood,
                            modifier = Modifier.size(14.dp),
                        )
                    } else {
                        Text(
                            text = "0$stepNum",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                color = if (isActive) MotormilaOnSurface else MotormilaSecondaryText,
                            ),
                        )
                    }
                }
                Spacer(Modifier.width(6.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = if (isActive) FontWeight.Bold else FontWeight.Medium,
                        color = if (isActive) MotormilaOnSurface else MotormilaSecondaryText,
                    ),
                )
            }

            if (index < steps.size - 1) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 6.dp)
                        .height(1.dp)
                        .background(if (currentStep > index + 1) MotormilaGood else MotormilaOutline),
                )
            }
        }
    }
}

// ---------- STEP 01: Vehicle Profile ----------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Step01VehicleProfile(
    state: ValuationUiState,
    viewModel: ValuationViewModel,
    onNext: () -> Unit,
) {
    val f = state.form
    val popularMakes = listOf("Toyota", "Honda", "Nissan", "Suzuki", "Mitsubishi", "Hyundai")
    val popularModels = when (f.make.lowercase().trim()) {
        "toyota" -> listOf("Premio", "Axio", "Vitz", "Aqua", "Prius", "Corolla", "CHR", "Raize")
        "honda" -> listOf("Grace", "Vezel", "Fit", "Civic", "Insight", "CR-V")
        "suzuki" -> listOf("Alto", "Wagon R", "Swift", "Spacia", "Hustler")
        "nissan" -> listOf("Leaf", "Dayz", "X-Trail", "March", "Note e-Power")
        "mitsubishi" -> listOf("Montero", "Outlander", "Attrage", "Eclipse Cross")
        else -> listOf("Premio", "Grace", "Alto", "Wagon R", "Vezel", "Aqua")
    }
    val years = listOf("2024", "2022", "2020", "2018", "2015", "2012")

    MotormilaSurface(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            // Step header
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.DirectionsCar, contentDescription = null, tint = MotormilaPrimary)
                Column {
                    Text(
                        text = "STEP 01: Vehicle profile",
                        style = MaterialTheme.typography.titleSmall.copy(
                            fontWeight = FontWeight.Bold,
                            color = MotormilaOnSurface,
                        ),
                    )
                    Text(
                        text = "Specify basic specifications to anchor market comps.",
                        style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                    )
                }
            }

            // Make Field & Suggestions
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                GlassTextField(
                    label = "Make",
                    value = f.make,
                    onChange = { viewModel.onEvent(ValuationUiEvent.FormChanged(f.copy(make = it))) },
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    popularMakes.forEach { m ->
                        MotormilaChoiceChip(
                            label = m,
                            selected = f.make.equals(m, ignoreCase = true),
                            onClick = { viewModel.onEvent(ValuationUiEvent.FormChanged(f.copy(make = m))) },
                            compact = true,
                        )
                    }
                }
            }

            // Model Field & Suggestions
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                GlassTextField(
                    label = "Model",
                    value = f.model,
                    onChange = { viewModel.onEvent(ValuationUiEvent.FormChanged(f.copy(model = it))) },
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    popularModels.forEach { m ->
                        MotormilaChoiceChip(
                            label = m,
                            selected = f.model.equals(m, ignoreCase = true),
                            onClick = { viewModel.onEvent(ValuationUiEvent.FormChanged(f.copy(model = m))) },
                            compact = true,
                        )
                    }
                }
            }

            // Year Field & Suggestions
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                GlassTextField(
                    label = "Year",
                    value = f.year,
                    keyboardType = KeyboardType.Number,
                    onChange = { viewModel.onEvent(ValuationUiEvent.FormChanged(f.copy(year = it))) },
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    years.forEach { y ->
                        MotormilaChoiceChip(
                            label = y,
                            selected = f.year == y,
                            onClick = { viewModel.onEvent(ValuationUiEvent.FormChanged(f.copy(year = y))) },
                            compact = true,
                        )
                    }
                }
            }

            // Transmission Selector
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Transmission", style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("Automatic", "Manual", "CVT", "Tiptronic").forEach { t ->
                        MotormilaChoiceChip(
                            label = t,
                            selected = f.transmission.equals(t, ignoreCase = true),
                            onClick = { viewModel.onEvent(ValuationUiEvent.FormChanged(f.copy(transmission = t))) },
                            compact = true,
                        )
                    }
                }
            }

            // Fuel Selector
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Fuel type", style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("Petrol", "Diesel", "Hybrid", "Electric", "Plug-in Hybrid").forEach { fuel ->
                        MotormilaChoiceChip(
                            label = fuel,
                            selected = f.fuel.equals(fuel, ignoreCase = true),
                            onClick = { viewModel.onEvent(ValuationUiEvent.FormChanged(f.copy(fuel = fuel))) },
                            compact = true,
                        )
                    }
                }
            }

            // District Selector
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Target district", style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("Colombo", "Gampaha", "Kandy", "Kurunegala", "Kalutara", "Galle").forEach { d ->
                        MotormilaChoiceChip(
                            label = d,
                            selected = f.district.equals(d, ignoreCase = true),
                            onClick = { viewModel.onEvent(ValuationUiEvent.FormChanged(f.copy(district = d))) },
                            compact = true,
                        )
                    }
                }
            }

            Spacer(Modifier.height(4.dp))

            // Step 1 Next Button
            val isReady = f.make.isNotBlank() && f.model.isNotBlank() && f.year.isNotBlank()
            MotormilaPrimaryButton(
                label = "Continue to Mileage & Condition",
                enabled = isReady,
                leadingIcon = Icons.Filled.ArrowForward,
            ) { onNext() }
            if (!isReady) {
                Text(
                    text = "Please enter make, model, and year to continue.",
                    style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                )
            }
    }
}

// ---------- STEP 02: Mileage & Condition ----------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Step02MileageCondition(
    state: ValuationUiState,
    viewModel: ValuationViewModel,
    onBack: () -> Unit,
    onEstimate: () -> Unit,
) {
    val f = state.form
    val mileagePresets = listOf("20,000", "45,000", "70,000", "100,000", "140,000")

    MotormilaSurface(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            // Step header
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.Speed, contentDescription = null, tint = MotormilaPrimary)
                Column {
                    Text(
                        text = "STEP 02: Mileage & Condition",
                        style = MaterialTheme.typography.titleSmall.copy(
                            fontWeight = FontWeight.Bold,
                            color = MotormilaOnSurface,
                        ),
                    )
                    Text(
                        text = "Calibrate odometer degradation and physical vehicle grade.",
                        style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                    )
                }
            }

            // Summary of vehicle selected
            Surface(
                shape = MotormilaRadius.lg,
                color = MotormilaSurfaceColor,
                border = BorderStroke(1.dp, MotormilaOutline),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            text = "${f.year} ${f.make} ${f.model}".trim().ifBlank { "Vehicle" },
                            style = MaterialTheme.typography.bodyMedium.copy(
                                fontWeight = FontWeight.Bold,
                                color = MotormilaOnSurface,
                            ),
                        )
                        Text(
                            text = "${f.transmission} · ${f.fuel} · ${f.district}",
                            style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                        )
                    }
                    MotormilaChoiceChip(
                        label = "Edit profile",
                        selected = false,
                        onClick = onBack,
                        compact = true,
                    )
                }
            }

            // Odometer Input
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                GlassTextField(
                    label = "Odometer reading (km)",
                    value = f.mileageKm,
                    keyboardType = KeyboardType.Number,
                    onChange = { viewModel.onEvent(ValuationUiEvent.FormChanged(f.copy(mileageKm = it))) },
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    mileagePresets.forEach { km ->
                        MotormilaChoiceChip(
                            label = "$km km",
                            selected = f.mileageKm == km.replace(",", ""),
                            onClick = {
                                viewModel.onEvent(ValuationUiEvent.FormChanged(f.copy(mileageKm = km.replace(",", ""))))
                            },
                            compact = true,
                        )
                    }
                }
            }

            // Condition Selector: Excellent, Good, Fair
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Condition grade",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        color = MotormilaSecondaryText,
                    ),
                )

                val conditions = listOf(
                    Triple(
                        "Excellent",
                        "Pristine / Like-New",
                        "Complete agent/dealer records, flawless exterior/interior, accident-free, top mechanical order.",
                    ),
                    Triple(
                        "Good",
                        "Well Maintained Daily",
                        "Routine service history, minor normal cosmetic wear, sound powertrain, dependable condition.",
                    ),
                    Triple(
                        "Fair",
                        "Wear & Tear / High Mileage",
                        "Noticeable body scratches, interior wear, due for suspension/tyre maintenance.",
                    ),
                )

                conditions.forEach { (condKey, condLabel, condDesc) ->
                    val isSelected = f.condition.equals(condKey, ignoreCase = true)
                    MotormilaSurface(
                        onClick = { viewModel.onEvent(ValuationUiEvent.FormChanged(f.copy(condition = condKey))) },
                        highlighted = isSelected,
                        contentPadding = PaddingValues(12.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(20.dp)
                                    .clip(CircleShape)
                                    .background(if (isSelected) MotormilaPrimary else Color.Transparent)
                                    .border(1.5.dp, if (isSelected) MotormilaPrimary else MotormilaSecondaryText, CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (isSelected) {
                                    Icon(
                                        Icons.Filled.Check,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(12.dp),
                                    )
                                }
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Text(
                                        text = condKey,
                                        style = MaterialTheme.typography.bodyMedium.copy(
                                            fontWeight = FontWeight.Bold,
                                            color = if (isSelected) MotormilaPrimaryBright else MotormilaOnSurface,
                                        ),
                                    )
                                    Text(
                                        text = "• $condLabel",
                                        style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                                    )
                                }
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = condDesc,
                                    style = MaterialTheme.typography.bodySmall.copy(
                                        color = MotormilaSecondaryText,
                                        lineHeight = 16.sp,
                                    ),
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(4.dp))

            // Action row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                MotormilaGhostButton(
                    label = "Back",
                    fillMaxWidth = false,
                    leadingIcon = Icons.Filled.ArrowBack,
                    modifier = Modifier.weight(0.8f),
                ) { onBack() }

                MotormilaPrimaryButton(
                    label = if (state.estimating) "Appraising..." else "Calculate Valuation",
                    enabled = f.mileageKm.isNotBlank() && !state.estimating,
                    loading = state.estimating,
                    fillMaxWidth = false,
                    leadingIcon = Icons.Filled.ArrowForward,
                    modifier = Modifier.weight(1.2f),
                ) { onEstimate() }
            }
    }
}

// ---------- STEP 03: Valuation & Guidance ----------

@Composable
private fun Step03ValuationGuidance(
    state: ValuationUiState,
    viewModel: ValuationViewModel,
    onModify: () -> Unit,
    onReset: () -> Unit,
    onOpenListing: (Int) -> Unit,
) {
    val r = state.result
    val f = state.form
    val clipboard = LocalClipboardManager.current
    var copiedWhatsApp by remember { mutableStateOf(false) }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()

    // Superpower §7.3 — valuation reveal, choreographed ONCE per fresh estimate.
    // revealTick bumps only when an estimate that started while this screen was
    // composed lands (estimating true→false with a result). A cached result on
    // first open renders settled — no replay, no stray confirm haptic.
    var revealTick by remember { mutableIntStateOf(0) }
    var seenEstimating by remember { mutableStateOf(false) }
    LaunchedEffect(state.estimating, r) {
        if (state.estimating) {
            seenEstimating = true
        } else if (seenEstimating && r != null) {
            seenEstimating = false
            revealTick++
        }
    }
    val freshReveal = revealTick > 0
    // Gauge sweep 0→estimate over 800ms EaseOutCubic.
    val gaugeSweep = remember(revealTick) { Animatable(if (reducedMotion || !freshReveal) 1f else 0f) }
    LaunchedEffect(revealTick) {
        if (reducedMotion || !freshReveal) return@LaunchedEffect
        gaugeSweep.animateTo(1f, tween(800, easing = EaseOutCubic))
    }
    // Digits count up via NumberTicker: start at 0, roll to the median on reveal.
    var shownMedianLkr by remember(revealTick) {
        mutableStateOf(if (freshReveal) 0L else r?.medianLkr?.toLong() ?: 0L)
    }
    LaunchedEffect(revealTick) {
        if (!freshReveal) return@LaunchedEffect
        shownMedianLkr = r?.medianLkr?.toLong() ?: 0L
    }
    // Verdict chip springs in with spatialExpressive() + confirm haptic.
    val chipScale = remember(revealTick) { Animatable(if (reducedMotion || !freshReveal) 1f else 0.55f) }
    LaunchedEffect(revealTick) {
        if (reducedMotion || !freshReveal) return@LaunchedEffect
        chipScale.animateTo(1f, MotionTokens.spatialExpressive())
        haptics.confirm()
    }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Step banner
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column {
                Text(
                    text = "STEP 03: Valuation & Guidance",
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.8.sp,
                        color = MotormilaPrimaryBright,
                    ),
                )
                Text(
                    text = "FMV calculation, range confidence, negotiation angle, and seller ask targets.",
                    style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                )
            }
            MotormilaChoiceChip(
                label = "Edit inputs",
                selected = false,
                onClick = onModify,
                compact = true,
            )
        }

        // When estimating / loading — motion spec §5: skeleton→result via
        // Crossfade(200ms); the skeleton mirrors the result card (gauge area + rows).
        Crossfade(
            targetState = state.estimating,
            animationSpec = tween(durationMillis = 200),
            label = "estimate-swap",
        ) { estimating ->
            if (estimating) {
                EstimatingSkeleton()
            } else if (r != null) {
            // 1. Fair Market Value Hero Card
            MotormilaSurface(
                contentPadding = PaddingValues(20.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.semantics {
                    contentDescription = "Valuation ${formatLkr(r.medianLkr)}, confidence ${r.confidence}"
                },
            ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "FAIR MARKET VALUE ESTIMATE",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp,
                                color = MotormilaSecondaryText,
                            ),
                        )
                        val verdictColor = when (r.verdict.lowercase()) {
                            "great_deal" -> MotormilaGood
                            "fair", "fair_deal" -> MotormilaWarn
                            else -> MotormilaBad
                        }
                        Surface(
                            shape = MotormilaRadius.pill,
                            color = verdictColor.copy(alpha = 0.15f),
                            border = BorderStroke(1.dp, verdictColor.copy(alpha = 0.4f)),
                            // Superpower §7.3: verdict chip springs in with
                            // spatialExpressive() + confirm haptic (see revealTick).
                            modifier = Modifier.graphicsLayer {
                                val s = chipScale.value
                                scaleX = s
                                scaleY = s
                                alpha = ((s - 0.55f) / 0.45f).coerceIn(0f, 1f)
                            },
                        ) {
                            Text(
                                text = r.verdictLabel.ifBlank { r.verdict.replace("_", " ").uppercase() },
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    color = verdictColor,
                                ),
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            )
                        }
                    }

                    Text(
                        text = r.vehicleLabel.ifBlank { "${f.year} ${f.make} ${f.model}" },
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )

                    // Superpower §7.3 — estimate gauge: arc draws 0→estimate
                    // over 800ms EaseOutCubic, driven by gaugeSweep.
                    Box(
                        modifier = Modifier.fillMaxWidth(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Canvas(
                            modifier = Modifier
                                .width(160.dp)
                                .height(88.dp)
                                .semantics { contentDescription = "Estimate confidence sweep" },
                        ) {
                            val stroke = 12.dp.toPx()
                            drawArc(
                                color = MotormilaSurfaceHigh,
                                startAngle = 180f,
                                sweepAngle = 180f,
                                useCenter = false,
                                style = Stroke(width = stroke, cap = StrokeCap.Round),
                            )
                            drawArc(
                                color = MotormilaPrimary,
                                startAngle = 180f,
                                sweepAngle = 180f * gaugeSweep.value,
                                useCenter = false,
                                style = Stroke(width = stroke, cap = StrokeCap.Round),
                            )
                            val angle = PI * (1.0 - gaugeSweep.value)
                            val cx = size.width / 2f
                            val cy = size.height - stroke / 2f
                            val radius = size.width / 2f - stroke
                            drawCircle(
                                color = MotormilaPrimaryBright,
                                radius = 5.dp.toPx(),
                                center = Offset(
                                    (cx + radius * cos(angle)).toFloat(),
                                    (cy - radius * sin(angle)).toFloat(),
                                ),
                            )
                        }
                    }

                    // Large Monospace Price — counts up via NumberTicker on each reveal.
                    SlidingNumber(
                        value = shownMedianLkr,
                        prefix = "Rs. ",
                        style = MaterialTheme.typography.displayMedium.copy(
                            fontWeight = FontWeight.Bold,
                        ),
                        color = MotormilaOnSurface,
                    )

                    Text(
                        text = "Estimated median based on ${r.comparableCount} comparable listings in Sri Lanka.",
                        style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                    )
            }

            // 2. FMV Range Bar Card
            MotormilaSurface(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = "FMV RANGE & CONFIDENCE INTERVAL",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp,
                            color = MotormilaSecondaryText,
                        ),
                    )

                    // Low / Median / High values
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column {
                            Text("LOW RANGE", style = MaterialTheme.typography.labelSmall.copy( color = MotormilaSecondaryText))
                            Text(
                                text = formatLkr(r.lowLkr),
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    color = MotormilaOnSurface,
                                ),
                            )
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("FAIR MEDIAN", style = MaterialTheme.typography.labelSmall.copy( color = MotormilaPrimaryBright, fontWeight = FontWeight.Bold))
                            Text(
                                text = formatLkr(r.medianLkr),
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    color = MotormilaPrimaryBright,
                                ),
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("HIGH RANGE", style = MaterialTheme.typography.labelSmall.copy( color = MotormilaSecondaryText))
                            Text(
                                text = formatLkr(r.highLkr),
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    color = MotormilaOnSurface,
                                ),
                            )
                        }
                    }

                    // Graphical Range Bar
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(10.dp)
                            .clip(MotormilaRadius.pill)
                            .background(MotormilaSurfaceColor)
                            .border(1.dp, MotormilaOutline, MotormilaRadius.pill),
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(
                                    Brush.horizontalGradient(
                                        colors = listOf(
                                            MotormilaPrimary.copy(alpha = 0.45f),
                                            MotormilaPrimary,
                                            MotormilaPrimaryBright,
                                        ),
                                    ),
                                ),
                        )
                    }

                    // Confidence rating
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Confidence: ${r.confidence.uppercase()}",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                color = MotormilaPrimaryBright,
                            ),
                        )
                        Text(
                            text = "${r.comparableCount} verified comparables",
                            style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                        )
                    }
            }

            // 3. Strategic Negotiation Angle
            MotormilaSurface(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(Icons.Filled.TrendingDown, contentDescription = null, tint = MotormilaGood)
                        Text(
                            text = "Strategic Negotiation Angle",
                            style = MaterialTheme.typography.titleSmall.copy(
                                fontWeight = FontWeight.Bold,
                                color = MotormilaOnSurface,
                            ),
                        )
                    }

                    Text(
                        text = "In Sri Lanka's automotive market, asking prices settle 5%–15% under listed ask. Anchor negotiations around verified local comps.",
                        style = MaterialTheme.typography.bodySmall.copy(
                            color = MotormilaSecondaryText,
                            lineHeight = 18.sp,
                        ),
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        MotormilaMetricTile(
                            label = "Opening bid",
                            value = formatLkr((r.medianLkr * 0.90).toLong().toDouble()),
                            note = "-10% under median",
                            modifier = Modifier.weight(1f),
                        )
                        MotormilaMetricTile(
                            label = "Target close",
                            value = formatLkr((r.medianLkr * 0.95).toLong().toDouble()),
                            note = "-5% fair settlement",
                            modifier = Modifier.weight(1f),
                        )
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "• Baseline: Comparable asking median in ${f.district} is ${formatLkr(r.medianLkr)}",
                            style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText,),
                        )
                        Text(
                            text = "• Condition note: ${f.condition} grade vehicle with ${f.mileageKm.ifBlank { "50,000" }} km",
                            style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText,),
                        )
                        Text(
                            text = "• Leverage immediate pay / bank draft for additional 2%–4% settlement concession.",
                            style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText,),
                        )
                    }
            }

            // 4. Private Seller Fair Ask Guidance
            MotormilaSurface(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(Icons.Filled.Verified, contentDescription = null, tint = MotormilaPrimary)
                        Text(
                            text = "Private Seller Fair Ask Guidance",
                            style = MaterialTheme.typography.titleSmall.copy(
                                fontWeight = FontWeight.Bold,
                                color = MotormilaOnSurface,
                            ),
                        )
                    }

                    Text(
                        text = "Calibrated asking price strategy to sell promptly without leaving cash on the table.",
                        style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        MotormilaMetricTile(
                            label = "Suggested ask",
                            value = formatLkr((r.medianLkr * 1.04).toLong().toDouble()),
                            note = "+4% negotiation cushion",
                            modifier = Modifier.weight(1f),
                        )
                        MotormilaMetricTile(
                            label = "Walkaway floor",
                            value = formatLkr((r.medianLkr * 0.92).toLong().toDouble()),
                            note = "-8% firm bottom",
                            modifier = Modifier.weight(1f),
                        )
                        MotormilaMetricTile(
                            label = "Dealer offer",
                            value = formatLkr((r.medianLkr * 0.85).toLong().toDouble()),
                            note = "Instant trade-in",
                            modifier = Modifier.weight(1f),
                        )
                    }

                    // Copy WhatsApp Pitch
                    MotormilaPrimaryButton(
                        label = if (copiedWhatsApp) "Copied WhatsApp Report!" else "Copy WhatsApp Negotiation Summary",
                        leadingIcon = if (copiedWhatsApp) Icons.Filled.Check else Icons.Filled.ContentCopy,
                    ) {
                            val text = "🚗 *Motormila Sri Lanka — Valuation Summary*\n" +
                                "• Vehicle: ${f.year} ${f.make} ${f.model}\n" +
                                "• Condition: ${f.condition} | Mileage: ${f.mileageKm} km\n" +
                                "• District: ${f.district}\n" +
                                "• Fair Market Median: ${formatLkr(r.medianLkr)}\n" +
                                "• Suggested Listing Ask: ${formatLkr((r.medianLkr * 1.04).toLong().toDouble())}\n" +
                                "• Walkaway Floor: ${formatLkr((r.medianLkr * 0.92).toLong().toDouble())}\n" +
                                "• Dealer Trade-in Band: ${formatLkr((r.medianLkr * 0.85).toLong().toDouble())} – ${formatLkr((r.medianLkr * 0.91).toLong().toDouble())}\n" +
                                "Generated via Motormila Live Market Intelligence."
                            clipboard.setText(AnnotatedString(text))
                            copiedWhatsApp = true
                    }
            }

            // 5. Comparables
            if (r.comparables.isNotEmpty()) {
                MotormilaSurface(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            text = "LIVE MARKET COMPARABLES",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp,
                                color = MotormilaSecondaryText,
                            ),
                        )

                        r.comparables.take(5).forEach { c ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        text = c.title.ifBlank { "Comparable vehicle" },
                                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                                    )
                                    Text(
                                        text = "${c.district ?: "Sri Lanka"} · ${formatLkr(c.priceLkr)}",
                                        style = MaterialTheme.typography.labelMedium.copy(
                                            color = MotormilaPrimaryBright,
                                            fontFamily = FontFamily.Monospace,
                                        ),
                                    )
                                }
                                MotormilaChoiceChip(
                                    label = "View",
                                    selected = false,
                                    onClick = { onOpenListing(c.id) },
                                    compact = true,
                                )
                            }
                        }
                }
            }

            // Methodology (how the median/range above is derived).
            MotormilaSurface(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "METHODOLOGY",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp,
                            color = MotormilaSecondaryText,
                        ),
                    )
                    Text(
                        text = "Median of live ${r.comparableCount} same-make/model comparables in Sri Lanka, " +
                            "adjusted for mileage band, condition grade (${f.condition}), and district (${f.district}). " +
                            "Range spans the interquartile ask band; confidence reflects sample depth. " +
                            "Indicative only — inspect service history and accident record before committing.",
                        style = MaterialTheme.typography.bodySmall.copy(
                            color = MotormilaSecondaryText,
                            lineHeight = 16.sp,
                        ),
                    )
            }

            // Reset & Appraise another
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                MotormilaGhostButton(
                    label = "Adjust Inputs",
                    fillMaxWidth = false,
                    modifier = Modifier.weight(1f),
                ) { onModify() }

                MotormilaPrimaryButton(
                    label = "Appraise Another",
                    fillMaxWidth = false,
                    modifier = Modifier.weight(1f),
                ) { onReset() }
            }
        } else {
            MotormilaSurface(
                contentPadding = PaddingValues(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                    Text(
                        text = "No valuation active",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    )
                    Text(
                        text = "Complete vehicle specifications in Step 1 and Step 2 to generate an appraisal.",
                        style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    )
                    MotormilaPrimaryButton("Start Appraisal Wizard") { onReset() }
                }
            }
        }
    }
}

/**
 * Estimating skeleton (polish P1 #7): mirrors the valuation result card —
 * header row, gauge area, headline figure, caption and low/median/high rows —
 * with the shared 1200ms shimmer sweep. Static fill when reduced motion is on.
 */
@Composable
private fun EstimatingSkeleton() {
    val reduced = rememberReducedMotion()
    MotormilaSurface(
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.semantics { contentDescription = "Estimating valuation" },
    ) {
        Text(
            text = "Calibrating live Sri Lanka inventory...",
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
            modifier = Modifier.align(Alignment.CenterHorizontally),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.width(150.dp).height(14.dp).clip(MotormilaRadius.pill).shimmer(!reduced))
            Box(Modifier.width(92.dp).height(26.dp).clip(MotormilaRadius.pill).shimmer(!reduced))
        }
        Box(Modifier.width(200.dp).height(18.dp).clip(MotormilaRadius.xs).shimmer(!reduced))
        // Gauge area.
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Box(
                Modifier
                    .width(160.dp)
                    .height(88.dp)
                    .clip(MotormilaRadius.md)
                    .shimmer(!reduced),
            )
        }
        // Headline figure.
        Box(Modifier.width(230.dp).height(36.dp).clip(MotormilaRadius.xs).shimmer(!reduced))
        Box(Modifier.width(260.dp).height(14.dp).clip(MotormilaRadius.pill).shimmer(!reduced))
        Spacer(Modifier.height(4.dp))
        // Low / median / high rows.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            repeat(3) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.width(64.dp).height(12.dp).clip(MotormilaRadius.pill).shimmer(!reduced))
                    Spacer(Modifier.height(6.dp))
                    Box(Modifier.width(84.dp).height(16.dp).clip(MotormilaRadius.xs).shimmer(!reduced))
                }
            }
        }
        // Range bar.
        Box(
            Modifier
                .fillMaxWidth()
                .height(10.dp)
                .clip(MotormilaRadius.pill)
                .shimmer(!reduced),
        )
        Text(
            text = "Synthesizing district asking prices, mileage adjustments, and hedonic regression curves.",
            style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
            modifier = Modifier.align(Alignment.CenterHorizontally),
        )
    }
}

// ---------- Shared Glass TextField Component ----------

@Composable
private fun GlassTextField(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    onChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        shape = MotormilaRadius.lg,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MotormilaPrimary,
            unfocusedBorderColor = MotormilaOutline,
            focusedContainerColor = MotormilaSurfaceColor,
            unfocusedContainerColor = MotormilaSurfaceColor,
            focusedTextColor = MotormilaOnSurface,
            unfocusedTextColor = MotormilaOnSurface,
            focusedLabelColor = MotormilaPrimaryBright,
            unfocusedLabelColor = MotormilaSecondaryText,
        ),
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp),
    )
}

// ---------- Landed cost ----------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LandedTab(state: ValuationUiState, viewModel: ValuationViewModel) {
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            SectionTitle("Landed cost — CIF USD + auto FX macro")
            Text(
                "FX ${state.fxRate?.let { "%.1f LKR/USD (offline default)".format(it) } ?: "loading…"}",
                style = MaterialTheme.typography.labelMedium.copy(color = MotormilaSecondaryText),
            )
            val i = state.landedInput
            GlassTextField("CIF (USD)", i.cifUsd, keyboardType = KeyboardType.Number) {
                viewModel.onEvent(ValuationUiEvent.LandedChanged(i.copy(cifUsd = it)))
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GlassTextField("Engine (cc)", i.engineCc, Modifier.weight(1f), keyboardType = KeyboardType.Number) {
                    viewModel.onEvent(ValuationUiEvent.LandedChanged(i.copy(engineCc = it)))
                }
                GlassTextField("Motor (kW, EV)", i.electricKw, Modifier.weight(1f), keyboardType = KeyboardType.Number) {
                    viewModel.onEvent(ValuationUiEvent.LandedChanged(i.copy(electricKw = it)))
                }
            }
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Petrol", "Diesel", "Hybrid", "Electric").forEach { fuel ->
                    MotormilaChoiceChip(
                        label = fuel,
                        selected = i.fuel == fuel,
                        onClick = { viewModel.onEvent(ValuationUiEvent.LandedChanged(i.copy(fuel = fuel))) },
                    )
                }
            }
            ToggleRow("Include clearing (~LKR 450,000)", i.includeClearing) {
                viewModel.onEvent(ValuationUiEvent.LandedChanged(i.copy(includeClearing = it)))
            }
            ToggleRow("Include registration (~LKR 250,000)", i.includeRegistration) {
                viewModel.onEvent(ValuationUiEvent.LandedChanged(i.copy(includeRegistration = it)))
            }
            Spacer(Modifier.height(8.dp))
            MotormilaPrimaryButton("Calculate landed cost") {
                viewModel.onEvent(ValuationUiEvent.CalcLanded)
            }
        }
        state.landed?.let { l ->
            item {
                MotormilaSurface(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Breakdown("CIF", l.cifLkr)
                        Breakdown("Excise", l.exciseLkr)
                        Breakdown("VAT 18%", l.vatLkr)
                        Breakdown("Clearing", l.clearingLkr)
                        Breakdown("Registration", l.registrationLkr)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Total ${formatLkr(l.totalLkr.toLong())}",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace),
                        )
                        Text(
                            "FX used: %.1f · countdown: verify against customs notice before payment.".format(l.fxUsed),
                            style = MaterialTheme.typography.labelSmall,
                            color = MotormilaSecondaryText,
                        )
                }
            }
        }
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = checked, onCheckedChange = onChange, modifier = Modifier.semantics { contentDescription = label })
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun Breakdown(label: String, value: Double) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium.copy(color = MotormilaSecondaryText))
        Text(formatLkr(value.toLong()), style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace))
    }
}

// ---------- Lease / TCO / Bundle / Permits / Depreciation ----------

@Composable
private fun LeaseTab(state: ValuationUiState, viewModel: ValuationViewModel) {
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            SectionTitle("Lease — monthly with LTV guard")
            val i = state.leaseInput
            GlassTextField("Price (LKR)", i.priceLkr, keyboardType = KeyboardType.Number) {
                viewModel.onEvent(ValuationUiEvent.LeaseChanged(i.copy(priceLkr = it)))
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GlassTextField("Down %", i.downPct, Modifier.weight(1f), keyboardType = KeyboardType.Number) {
                    viewModel.onEvent(ValuationUiEvent.LeaseChanged(i.copy(downPct = it)))
                }
                GlassTextField("Rate % p.a.", i.ratePct, Modifier.weight(1f), keyboardType = KeyboardType.Number) {
                    viewModel.onEvent(ValuationUiEvent.LeaseChanged(i.copy(ratePct = it)))
                }
                GlassTextField("Years", i.years, Modifier.weight(1f), keyboardType = KeyboardType.Number) {
                    viewModel.onEvent(ValuationUiEvent.LeaseChanged(i.copy(years = it)))
                }
            }
            Spacer(Modifier.height(8.dp))
            MotormilaSurface(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        "Monthly ${formatLkr(viewModel.leaseMonthly().toLong())}",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace),
                    )
                    if (viewModel.leaseLtvBreached()) {
                        Text(
                            "LTV guard: down payment under 20% — most lenders cap at 80% LTV. Raise the deposit.",
                            color = MotormilaBad,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
            }
        }
    }
}

@Composable
private fun TcoTab(state: ValuationUiState, viewModel: ValuationViewModel) {
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            SectionTitle("Total cost of ownership — monthly")
            val i = state.tcoInput
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GlassTextField("km/day", i.kmPerDay, Modifier.weight(1f), keyboardType = KeyboardType.Number) {
                    viewModel.onEvent(ValuationUiEvent.TcoChanged(i.copy(kmPerDay = it)))
                }
                GlassTextField("km/L", i.kmPerLitre, Modifier.weight(1f), keyboardType = KeyboardType.Number) {
                    viewModel.onEvent(ValuationUiEvent.TcoChanged(i.copy(kmPerLitre = it)))
                }
                GlassTextField("Fuel LKR/L", i.fuelPriceLkr, Modifier.weight(1f), keyboardType = KeyboardType.Number) {
                    viewModel.onEvent(ValuationUiEvent.TcoChanged(i.copy(fuelPriceLkr = it)))
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GlassTextField("Service/yr", i.servicePerYearLkr, Modifier.weight(1f), keyboardType = KeyboardType.Number) {
                    viewModel.onEvent(ValuationUiEvent.TcoChanged(i.copy(servicePerYearLkr = it)))
                }
                GlassTextField("Insurance/yr", i.insurancePerYearLkr, Modifier.weight(1f), keyboardType = KeyboardType.Number) {
                    viewModel.onEvent(ValuationUiEvent.TcoChanged(i.copy(insurancePerYearLkr = it)))
                }
            }
            Spacer(Modifier.height(8.dp))
            MotormilaSurface {
                    Text(
                        "Monthly ${formatLkr(viewModel.tcoMonthly().toLong())}",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace),
                    )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BundleTab(state: ValuationUiState, viewModel: ValuationViewModel) {
    val classes = listOf("Motorcycle", "Car <1000cc", "Car 1000–1500cc", "Car >1500cc", "SUV / Dual purpose")
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            SectionTitle("Ownership bundle — statutory total")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                classes.forEach { c ->
                    MotormilaChoiceChip(
                        label = c,
                        selected = state.bundleClass == c,
                        onClick = { viewModel.onEvent(ValuationUiEvent.BundleChanged(c, state.bundleFuel)) },
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Petrol", "Diesel").forEach { f ->
                    MotormilaChoiceChip(
                        label = f,
                        selected = state.bundleFuel == f,
                        onClick = { viewModel.onEvent(ValuationUiEvent.BundleChanged(state.bundleClass, f)) },
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            MotormilaSurface(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        "Statutory total ${formatLkr(viewModel.ownershipTotal().toLong())}",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace),
                    )
                    Text(
                        "Revenue licence + emission + registration renewal (indicative).",
                        style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                    )
            }
        }
    }
}

@Composable
private fun PermitsTab() {
    val rows = listOf(
        "Revenue licence" to "Annual, by engine capacity",
        "Emission test" to "Annual for most classes",
        "Registration renewal" to "On transfer / expiry",
        "Highway vignette" to "If applicable",
    )
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { SectionTitle("Permits & renewals") }
        rows.forEach { (name, cadence) ->
            item {
                MotormilaSurface {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(name, style = MaterialTheme.typography.bodyLarge.copy(color = MotormilaOnSurface), modifier = Modifier.weight(1f))
                        MotormilaChoiceChip(
                            label = cadence,
                            selected = false,
                            onClick = {},
                            compact = true,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DeprecationTab(state: ValuationUiState, viewModel: ValuationViewModel) {
    val base = state.result?.medianLkr ?: (state.leaseInput.priceLkr.replace(",", "").toDoubleOrNull() ?: 8_000_000.0)
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { SectionTitle("Depreciation — written-down value") }
        viewModel.depreciationSchedule(base).forEach { (label, value) ->
            item {
                MotormilaSurface {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(label, style = MaterialTheme.typography.bodyLarge.copy(color = MotormilaOnSurface))
                        Text(
                            formatLkr(value.toLong()),
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace),
                        )
                    }
                }
            }
        }
    }
}
