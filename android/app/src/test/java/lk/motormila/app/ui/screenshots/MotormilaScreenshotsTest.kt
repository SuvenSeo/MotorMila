package lk.motormila.app.ui.screenshots

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.LoadingSkeletonCard
import lk.motormila.app.ui.theme.MotormilaTheme
import org.junit.Rule
import org.junit.Test

/**
 * Visual regression tests (Paparazzi, JVM-only — no emulator).
 *
 * Golden files live in `app/src/test/snapshots/`. Record locally with
 * `./gradlew :app:recordPaparazziDebug`; CI runs
 * `./gradlew :app:verifyPaparazziDebug` and fails on any pixel diff.
 *
 * All renders go through the real [MotormilaTheme] (Cal Sans typography,
 * brand color tokens) so a type or token change shows up here first.
 */
class MotormilaScreenshotsTest {

    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_6,
        // Fail loudly on missing goldens instead of silently recording.
        // (Record via the recordPaparazziDebug task.)
        // Layoutlib + platform come from the Paparazzi Gradle plugin
        // (renders against compileSdk 36). Changing this block means
        // re-recording the goldens.
    )

    // ------------------------------------------------------------------
    // Home — the three load states (v1.6.2 skeleton-forever regression net)
    // ------------------------------------------------------------------

    @Test
    fun home_loadingSkeleton_dark() {
        paparazzi.snapshot {
            MotormilaTheme(darkTheme = true) {
                LoadingSkeletonCard(Modifier.padding(16.dp))
            }
        }
    }

    @Test
    fun home_loadingSkeleton_light() {
        paparazzi.snapshot {
            MotormilaTheme(darkTheme = false) {
                LoadingSkeletonCard(Modifier.padding(16.dp))
            }
        }
    }

    @Test
    fun home_errorState_dark() {
        paparazzi.snapshot {
            MotormilaTheme(darkTheme = true) {
                ErrorState(
                    message = "Couldn't reach Motormila",
                    onRetry = {},
                    modifier = Modifier.padding(16.dp),
                )
            }
        }
    }

    @Test
    fun home_offlineCached_dark() {
        paparazzi.snapshot {
            MotormilaTheme(darkTheme = true) {
                ErrorState(
                    message = "Couldn't reach Motormila",
                    onRetry = {},
                    cachedAvailable = true,
                    onShowCached = {},
                    modifier = Modifier.padding(16.dp),
                )
            }
        }
    }

}

