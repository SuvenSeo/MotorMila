package lk.motormila.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp

/**
 * Corner scale (liquid-glass round 4): standard cards 24dp, hero/dialogs
 * 32dp, sheets 32dp on top corners, pills fully round. Mirrors [MotormilaRadius] steps where they
 * overlap so old and new surfaces sit together.
 */
object MmShapes {
    val xs = RoundedCornerShape(10.dp)    // tags, tiny chips, chart tooltips
    val sm = RoundedCornerShape(14.dp)   // inputs, inner tiles, image thumbs
    val md = RoundedCornerShape(18.dp)   // list rows, compact cards
    val lg = RoundedCornerShape(24.dp)   // standard card
    val xl = RoundedCornerShape(32.dp)   // hero / dialogs
    val sheet = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)
    val pill = RoundedCornerShape(percent = 50)
}
