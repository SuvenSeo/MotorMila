package lk.motormila.app.ui.screenshots

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.Paparazzi
import lk.motormila.app.ui.detail.DetailActionBar
import lk.motormila.app.ui.detail.PriceDealSection
import lk.motormila.app.ui.screenshots.Sweep.settled
import org.junit.Rule
import org.junit.Test

/**
 * CI goldens for the 1.7.0 price bugs, at the worst case: 200 % font scale on a
 * 360 dp phone, animations ON (the rolling ticker path).
 * - hero: "Rs     0,000" (rolling digits other than 0 drew blank)
 * - sticky bar: "Rs 950,00C" (price clipped by the "View on Riyasewana" button)
 */
class PriceRegressionScreenshotsTest {
    private val worst = Sweep.Cfg("worst", dark = false, fontScale = 2f, narrow = true, lang = "en")
    private val user = Sweep.Cfg("user", dark = false, fontScale = 1.15f, narrow = false, lang = "en")

    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = worst.device())

    /**
     * The rolling strips themselves, at rest (frame 0 = settled for an unchanged
     * value): the 1.7.0 bug drew every digit except 0 blank.
     */
    @Test fun rolling_digits_200pct_360dp() = paparazzi.snapshot {
        Sweep.Frame(worst, reducedMotion = false) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                lk.motormila.app.ui.components.SlidingLkr(950_000.0, full = true, style = lk.motormila.app.ui.theme.MmType.current.priceL)
                lk.motormila.app.ui.components.SlidingLkr(125_000_000.0, full = true, style = lk.motormila.app.ui.theme.MmType.current.priceL)
                lk.motormila.app.ui.components.NumberTicker(123_456_789L, style = lk.motormila.app.ui.theme.MmType.current.priceL)
                lk.motormila.app.ui.components.MmPrice(125_000_000.0, mode = lk.motormila.app.ui.components.MmPriceMode.Full)
            }
        }
    }

    /** Hero price-drop layout (reduced motion = the settled end state). */
    @Test fun hero_price_drop_200pct_360dp() = paparazzi.settled {
        Sweep.Frame(worst, reducedMotion = true) {
            Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
                PriceDealSection(Sweep.nissan, isPro = false, onDealShown = {}, history = Sweep.drop(7, 1_125_000.0, 950_000.0))
                PriceDealSection(Sweep.longPrice, isPro = true, onDealShown = {}, history = Sweep.drop(8, 132_500_000.0, 125_000_000.0))
            }
        }
    }

    @Test fun sticky_bar_long_price_200pct_360dp() = paparazzi.settled {
        Sweep.Frame(worst, reducedMotion = false) {
            Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.Bottom)) {
                DetailActionBar(950_000.0, "Riyasewana", onViewSource = {})
                DetailActionBar(125_000_000.0, "Riyasewana", onViewSource = {})
            }
        }
    }

    @Test fun sticky_bar_and_hero_115pct_user_case() {
        paparazzi.unsafeUpdateConfig(deviceConfig = user.device())
        paparazzi.settled {
            Sweep.Frame(user, reducedMotion = true) {
                Box(Modifier.fillMaxSize()) {
                    PriceDealSection(Sweep.nissan, isPro = false, onDealShown = {}, history = Sweep.drop(7, 1_125_000.0, 950_000.0))
                    Column(Modifier.align(Alignment.BottomCenter), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        DetailActionBar(950_000.0, "Riyasewana", onViewSource = {})
                        DetailActionBar(125_000_000.0, "Riyasewana", onViewSource = {})
                    }
                }
            }
        }
    }
}
