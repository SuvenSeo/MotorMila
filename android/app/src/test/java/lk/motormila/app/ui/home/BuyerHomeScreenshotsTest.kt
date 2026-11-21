package lk.motormila.app.ui.home

import app.cash.paparazzi.Paparazzi
import lk.motormila.app.ui.screenshots.Sweep
import org.junit.Rule
import org.junit.Test

/** Exercise the other production entry, absent from the existing first-visit Home goldens. */
class BuyerHomeScreenshotsTest {
    private val config = Sweep.Cfg("saved", dark = true, fontScale = 2f, narrow = true, lang = "ta")
    @get:Rule val paparazzi = Paparazzi(deviceConfig = config.device())

    @Test fun savedDrop_360dp_tamil_largeText() = paparazzi.snapshot {
        Sweep.Frame(config) {
            HomeContent(
                state = HomeUiState(isLoading = false, savedVehicle = saved().copy(previousPriceLkr = 8_500_000.0)),
                onRefresh = {}, onRetry = {}, onDismissCached = {},
                onListingClick = {}, onSearchClick = {}, onAlertsClick = {},
            )
        }
    }
}
