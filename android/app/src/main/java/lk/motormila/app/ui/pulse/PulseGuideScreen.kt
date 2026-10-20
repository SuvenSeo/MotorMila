package lk.motormila.app.ui.pulse

import lk.motormila.app.R
import androidx.compose.ui.res.stringResource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.ui.components.MotormilaEyebrow
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.motormilaReveal

@Composable
fun PulseGuideScreen(
    guideKey: String,
    onBack: () -> Unit,
    onOpenPulse: () -> Unit,
    onOpenCalculator: () -> Unit,
) {
    val guide = PulseGuides.byKey(guideKey)

    lk.motormila.app.ui.common.MmScreen(title = "Pulse guide", onBack = onBack) {
    Column(Modifier.fillMaxSize()) {
        if (guide == null) {
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                verticalArrangement = Arrangement.Center,
            ) {
                Text(stringResource(R.string.ui_pulse_guide_not_found), fontWeight = FontWeight.SemiBold, fontSize = 20.sp, color = MotormilaOnSurface)
                Spacer(Modifier.height(8.dp))
                Text(
                    "That pulse guide key is not in the in-app catalog.",
                    color = MotormilaSecondaryText,
                    fontSize = 14.sp,
                )
                Spacer(Modifier.height(16.dp))
                MotormilaGhostButton("Back to Official Pulse", onClick = onOpenPulse)
            }
            return@Column
        }
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Column(Modifier.motormilaReveal()) {
                MotormilaEyebrow(guide.shortLabel)
                Spacer(Modifier.height(12.dp))
                Text(
                    guide.title,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 28.sp,
                    lineHeight = 34.sp,
                    color = MotormilaOnSurface,
                )
                Spacer(Modifier.height(8.dp))
                Text(guide.summary, fontSize = 14.sp, lineHeight = 21.sp, color = MotormilaSecondaryText)
            }
            MotormilaSurface(modifier = Modifier.motormilaReveal(delayMillis = 80)) {
                Text(stringResource(R.string.ui_pulse_why_it_matters), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp, color = MotormilaPrimaryBright)
                Spacer(Modifier.height(8.dp))
                guide.whyItMatters.forEach {
                    Text("  ·  $it", fontSize = 14.sp, lineHeight = 21.sp, color = MotormilaOnSurface, modifier = Modifier.padding(vertical = 4.dp))
                }
            }
            MotormilaSurface(modifier = Modifier.motormilaReveal(delayMillis = 140)) {
                Text(stringResource(R.string.ui_pulse_how_we_read_it), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp, color = MotormilaPrimaryBright)
                Spacer(Modifier.height(8.dp))
                guide.howWeReadIt.forEach {
                    Text("  ·  $it", fontSize = 14.sp, lineHeight = 21.sp, color = MotormilaOnSurface, modifier = Modifier.padding(vertical = 4.dp))
                }
            }
            MotormilaSurface(highlighted = true, modifier = Modifier.motormilaReveal(delayMillis = 200)) {
                Text(stringResource(R.string.ui_pulse_dealer_tip), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp, color = MotormilaPrimaryBright)
                Spacer(Modifier.height(8.dp))
                Text(guide.dealerTip, fontSize = 14.sp, lineHeight = 22.sp, color = MotormilaOnSurface)
            }
            MotormilaGhostButton("Open Official Pulse", onClick = onOpenPulse)
            MotormilaGhostButton("Open import calculator", onClick = onOpenCalculator)
            Spacer(Modifier.height(24.dp))
        }
    }
    }
}
