package lk.motormila.app.ui.theme

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalView

/**
 * Semantic haptics. Uses View.performHapticFeedback WITHOUT
 * FLAG_IGNORE_GLOBAL_SETTING, so the system "Touch feedback" setting is always
 * respected. Like the web spec, haptics are off when the system "Remove
 * animations" setting is on, and in previews/screenshots.
 *
 * - [toggle]  on/off switches, chips, tab change (CLOCK_TICK / SEGMENT_TICK)
 * - [save]    saved to watchlist / added to compare (CONFIRM on 30+)
 * - [unsave]  removed (light tick)
 * - [reject]  error / limit reached
 * - [press]   primary CTA key press
 * - [longPress] context actions
 */
@Stable
class MmHaptics internal constructor(
    private val view: View?,
    private val enabled: Boolean,
) {
    private fun perform(constant: Int) {
        if (!enabled) return
        view?.performHapticFeedback(constant)
    }

    fun toggle() = perform(
        if (Build.VERSION.SDK_INT >= 34) HapticFeedbackConstants.SEGMENT_TICK
        else HapticFeedbackConstants.CLOCK_TICK,
    )

    fun save() = perform(
        if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM
        else HapticFeedbackConstants.VIRTUAL_KEY,
    )

    fun unsave() = perform(HapticFeedbackConstants.CLOCK_TICK)

    fun reject() = perform(
        if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT
        else HapticFeedbackConstants.LONG_PRESS,
    )

    fun press() = perform(HapticFeedbackConstants.VIRTUAL_KEY)

    fun longPress() = perform(HapticFeedbackConstants.LONG_PRESS)

    companion object {
        /** Haptics bound to the current view. */
        val current: MmHaptics
            @Composable
            get() {
                val view = LocalView.current
                val reduced = MmMotion.reduced
                val inspection = androidx.compose.ui.platform.LocalInspectionMode.current
                return remember(view, reduced, inspection) {
                    MmHaptics(view, enabled = !inspection && !reduced)
                }
            }
    }
}
