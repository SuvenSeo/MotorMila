package lk.motormila.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmType

/**
 * Web eyebrow (cinematic-pages.css .eyebrow): a 28dp hairline at 55% then a
 * 12sp semibold uppercase label tracked +0.08em. Sinhala/Tamil drop the caps
 * and tracking (the scripts have no case and tracking breaks conjuncts).
 * [color] defaults to secondary text; pass [MmColors.stageAccent] on stage.
 */
@Composable
fun MmEyebrow(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = MmColors.current.textSecondary,
) {
    val latin = LocalConfiguration.current.locales[0].language !in setOf("si", "ta")
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(28.dp).height(1.dp).background(color.copy(alpha = color.alpha * 0.55f)))
        Spacer(Modifier.width(10.dp))
        Text(
            text = if (latin) text.uppercase() else text,
            style = MmType.current.caption,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = if (latin) 0.96.sp else 0.sp,
            color = color,
            maxLines = 1,
        )
    }
}
