package lk.motormila.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp

/**
 * Corner scale for design system v2. Calmer than v1: standard cards are 20dp,
 * sheets 28dp on top corners only. Mirrors [MotormilaRadius] steps where they
 * overlap so old and new surfaces sit together.
 */
object MmShapes {
    val xs = RoundedCornerShape(8.dp)    // tags, tiny chips, chart tooltips
    val sm = RoundedCornerShape(12.dp)   // inputs, inner tiles, image thumbs
    val md = RoundedCornerShape(16.dp)   // list rows, compact cards
    val lg = RoundedCornerShape(20.dp)   // standard card
    val xl = RoundedCornerShape(28.dp)   // hero / dialogs
    val sheet = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    val pill = RoundedCornerShape(percent = 50)
}
