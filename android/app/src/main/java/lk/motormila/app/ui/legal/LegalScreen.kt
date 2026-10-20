package lk.motormila.app.ui.legal

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.ui.components.MotormilaEyebrow
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaHairline
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.motormilaReveal

@Composable
fun LegalScreen(
    documentId: String,
    onBack: () -> Unit,
    onOpenOther: () -> Unit,
) {
    val document = LegalCatalog.byId(documentId)
    lk.motormila.app.ui.common.MmScreen(title = if (documentId == "terms") "Terms" else "Privacy", onBack = onBack) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column(Modifier.motormilaReveal()) {
                    MotormilaEyebrow(document.eyebrow)
                    Spacer(Modifier.height(12.dp))
                    Text(
                        document.title,
                        color = MotormilaOnSurface,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 28.sp,
                        lineHeight = 34.sp,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        document.subtitle,
                        color = MotormilaSecondaryText,
                        fontSize = 14.sp,
                        lineHeight = 21.sp,
                    )
                    Spacer(Modifier.height(16.dp))
                    MotormilaGhostButton(document.cta, onClick = onOpenOther)
                }
            }
            itemsIndexed(document.sections, key = { _, section -> section.heading }) { index, section ->
                MotormilaSurface(modifier = Modifier.motormilaReveal(delayMillis = 40 * (index + 1))) {
                    Text(
                        section.heading,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 17.sp,
                        color = MotormilaOnSurface,
                    )
                    Spacer(Modifier.height(8.dp))
                    section.paragraphs.forEach { paragraph ->
                        Text(
                            paragraph,
                            fontSize = 14.sp,
                            lineHeight = 22.sp,
                            color = MotormilaOnSurface,
                            modifier = Modifier.padding(bottom = 8.dp),
                        )
                    }
                    section.bullets.forEach { bullet ->
                        Text(
                            "  ·  $bullet",
                            fontSize = 13.sp,
                            lineHeight = 20.sp,
                            color = MotormilaPrimaryBright,
                            modifier = Modifier.padding(vertical = 2.dp),
                        )
                    }
                }
            }
            item {
                MotormilaHairline()
                Spacer(Modifier.height(10.dp))
                Text(document.updated, fontSize = 12.sp, color = MotormilaSecondaryText)
                Spacer(Modifier.height(28.dp))
            }
        }
    }
}
