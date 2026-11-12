package lk.motormila.app.ui.docs

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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.ui.components.MotormilaEyebrow
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.motormilaReveal

@Composable
fun DocsScreen(
    onBack: () -> Unit,
    initialSectionId: String? = null,
) {
    var openId by remember { mutableStateOf(initialSectionId ?: DocsCatalog.sections.first().id) }

    lk.motormila.app.ui.common.MmScreen(title = "Docs", onBack = onBack) {
    Column(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column(Modifier.motormilaReveal()) {
                    MotormilaEyebrow("PLATFORM")
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "How Motormila reads the market.",
                        color = MotormilaOnSurface,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 28.sp,
                        lineHeight = 34.sp,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Sources, deal scores, Official Pulse, and the tools behind every number.",
                        color = MotormilaSecondaryText,
                        fontSize = 14.sp,
                        lineHeight = 21.sp,
                    )
                }
            }
            itemsIndexed(DocsCatalog.sections, key = { _, section -> section.id }) { index, section ->
                val open = openId == section.id
                MotormilaSurface(
                    highlighted = open,
                    onClick = { openId = section.id },
                    modifier = Modifier.motormilaReveal(delayMillis = 40 * (index + 1)),
                ) {
                    Text(
                        section.title,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 17.sp,
                        color = MotormilaOnSurface,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(section.summary, fontSize = 13.sp, color = MotormilaSecondaryText, lineHeight = 19.sp)
                    if (open) {
                        Spacer(Modifier.height(12.dp))
                        section.body.forEach { paragraph ->
                            Text(
                                paragraph,
                                fontSize = 14.sp,
                                lineHeight = 22.sp,
                                color = MotormilaOnSurface,
                                modifier = Modifier.padding(bottom = 10.dp),
                            )
                        }
                        section.bullets.forEach { bullet ->
                            Text(
                                "  ·  $bullet",
                                fontSize = 13.sp,
                                color = MotormilaPrimaryBright,
                                modifier = Modifier.padding(vertical = 2.dp),
                            )
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
    }
}
