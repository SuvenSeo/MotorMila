package lk.motormila.app.ui.theme

import androidx.compose.ui.unit.dp

/** 4dp spacing grid. Screen gutters are [gutter]; sections breathe with [section]. */
object MmSpacing {
    val xxs = 2.dp
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 20.dp
    val xxl = 24.dp
    val xxxl = 32.dp
    val huge = 48.dp

    /** Horizontal screen padding. */
    val gutter = 20.dp
    /** Gap between major screen sections. */
    val section = 32.dp
    /** Gap between cards in a list/grid. */
    val cardGap = 12.dp
    /** Inner padding of a standard card. */
    val cardPadding = 16.dp
    /** Minimum touch target. */
    val touch = 48.dp
    /** Height of the bottom navigation bar (excl. system inset). */
    val bottomBar = 64.dp
    /** Height of the sticky bottom action bar on detail screens. */
    val actionBar = 76.dp
}
