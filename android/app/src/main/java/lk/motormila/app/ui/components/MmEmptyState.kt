package lk.motormila.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType

/**
 * Calm empty / error state: soft icon disc, title, one line of guidance and
 * up to two actions. Centred, max 320dp wide.
 */
@Composable
fun MmEmptyState(
    icon: ImageVector,
    title: String,
    modifier: Modifier = Modifier,
    message: String? = null,
    primaryAction: Pair<String, () -> Unit>? = null,
    secondaryAction: Pair<String, () -> Unit>? = null,
) {
    val c = MmColors.current
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MmSpacing.gutter, vertical = MmSpacing.huge),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(72.dp)
                .clip(MmShapes.pill)
                .background(c.surfaceRaised),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, null, tint = c.textSecondary, modifier = Modifier.size(30.dp))
        }
        Spacer(Modifier.height(MmSpacing.xl))
        Text(
            title,
            style = MmType.current.titleM,
            color = c.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = 320.dp),
        )
        if (message != null) {
            Spacer(Modifier.height(MmSpacing.sm))
            Text(
                message,
                style = MmType.current.bodyM,
                color = c.textSecondary,
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(max = 320.dp),
            )
        }
        if (primaryAction != null || secondaryAction != null) {
            Spacer(Modifier.height(MmSpacing.xxl))
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MmSpacing.xs),
            ) {
                primaryAction?.let { (label, action) -> MmButton(text = label, onClick = action) }
                secondaryAction?.let { (label, action) ->
                    MmButton(text = label, onClick = action, style = MmButtonStyle.Ghost)
                }
            }
        }
    }
}
