package lk.motormila.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.domain.model.DealBand
import lk.motormila.app.ui.theme.MotormilaGoodContainer
import lk.motormila.app.ui.theme.MotormilaGoodSoft
import lk.motormila.app.ui.theme.MotormilaPrimaryBorder
import lk.motormila.app.ui.theme.MotormilaPrimaryContainer
import lk.motormila.app.ui.theme.MotormilaRadius

/**
 * Deal pill: GREAT (good) / FAIR (warn) / HIGH (bad) + LOCKED (free tier,
 * blurred value + lock icon). Content-desc always set for screen readers.
 */
private data class DealBadgeStyle(
    val container: androidx.compose.ui.graphics.Color,
    val content: androidx.compose.ui.graphics.Color,
    val border: androidx.compose.ui.graphics.Color,
    val text: String,
)

@Composable
fun DealBadge(
    band: DealBand,
    score: Double?,
    modifier: Modifier = Modifier,
    lockedLabel: String = "PRO",
) {
    val style = when (band) {
        DealBand.GREAT -> DealBadgeStyle(
            container = MotormilaGoodContainer,
            content = androidx.compose.ui.graphics.Color(0xFF69F0AE),
            border = MotormilaGoodSoft,
            text = if (score != null) "GREAT %.1f".format(score) else "GREAT",
        )
        DealBand.FAIR -> DealBadgeStyle(
            container = MotormilaPrimaryContainer,
            content = androidx.compose.ui.graphics.Color(0xFF3D94FF),
            border = MotormilaPrimaryBorder,
            text = if (score != null) "FAIR %.1f".format(score) else "FAIR",
        )
        DealBand.HIGH -> DealBadgeStyle(
            container = androidx.compose.ui.graphics.Color(0x2EEF4444),
            content = androidx.compose.ui.graphics.Color(0xFFFCA5A5),
            border = androidx.compose.ui.graphics.Color(0x55EF4444),
            text = "HIGH",
        )
        DealBand.LOCKED -> DealBadgeStyle(
            container = androidx.compose.ui.graphics.Color(0xDD18181B),
            content = androidx.compose.ui.graphics.Color(0xFFF5F5F7),
            border = androidx.compose.ui.graphics.Color(0x33FFFFFF),
            text = lockedLabel,
        )
    }
    val (container, content, border, text) = style
    Row(
        modifier = modifier
            .background(container, MotormilaRadius.pill)
            .border(1.dp, border, MotormilaRadius.pill)
            .semantics { contentDescription = "Deal rating $text" }
            .padding(horizontal = 9.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (band == DealBand.LOCKED) {
            Icon(
                imageVector = Icons.Filled.Lock,
                contentDescription = null,
                tint = content,
                modifier = Modifier
                    .size(12.dp)
                    .padding(end = 2.dp),
            )
            Text(
                text = text,
                color = content,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.blur(0.dp),
            )
        } else {
            Text(text = text, color = content, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/** Blurred placeholder value shown to free-tier users behind [DealBadge] LOCKED. */
@Composable
fun LockedValue(
    placeholder: String = "8.4",
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.semantics { contentDescription = "Locked for Pro members" },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = placeholder,
            modifier = Modifier.blur(6.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Icon(
            imageVector = Icons.Filled.Lock,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(14.dp),
        )
    }
}
