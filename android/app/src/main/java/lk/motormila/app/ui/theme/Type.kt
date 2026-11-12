package lk.motormila.app.ui.theme

import androidx.compose.ui.text.TextStyle

/**
 * Legacy entry points kept so existing call sites compile. New code reads
 * [MmType.current]; MaterialTheme.typography is mapped from it too.
 */
val MotormilaTypography = MmType.Default.toMaterial()

/** Tabular-figure numerals outside price styles. */
val Numerals: TextStyle = MmType.Default.numeric
