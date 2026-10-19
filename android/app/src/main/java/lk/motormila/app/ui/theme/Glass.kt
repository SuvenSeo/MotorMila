package lk.motormila.app.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp

/** Translucent fill so content can peek through chrome (nav, sheets, trays). */
val MotormilaGlassFill = Color(0x990F0F12)

/** Denser glass for FABs, cards, and floating trays. */
val MotormilaGlassFillStrong = Color(0xCC0F0F12)

/** Top-edge specular highlight (iOS liquid-glass sheen). */
val MotormilaGlassHighlight = Color(0x28FFFFFF)

/** Pill used by buttons, chips, search field, and badges. */
val MotormilaPill = MotormilaRadius.pill

/** Sheet / dialog top corners. */
val MotormilaSheetShape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)

/**
 * Liquid-glass chrome: clip + translucent fill + optional top specular +
 * 0.5.dp hairline. Cheap on the UI thread (no backdrop RenderEffect).
 *
 * Do **not** enable [specular] on long scrolling lists — the extra draw
 * pass is reserved for nav, sheets, FABs, and overlays.
 */
fun Modifier.liquidGlass(
    shape: Shape,
    fill: Color = MotormilaGlassFill,
    border: Color = MotormilaGlassBorder,
    specular: Boolean = true,
): Modifier {
    val base = this
        .clip(shape)
        .background(fill, shape)
    val withSheen = if (specular) {
        base.drawWithCache {
            val brush = Brush.verticalGradient(
                0f to MotormilaGlassHighlight,
                0.26f to Color.Transparent,
            )
            onDrawWithContent {
                drawContent()
                drawRect(brush)
            }
        }
    } else {
        base
    }
    return withSheen.border(1.dp, border, shape)
}
