package lk.motormila.app.ui.theme

import android.view.HapticFeedbackConstants
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Central haptics wrapper so screens never touch the framework directly.
 *
 * Spec §4 mapping:
 * - tick()      -> CLOCK_TICK   (filter chip / tab / toggle select)
 * - keypress()  -> VIRTUAL_KEY  (primary button press-down)
 * - confirm()   -> CONFIRM      (success: alert created, favorite saved, …)
 * - reject()    -> REJECT       (validation error / failed request)
 * - longPress() -> LONG_PRESS   (reorder, context)
 */
class HapticHelper(private val perform: (Int) -> Unit) {
    fun tick() = perform(HapticFeedbackConstants.CLOCK_TICK)
    fun confirm() = perform(HapticFeedbackConstants.CONFIRM)
    fun reject() = perform(HapticFeedbackConstants.REJECT)
    fun longPress() = perform(HapticFeedbackConstants.LONG_PRESS)
    fun keypress() = perform(HapticFeedbackConstants.VIRTUAL_KEY)
}

@Composable
fun rememberHaptics(): HapticHelper {
    val view = LocalView.current
    return remember(view) {
        HapticHelper { constant -> view.performHapticFeedback(constant) }
    }
}

/**
 * Staged confirm for price-drop / deal-verdict moments (spec §4): a light
 * tick on settle, then the full confirm ~120ms later — staged, never
 * simultaneous.
 */
fun CoroutineScope.stagedConfirm(helper: HapticHelper) {
    launch {
        helper.tick()
        delay(120)
        helper.confirm()
    }
}

/**
 * Fires [HapticHelper.keypress] the moment the finger goes down — before the
 * click's onClick. Attach as an OUTER modifier on primary CTAs (Search,
 * Calculate, Save alert, Submit).
 *
 * Never consumes the press, so the click handler and any parent scroll keep
 * working; `requireUnconsumed = false` also lets it coexist with the button's
 * own press tracking.
 */
fun Modifier.pressKeyHaptic(helper: HapticHelper): Modifier = pointerInput(helper) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false)
        helper.keypress()
    }
}
