package lk.motormila.app.ui.pricing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.ui.components.MotormilaEyebrow
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.MotormilaTopBar
import lk.motormila.app.ui.theme.MotormilaGoodText
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.motormilaReveal

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
    var openFaq by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize()) {
        MotormilaTopBar(title = "Pricing", onBack = onBack)
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Column(Modifier.motormilaReveal()) {
                    MotormilaEyebrow("ACCESS")
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "Fair access. Honest numbers.",
                        color = MotormilaOnSurface,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 28.sp,
                        lineHeight = 34.sp,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Free to browse the market. Pro and Dealer fund the pipeline that keeps Sri Lanka’s listings scored and current.",
                        color = MotormilaSecondaryText,
                        fontSize = 14.sp,
                        lineHeight = 21.sp,
                    )
                }
            }
            itemsIndexed(PricingCatalog.tiers, key = { _, tier -> tier.id }) { index, tier ->
                MotormilaSurface(
                    highlighted = tier.highlight,
                    modifier = Modifier.motormilaReveal(delayMillis = 60 * (index + 1)),
                ) {
                    Row(Modifier.fillMaxWidth()) {
                        Text(
                            tier.name.uppercase(),
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.2.sp,
                            fontSize = 11.sp,
                            color = MotormilaPrimaryBright,
                            modifier = Modifier.weight(1f),
                        )
                        if (tier.highlight) {
                            Text("MOST USED", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MotormilaGoodText)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = androidx.compose.ui.Alignment.Bottom) {
                        Text(tier.price, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = MotormilaOnSurface)
                        Text("  ${tier.note}", fontSize = 13.sp, color = MotormilaSecondaryText, modifier = Modifier.padding(bottom = 4.dp))
                    }
                    if (tier.annualNote != null) {
                        Spacer(Modifier.height(4.dp))
                        Text(tier.annualNote, fontSize = 12.sp, color = MotormilaGoodText)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(tier.audience, fontSize = 13.sp, color = MotormilaSecondaryText, lineHeight = 18.sp)
                    Spacer(Modifier.height(12.dp))
                    tier.features.forEach { feature ->
                        Text("  ·  $feature", fontSize = 13.sp, color = MotormilaOnSurface, modifier = Modifier.padding(vertical = 3.dp))
                    }
                    Spacer(Modifier.height(16.dp))
                    MotormilaPrimaryButton(
                        label = when {
                            state.busyPlan == tier.id -> "Working…"
                            else -> tier.cta
                        },
                        enabled = state.busyPlan == null,
                        onClick = {
                            when (tier.id) {
                                "free" -> onOpenHome()
                                "pro" -> when {
                                    !state.loggedIn -> onSignUp()
                                    // Play flavor: purchase only through Play Billing on the Pro screen.
                                    !lk.motormila.app.BuildConfig.EXTERNAL_CHECKOUT_ENABLED -> onOpenPro()
                                    else -> viewModel.checkout("pro", onOpenUrl, onSignUp)
                                }
                                "dealer" -> {
                                    if (state.loggedIn) {
                                        if (lk.motormila.app.BuildConfig.EXTERNAL_CHECKOUT_ENABLED) {
                                            viewModel.checkout("dealer", onOpenUrl, onOpenDealer)
                                        }
                                        onOpenDealer()
                                    } else onSignUp()
                                }
                                else -> onOpenUrl(PricingCatalog.CONTACT_MAILTO)
                            }
                        },
                    )
                    if (tier.id == "pro") {
                        Spacer(Modifier.height(8.dp))
                        MotormilaGhostButton("Open Pro terminal", onClick = onOpenPro)
                    }
                }
            }
            item {
                Text("FAQ", fontWeight = FontWeight.SemiBold, fontSize = 18.sp, color = MotormilaOnSurface)
            }
            itemsIndexed(PricingCatalog.channelFaqs, key = { _, faq -> faq.question }) { _, faq ->
                MotormilaSurface(onClick = { openFaq = if (openFaq == faq.question) null else faq.question }) {
                    Text(faq.question, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = MotormilaOnSurface)
                    if (openFaq == faq.question) {
                        Spacer(Modifier.height(8.dp))
                        Text(faq.answer, fontSize = 13.sp, lineHeight = 20.sp, color = MotormilaSecondaryText)
                    }
                }
            }
            if (state.message != null) {
                item {
                    Text(state.message ?: "", color = MotormilaPrimaryBright, fontSize = 13.sp)
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}
