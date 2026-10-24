package lk.motormila.app.ui.valuation

import lk.motormila.app.ui.theme.mmTappable
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.util.Calendar
import lk.motormila.app.R
import lk.motormila.app.core.geo.SriLankaDistricts
import lk.motormila.app.ui.common.MmPickerSheet
import lk.motormila.app.ui.common.MmProgressBar
import lk.motormila.app.ui.common.MmScreen
import lk.motormila.app.ui.common.MmSelectField
import lk.motormila.app.ui.common.MmStepper
import lk.motormila.app.ui.common.MmTag
import lk.motormila.app.ui.common.MmTextField
import lk.motormila.app.ui.components.MmButton
import lk.motormila.app.ui.components.MmButtonStyle
import lk.motormila.app.ui.components.MmCard
import lk.motormila.app.ui.components.MmPrice
import lk.motormila.app.ui.components.MmPriceFormat
import lk.motormila.app.ui.components.MmSkeleton
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.valuation.ValuationQuiz.Question
import lk.motormila.app.ui.valuation.ValuationQuiz.Registration

/**
 * Valuation as a short quiz, matching the web /estimate page:
 * car → mileage/registration → 5 one-tap condition questions → range with
 * confidence. The range comes from comparable asking prices only; the quiz
 * just says where in that range this car likely sits.
 */
@Composable
fun ValuationScreen(
    onOpenListing: (id: Int) -> Unit,
    onSeeSimilar: (make: String, model: String) -> Unit,
    viewModel: ValuationViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Edge-to-edge: the wizard scrolls under the glass header (round 4).
    MmScreen(title = stringResource(R.string.scr_val_title), edgeToEdge = true) {
        ValuationContent(
            state = state,
            onEvent = viewModel::onEvent,
            onOpenListing = onOpenListing,
            onSeeSimilar = onSeeSimilar,
        )
    }
}

@Composable
fun ValuationContent(
    state: ValuationUiState,
    onEvent: (ValuationUiEvent) -> Unit,
    onOpenListing: (Int) -> Unit,
    onSeeSimilar: (String, String) -> Unit,
) {
    val c = MmColors.current
    val reduced = MmMotion.reduced
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(lk.motormila.app.ui.common.mmScreenPadding(horizontal = MmSpacing.lg, bottom = MmSpacing.huge)),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Speed, contentDescription = null, tint = c.brandText, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(MmSpacing.xs))
            Text(stringResource(R.string.scr_val_eyebrow), style = MmType.current.label, color = c.brandText)
        }
        Spacer(Modifier.height(MmSpacing.lg))
        StepLabels(state.step)
        Spacer(Modifier.height(MmSpacing.sm))
        MmProgressBar(state.progress)
        Spacer(Modifier.height(MmSpacing.xl))

        // Forward = slide in from the end; back = from the start.
        val stepKey = state.step * 10 + if (state.step == 2) state.questionIndex else 0
        AnimatedContent(
            targetState = stepKey,
            transitionSpec = {
                if (reduced) {
                    fadeIn(MmMotion.standard(0)) togetherWith fadeOut(MmMotion.standard(0))
                } else {
                    val forward = targetState > initialState
                    (
                        slideInHorizontally(MmMotion.snappy()) { w -> if (forward) w / 6 else -w / 6 } +
                            fadeIn(MmMotion.standard(MmMotion.Base, 40))
                        ) togetherWith (
                        slideOutHorizontally(MmMotion.snappy()) { w -> if (forward) -w / 6 else w / 6 } +
                            fadeOut(MmMotion.exit())
                        )
                }
            },
            label = "valuation-step",
        ) { key ->
            val step = key / 10
            MmCard(Modifier.fillMaxWidth()) {
                when (step) {
                    0 -> CarStep(state, onEvent)
                    1 -> DetailsStep(state, onEvent)
                    2 -> QuestionStep(state, key % 10, onEvent)
                    else -> ResultStep(state, onEvent, onOpenListing, onSeeSimilar)
                }
            }
        }
    }
}

@Composable
private fun StepLabels(step: Int) {
    val c = MmColors.current
    val labels = listOf(
        stringResource(R.string.scr_val_step_car),
        stringResource(R.string.scr_val_step_details),
        stringResource(R.string.scr_val_step_condition),
        stringResource(R.string.scr_val_step_result),
    )
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        labels.forEachIndexed { i, label ->
            Text(
                label,
                style = MmType.current.labelS,
                color = if (i <= step) c.textPrimary else c.textTertiary,
                fontWeight = if (i == step) FontWeight.SemiBold else FontWeight.Normal,
            )
        }
    }
}

@Composable
private fun StepHeading(text: String) {
    Text(
        text,
        style = MmType.current.titleL,
        color = MmColors.current.textPrimary,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
private fun CarStep(state: ValuationUiState, onEvent: (ValuationUiEvent) -> Unit) {
    var picker by rememberSaveable { mutableStateOf<String?>(null) }
    val nowYear = remember { Calendar.getInstance().get(Calendar.YEAR) }
    Column(verticalArrangement = Arrangement.spacedBy(MmSpacing.lg)) {
        StepHeading(stringResource(R.string.scr_val_s0_title))
        MmSelectField(
            label = stringResource(R.string.scr_make),
            value = state.make,
            placeholder = stringResource(R.string.scr_select_make),
            onClick = { picker = "make" },
        )
        MmSelectField(
            label = stringResource(R.string.scr_model),
            value = state.model,
            placeholder = if (state.make.isNotBlank() && state.modelsLoading) {
                stringResource(R.string.scr_val_loading_models)
            } else {
                stringResource(R.string.scr_select_model)
            },
            enabled = state.make.isNotBlank(),
            onClick = { picker = "model" },
        )
        MmStepper(
            label = stringResource(R.string.scr_val_year),
            value = state.year,
            onValueChange = { onEvent(ValuationUiEvent.YearChanged(it)) },
            range = 1990..(nowYear + 1),
        )
        MmButton(
            text = stringResource(R.string.scr_next),
            onClick = { onEvent(ValuationUiEvent.Next) },
            enabled = state.step0Valid,
            trailingIcon = Icons.AutoMirrored.Filled.ArrowForward,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    when (picker) {
        "make" -> MmPickerSheet(
            title = stringResource(R.string.scr_make),
            options = state.makes,
            selected = state.make,
            loading = state.makesLoading,
            searchable = true,
            onSelect = { onEvent(ValuationUiEvent.MakeChanged(it)) },
            onDismiss = { picker = null },
        )
        "model" -> MmPickerSheet(
            title = stringResource(R.string.scr_model),
            options = state.models,
            selected = state.model,
            loading = state.modelsLoading,
            onSelect = { onEvent(ValuationUiEvent.ModelChanged(it)) },
            onDismiss = { picker = null },
        )
    }
}

@Composable
private fun DetailsStep(state: ValuationUiState, onEvent: (ValuationUiEvent) -> Unit) {
    var districtPicker by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(MmSpacing.lg)) {
        StepHeading(stringResource(R.string.scr_val_s1_title))
        Text(stringResource(R.string.scr_val_registration), style = MmType.current.label, color = MmColors.current.textSecondary)
        Column(verticalArrangement = Arrangement.spacedBy(MmSpacing.sm)) {
            listOf(
                Registration.USED to R.string.scr_val_reg_used,
                Registration.RECONDITIONED to R.string.scr_val_reg_recon,
                Registration.BRAND_NEW to R.string.scr_val_reg_new,
            ).forEach { (reg, label) ->
                ChoiceRow(
                    label = stringResource(label),
                    selected = state.registration == reg,
                    onClick = { onEvent(ValuationUiEvent.RegistrationChanged(reg)) },
                )
            }
        }
        MmTextField(
            label = stringResource(R.string.scr_val_mileage),
            value = state.mileage,
            onValueChange = { onEvent(ValuationUiEvent.MileageChanged(it)) },
            placeholder = stringResource(R.string.scr_val_mileage_ph),
            numeric = true,
        )
        MmSelectField(
            label = stringResource(R.string.scr_district),
            value = state.district,
            placeholder = stringResource(R.string.scr_district),
            onClick = { districtPicker = true },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(MmSpacing.sm)) {
            MmButton(
                text = stringResource(R.string.scr_back_label),
                onClick = { onEvent(ValuationUiEvent.Back) },
                style = MmButtonStyle.Secondary,
                leadingIcon = Icons.AutoMirrored.Filled.ArrowBack,
            )
            MmButton(
                text = stringResource(R.string.scr_next),
                onClick = { onEvent(ValuationUiEvent.Next) },
                enabled = state.step1Valid,
                trailingIcon = Icons.AutoMirrored.Filled.ArrowForward,
                modifier = Modifier.weight(1f),
            )
        }
    }
    if (districtPicker) {
        MmPickerSheet(
            title = stringResource(R.string.scr_district),
            options = SriLankaDistricts.names,
            selected = state.district,
            searchable = true,
            onSelect = { onEvent(ValuationUiEvent.DistrictChanged(it)) },
            onDismiss = { districtPicker = false },
        )
    }
}

/** Full-width one-tap choice with a check when selected. */
@Composable
private fun ChoiceRow(label: String, selected: Boolean, onClick: () -> Unit) {
    val c = MmColors.current
    val haptics = MmHaptics.current
    val selectedText = stringResource(R.string.scr_selected)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(MmShapes.sm)
            .background(if (selected) c.brandContainer else c.surfaceRaised)
            .border(1.dp, if (selected) c.brand else c.outline, MmShapes.sm)
            .clickable(role = Role.RadioButton) { haptics.toggle(); onClick() }
            .semantics { if (selected) stateDescription = selectedText }
            .padding(horizontal = MmSpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MmType.current.bodyL, color = c.textPrimary, modifier = Modifier.weight(1f))
        if (selected) Icon(Icons.Filled.Check, contentDescription = null, tint = c.brandText)
    }
}

@Composable
private fun questionTitle(q: Question): String = stringResource(
    when (q) {
        Question.ACCIDENTS -> R.string.scr_val_q_accidents
        Question.SERVICE -> R.string.scr_val_q_service
        Question.OWNERS -> R.string.scr_val_q_owners
        Question.FLOOD -> R.string.scr_val_q_flood
        Question.MODS -> R.string.scr_val_q_mods
    },
)

private fun answerLabel(q: Question, value: String): Int = when (q) {
    Question.ACCIDENTS -> when (value) {
        "none" -> R.string.scr_val_a_none
        "minor" -> R.string.scr_val_a_acc_minor
        else -> R.string.scr_val_a_acc_major
    }
    Question.SERVICE -> when (value) {
        "full" -> R.string.scr_val_a_svc_full
        "partial" -> R.string.scr_val_a_svc_partial
        else -> R.string.scr_val_a_none
    }
    Question.OWNERS -> when (value) {
        "1" -> R.string.scr_val_a_own_1
        "2" -> R.string.scr_val_a_own_2
        else -> R.string.scr_val_a_own_3
    }
    Question.FLOOD -> when (value) {
        "no" -> R.string.scr_val_a_no
        "unsure" -> R.string.scr_val_a_unsure
        else -> R.string.scr_val_a_yes
    }
    Question.MODS -> when (value) {
        "none" -> R.string.scr_val_a_stock
        "minor" -> R.string.scr_val_a_mods_minor
        else -> R.string.scr_val_a_mods_major
    }
}

@Composable
private fun QuestionStep(state: ValuationUiState, index: Int, onEvent: (ValuationUiEvent) -> Unit) {
    val q = ValuationQuiz.questions[index.coerceIn(0, ValuationQuiz.questions.lastIndex)]
    val c = MmColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MmSpacing.md)) {
        Text(
            stringResource(R.string.scr_val_q_count, index + 1, ValuationQuiz.questions.size),
            style = MmType.current.labelS,
            color = c.textSecondary,
        )
        StepHeading(questionTitle(q))
        ValuationQuiz.options.getValue(q).forEach { value ->
            ChoiceRow(
                label = stringResource(answerLabel(q, value)),
                selected = state.answers[q] == value,
                onClick = { onEvent(ValuationUiEvent.Answer(q, value)) },
            )
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            MmButton(
                text = stringResource(R.string.scr_back_label),
                onClick = { onEvent(ValuationUiEvent.Back) },
                style = MmButtonStyle.Ghost,
                leadingIcon = Icons.AutoMirrored.Filled.ArrowBack,
            )
            Spacer(Modifier.weight(1f))
            MmButton(
                text = stringResource(R.string.scr_val_skip),
                onClick = { onEvent(ValuationUiEvent.Skip) },
                style = MmButtonStyle.Ghost,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ResultStep(
    state: ValuationUiState,
    onEvent: (ValuationUiEvent) -> Unit,
    onOpenListing: (Int) -> Unit,
    onSeeSimilar: (String, String) -> Unit,
) {
    val c = MmColors.current
    Column(
        verticalArrangement = Arrangement.spacedBy(MmSpacing.lg),
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        StepHeading("${state.year} ${state.make} ${state.model}")
        val result = state.result
        when {
            state.loading -> Column(verticalArrangement = Arrangement.spacedBy(MmSpacing.sm)) {
                Text(stringResource(R.string.scr_val_loading), style = MmType.current.bodyM, color = c.textSecondary)
                MmSkeleton(Modifier.fillMaxWidth(), height = 36.dp, shape = MmShapes.sm)
                MmSkeleton(width = 180.dp, height = 14.dp)
                MmSkeleton(Modifier.fillMaxWidth(), height = 72.dp, shape = MmShapes.sm)
            }
            state.failed || result == null -> {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(MmShapes.sm)
                        .background(c.cautionContainer)
                        .padding(MmSpacing.md),
                ) {
                    Icon(Icons.Filled.Warning, contentDescription = null, tint = c.caution, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(MmSpacing.sm))
                    Text(stringResource(R.string.scr_val_no_data), style = MmType.current.bodyM, color = c.textPrimary)
                }
                MmButton(
                    text = stringResource(R.string.scr_retry),
                    onClick = { onEvent(ValuationUiEvent.Retry) },
                    style = MmButtonStyle.Secondary,
                    leadingIcon = Icons.Filled.Refresh,
                )
            }
            else -> ResultBody(state, result, onOpenListing)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MmSpacing.sm), verticalArrangement = Arrangement.spacedBy(MmSpacing.sm)) {
            MmButton(
                text = stringResource(R.string.scr_val_see_similar),
                onClick = { onSeeSimilar(state.make, state.model) },
                trailingIcon = Icons.AutoMirrored.Filled.ArrowForward,
            )
            MmButton(
                text = stringResource(R.string.scr_val_restart),
                onClick = { onEvent(ValuationUiEvent.Restart) },
                style = MmButtonStyle.Secondary,
                leadingIcon = Icons.Filled.Refresh,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ResultBody(state: ValuationUiState, result: QuizResult, onOpenListing: (Int) -> Unit) {
    val c = MmColors.current
    val type = MmType.current
    val reduced = MmMotion.reduced
    // Range card
    Column(
        Modifier
            .fillMaxWidth()
            .clip(MmShapes.md)
            .background(c.surfaceRaised)
            .border(1.dp, c.brand.copy(alpha = 0.25f), MmShapes.md)
            .padding(MmSpacing.lg),
    ) {
        Text(stringResource(R.string.scr_val_range_label), style = type.label, color = c.textSecondary)
        Spacer(Modifier.height(MmSpacing.xs))
        Row(verticalAlignment = Alignment.CenterVertically) {
            MmPrice(result.low, style = type.priceL)
            Text("  –  ", style = type.priceL, color = c.textSecondary)
            MmPrice(result.high, style = type.priceL)
        }
        Spacer(Modifier.height(MmSpacing.md))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MmSpacing.xs), verticalArrangement = Arrangement.spacedBy(MmSpacing.xs)) {
            val (confText, confColor, confBg) = when (result.confidence) {
                "high" -> Triple(stringResource(R.string.scr_val_conf_high), c.onDealGreat, c.dealGreatContainer)
                "medium" -> Triple(stringResource(R.string.scr_val_conf_medium), c.onBrandContainer, c.brandContainer)
                else -> Triple(stringResource(R.string.scr_val_conf_low), c.onCaution, c.cautionContainer)
            }
            Row(
                Modifier.clip(MmShapes.pill).background(confBg).padding(horizontal = 10.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Verified, contentDescription = null, tint = confColor, modifier = Modifier.size(12.dp))
                Spacer(Modifier.width(4.dp))
                Text(confText, style = type.labelS, color = confColor)
            }
            if (result.comparableCount > 0) {
                MmTag(
                    stringResource(R.string.scr_val_comps, result.comparableCount),
                    color = c.textSecondary,
                    container = c.surfaceHigh,
                )
            }
        }
    }

    // Where this car sits
    val band = ValuationQuiz.band(result.low, result.high, state.position)
    val span = (result.high - result.low).coerceAtLeast(1.0)
    val startFrac = ((band.from - result.low) / span).toFloat().coerceIn(0f, 1f)
    val widthFrac = ((band.to - band.from) / span).toFloat().coerceIn(0f, 1f)
    val animStart by animateFloatAsState(startFrac, MmMotion.orSnap(reduced, MmMotion.emphasized()), label = "band-start")
    val animWidth by animateFloatAsState(widthFrac, MmMotion.orSnap(reduced, MmMotion.emphasized()), label = "band-width")
    Column(
        Modifier
            .fillMaxWidth()
            .clip(MmShapes.md)
            .background(c.surfaceRaised)
            .padding(MmSpacing.lg),
    ) {
        Text(
            stringResource(
                when (state.position) {
                    ValuationQuiz.Position.UPPER -> R.string.scr_val_pos_upper
                    ValuationQuiz.Position.LOWER -> R.string.scr_val_pos_lower
                    ValuationQuiz.Position.MIDDLE -> R.string.scr_val_pos_middle
                },
            ),
            style = type.titleS,
            color = c.textPrimary,
        )
        Spacer(Modifier.height(MmSpacing.md))
        BoxWithConstraints(
            Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(MmShapes.pill)
                .background(c.surfaceHigh),
        ) {
            Box(
                Modifier
                    .offset(x = maxWidth * animStart)
                    .width(maxWidth * animWidth)
                    .fillMaxHeight()
                    .clip(MmShapes.pill)
                    .background(c.brand),
            )
        }
        Spacer(Modifier.height(MmSpacing.sm))
        Text("≈ ${MmPriceFormat.compact(band.from)} – ${MmPriceFormat.compact(band.to)}", style = type.numeric, color = c.textPrimary)
        Spacer(Modifier.height(MmSpacing.xs))
        Text(stringResource(R.string.scr_val_pos_note), style = type.caption, color = c.textTertiary)
    }

    // Flags
    state.flags.forEach { flag ->
        val high = flag.severity == ValuationQuiz.Severity.HIGH
        Row(
            Modifier
                .fillMaxWidth()
                .clip(MmShapes.sm)
                .background(if (high) c.dealHighContainer else c.cautionContainer)
                .padding(MmSpacing.md),
        ) {
            Icon(Icons.Filled.Warning, contentDescription = null, tint = if (high) c.dealHigh else c.caution, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(MmSpacing.sm))
            Text(
                stringResource(
                    when (flag.question) {
                        Question.FLOOD -> R.string.scr_val_flag_flood
                        Question.ACCIDENTS -> R.string.scr_val_flag_accidents
                        Question.SERVICE -> R.string.scr_val_flag_service
                        Question.MODS -> R.string.scr_val_flag_mods
                        Question.OWNERS -> R.string.scr_val_flag_owners
                    },
                ),
                style = type.bodyM,
                color = c.textPrimary,
            )
        }
    }

    // Comparable ads (real listings, tappable)
    if (result.comparables.isNotEmpty()) {
        Text(stringResource(R.string.scr_val_comparables), style = type.titleS, color = c.textPrimary)
        Column(Modifier.clip(MmShapes.md).background(c.surfaceRaised)) {
            result.comparables.forEachIndexed { i, comp ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 52.dp)
                        .mmTappable(role = Role.Button, pressedScale = 1f) { onOpenListing(comp.id) }
                        .padding(horizontal = MmSpacing.lg, vertical = MmSpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(comp.title, style = type.bodyM, color = c.textPrimary, maxLines = 1)
                        comp.district?.let { Text(it, style = type.caption, color = c.textTertiary) }
                    }
                    Text(MmPriceFormat.compact(comp.priceLkr), style = type.numeric, color = c.textPrimary)
                }
                if (i < result.comparables.lastIndex) {
                    Box(Modifier.padding(start = MmSpacing.lg).fillMaxWidth().height(0.5.dp).background(c.outline))
                }
            }
        }
    }

    Row {
        Icon(Icons.Filled.Info, contentDescription = null, tint = c.textTertiary, modifier = Modifier.size(14.dp).padding(top = 2.dp))
        Spacer(Modifier.width(MmSpacing.xs))
        Text(stringResource(R.string.scr_val_honesty), style = type.caption, color = c.textSecondary)
    }
}
