package lk.motormila.app.ui.pricing

import lk.motormila.app.ui.theme.mmTappable
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.BuildConfig
import lk.motormila.app.R
import lk.motormila.app.ui.common.MmScreen
import lk.motormila.app.ui.common.MmTag
import lk.motormila.app.ui.common.PRO_COMING_SOON
import lk.motormila.app.ui.common.ProNotifyBlock
import lk.motormila.app.ui.common.ScreenPadding
import lk.motormila.app.ui.common.ScreenSectionTitle
import lk.motormila.app.ui.components.MmButton
import lk.motormila.app.ui.components.MmButtonStyle
import lk.motormila.app.ui.components.MmCard
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType

@Composable
fun PricingScreen(
    onBack: () -> Unit,
    onSignUp: () -> Unit,
    onOpenPro: () -> Unit,
    onOpenDealer: () -> Unit,
    onOpenHome: () -> Unit,
    onOpenUrl: (String) -> Unit,
    viewModel: PricingViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    LaunchedEffect(state.message) {
        state.message?.let {
            snacks.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }
    MmScreen(title = stringResource(R.string.scr_price_title), onBack = onBack, snackbarHostState = snacks, edgeToEdge = true) {
        PricingContent(
            isPro = state.isPro,
            externalCheckout = BuildConfig.EXTERNAL_CHECKOUT_ENABLED,
            dealerBusy = state.busyDealer,
            onOpenHome = onOpenHome,
            onOpenPro = onOpenPro,
            onDealer = {
                if (!state.loggedIn) onSignUp()
                else viewModel.dealerCheckout(onOpenUrl, onOpenDealer)
            },
            onOpenDealer = onOpenDealer,
            notify = { ProNotifyBlock() },
        )
    }
}

@Composable
fun PricingContent(
    isPro: Boolean,
    externalCheckout: Boolean,
    dealerBusy: Boolean,
    onOpenHome: () -> Unit,
    onOpenPro: () -> Unit,
    onDealer: () -> Unit,
    onOpenDealer: () -> Unit,
    notify: @Composable () -> Unit,
) {
    val c = MmColors.current
    val type = MmType.current
    var openFaq by rememberSaveable { mutableStateOf<Int?>(null) }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = ScreenPadding,
        verticalArrangement = Arrangement.spacedBy(MmSpacing.cardGap),
    ) {
        item(key = "hero") {
            Column {
                MmTag(stringResource(R.string.scr_price_badge), color = c.onDealGreat, container = c.dealGreatContainer)
                Spacer(Modifier.height(MmSpacing.md))
                Text(stringResource(R.string.scr_price_hero), style = type.displayM, color = c.textPrimary)
                Spacer(Modifier.height(MmSpacing.sm))
                Text(stringResource(R.string.scr_price_hero_body), style = type.bodyM, color = c.textSecondary)
            }
        }
        item(key = "free") {
            PlanCard(
                name = stringResource(R.string.scr_price_free),
                price = "Rs 0",
                note = stringResource(R.string.scr_price_free_note),
                features = PricingCatalog.freeFeatures.map { stringResource(it) },
                highlighted = true,
            ) {
                MmButton(
                    text = stringResource(R.string.scr_price_free_cta),
                    onClick = onOpenHome,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        item(key = "pro") {
            PlanCard(
                name = stringResource(R.string.scr_price_pro),
                price = stringResource(R.string.scr_price_pro_soon),
                note = stringResource(R.string.scr_price_pro_note),
                features = PricingCatalog.proFeatures.map { stringResource(it) },
                highlighted = false,
            ) {
                when {
                    isPro -> MmButton(
                        text = stringResource(R.string.scr_price_open_pro),
                        onClick = onOpenPro,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    PRO_COMING_SOON -> notify()
                    else -> MmButton(
                        text = stringResource(R.string.scr_price_open_pro),
                        onClick = onOpenPro,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
        item(key = "compare-title") { ScreenSectionTitle(stringResource(R.string.scr_price_compare)) }
        item(key = "compare") { CompareTable() }
        item(key = "dealer") {
            MmCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Storefront, contentDescription = null, tint = c.brandText)
                    Spacer(Modifier.width(MmSpacing.sm))
                    Text(stringResource(R.string.scr_price_dealer_title), style = type.titleM, color = c.textPrimary)
                }
                Spacer(Modifier.height(MmSpacing.sm))
                Text(
                    stringResource(if (externalCheckout) R.string.scr_price_dealer_body_web else R.string.scr_price_dealer_body_play),
                    style = type.bodyM,
                    color = c.textSecondary,
                )
                Spacer(Modifier.height(MmSpacing.md))
                if (externalCheckout) {
                    MmButton(
                        text = stringResource(R.string.scr_price_dealer_cta),
                        onClick = onDealer,
                        loading = dealerBusy,
                        modifier = Modifier.fillMaxWidth(),
                    )
                } else {
                    MmButton(
                        text = stringResource(R.string.scr_price_dealer_open),
                        onClick = onOpenDealer,
                        style = MmButtonStyle.Secondary,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
        item(key = "faq-title") { ScreenSectionTitle(stringResource(R.string.scr_price_faq)) }
        items(PricingCatalog.faqsFor(externalCheckout), key = { "faq-${it.answer}" }) { faq ->
            FaqRow(
                question = stringResource(faq.question),
                answer = stringResource(faq.answer),
                open = openFaq == faq.answer,
                onToggle = { openFaq = if (openFaq == faq.answer) null else faq.answer },
            )
        }
    }
}

@Composable
private fun PlanCard(
    name: String,
    price: String,
    note: String,
    features: List<String>,
    highlighted: Boolean,
    action: @Composable () -> Unit,
) {
    val c = MmColors.current
    val type = MmType.current
    // Highlighted plan = solid surface + brand ring (was a translucent brand
    // wash that rendered as a heavy saturated-blue slab under the card shadow).
    MmCard(
        Modifier
            .fillMaxWidth()
            .then(if (highlighted) Modifier.border(1.5.dp, c.brand.copy(alpha = 0.6f), MmShapes.lg) else Modifier),
    ) {
        Text(name.uppercase(), style = type.overline, color = c.brandText)
        Spacer(Modifier.height(MmSpacing.sm))
        Text(price, style = type.displayM, color = c.textPrimary)
        Spacer(Modifier.height(MmSpacing.xs))
        Text(note, style = type.bodyS, color = c.textSecondary)
        Spacer(Modifier.height(MmSpacing.md))
        features.forEach { f ->
            Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Filled.Check, contentDescription = null, tint = c.success, modifier = Modifier.size(16.dp).padding(top = 2.dp))
                Spacer(Modifier.width(MmSpacing.sm))
                Text(f, style = type.bodyM, color = c.textPrimary)
            }
        }
        Spacer(Modifier.height(MmSpacing.lg))
        action()
    }
}

@Composable
private fun CompareTable() {
    val c = MmColors.current
    val type = MmType.current
    Column(
        Modifier
            .fillMaxWidth()
            .clip(MmShapes.md)
            .background(c.surface),
    ) {
        Row(Modifier.fillMaxWidth().padding(horizontal = MmSpacing.lg, vertical = MmSpacing.md)) {
            Spacer(Modifier.weight(1.6f))
            Text(stringResource(R.string.scr_price_free), style = type.label, color = c.brandText, modifier = Modifier.weight(1f))
            Text(stringResource(R.string.scr_price_pro), style = type.label, color = c.textSecondary, modifier = Modifier.weight(1f))
        }
        PricingCatalog.rows.forEach { row ->
            Box(Modifier.fillMaxWidth().height(0.5.dp).background(c.outline))
            Row(
                Modifier.fillMaxWidth().heightIn(min = 44.dp).padding(horizontal = MmSpacing.lg, vertical = MmSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(row.label), style = type.bodyS, color = c.textSecondary, modifier = Modifier.weight(1.6f))
                Text(stringResource(row.free), style = type.bodyS, color = c.textPrimary, modifier = Modifier.weight(1f))
                Text(stringResource(row.pro), style = type.bodyS, color = c.textPrimary, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun FaqRow(question: String, answer: String, open: Boolean, onToggle: () -> Unit) {
    val c = MmColors.current
    val type = MmType.current
    val reduced = MmMotion.reduced
    val rotation by animateFloatAsState(if (open) 180f else 0f, MmMotion.orSnap(reduced, MmMotion.standard()), label = "faq-chevron")
    Column(
        Modifier
            .mmTappable(role = Role.Button, shape = MmShapes.md, onClick = onToggle)
            .fillMaxWidth()
            .clip(MmShapes.md)
            .background(c.surface)
            .padding(MmSpacing.lg),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(question, style = type.titleS, color = c.textPrimary, modifier = Modifier.weight(1f))
            Icon(Icons.Filled.ExpandMore, contentDescription = null, tint = c.textSecondary, modifier = Modifier.rotate(rotation))
        }
        AnimatedVisibility(
            visible = open,
            enter = if (reduced) fadeIn(MmMotion.standard(0)) else expandVertically(MmMotion.standard()) + fadeIn(MmMotion.standard()),
            exit = if (reduced) fadeOut(MmMotion.standard(0)) else shrinkVertically(MmMotion.exit()) + fadeOut(MmMotion.exit()),
        ) {
            Text(answer, style = type.bodyM, color = c.textSecondary, modifier = Modifier.padding(top = MmSpacing.sm))
        }
    }
}
