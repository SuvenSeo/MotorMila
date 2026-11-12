package lk.motormila.app.ui.components

import androidx.compose.runtime.Composable

/**
 * Re-export of the canonical reduced-motion flag for UI call sites.
 * True when the user disabled animations system-wide.
 */
@Composable
fun rememberReducedMotion(): Boolean =
    // Also honour the theme's flag (MotormilaTheme(reducedMotion = …)): components
    // read only the system setting, so the theme override never reached the
    // tickers / price-drop choreography.
    lk.motormila.app.ui.theme.LocalMmReducedMotion.current ||
        lk.motormila.app.core.motion.rememberReducedMotion()
