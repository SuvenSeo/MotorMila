package lk.motormila.app.ui.screenshots

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import app.cash.paparazzi.detectEnvironment
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.LoadingSkeletonCard
import lk.motormila.app.ui.home.HeroStatsCard
import lk.motormila.app.ui.home.PriceDropCard
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
        // compileSdk is 36 but Paparazzi 1.3.x bundles an API 35 layoutlib:
        // render against the android-35 platform so goldens stay stable
        // (CI installs platforms;android-35, see .github/workflows/android.yml).
        environment = detectEnvironment().run {
            copy(compileSdkVersion = 35, platformDir = platformDir.replace("android-36", "android-35"))
        },
        // Fail loudly on missing goldens instead of silently recording.
        // (Record via the recordPaparazziDebug task.)
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
    fun home_loadedStats_dark() {
        paparazzi.snapshot {
            MotormilaTheme(darkTheme = true) {
                HeroStatsCard(
                    total = 325_984,
                    goodDeals = 1_284,
                    new24h = 342,
                    avgPrice = "Rs. 8.45M",
                    modifier = Modifier.padding(16.dp),
                )
            }
        }
    }

    @Test
    fun home_loadedStats_light() {
        paparazzi.snapshot {
            MotormilaTheme(darkTheme = false) {
                HeroStatsCard(
                    total = 325_984,
                    goodDeals = 1_284,
                    new24h = 342,
                    avgPrice = "Rs. 8.45M",
                    modifier = Modifier.padding(16.dp),
                )
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

    // ------------------------------------------------------------------
    // Deal card
    // ------------------------------------------------------------------

    @Test
    fun deal_priceDropCard_dark() {
        paparazzi.snapshot {
            MotormilaTheme(darkTheme = true) {
                Box(Modifier.padding(16.dp)) {
                    PriceDropCard(
                        title = "Toyota Aqua G 2017",
                        imageUrl = null,
                        newPrice = "Rs. 7.95M",
                        dropPct = 8.5,
                        onClick = {},
                    )
                }
            }
        }
    }

    @Test
    fun deal_priceDropCard_light() {
        paparazzi.snapshot {
            MotormilaTheme(darkTheme = false) {
                Box(Modifier.padding(16.dp)) {
                    PriceDropCard(
                        title = "Honda Fit GP5 2018",
                        imageUrl = null,
                        newPrice = "Rs. 9.20M",
                        dropPct = 12.0,
                        onClick = {},
                    )
                }
            }
        }
    }
}
