package lk.motormila.app.ui.screenshots

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import androidx.compose.ui.platform.ComposeView
import com.android.resources.NightMode
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PriceHistory
import lk.motormila.app.domain.model.PricePoint
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MotormilaTheme

/** SCREENSHOT-ONLY stress fixtures (never shipped). */
internal object Sweep {
    /** Pixel 6 is 1080 px @ 420 dpi = 411 dp; 945 px = 360 dp (narrow phone). */
    const val NARROW_PX = 945

    data class Cfg(val id: String, val dark: Boolean, val fontScale: Float, val narrow: Boolean, val lang: String) {
        fun device(): DeviceConfig = DeviceConfig.PIXEL_6.copy(
            fontScale = fontScale,
            screenWidth = if (narrow) NARROW_PX else DeviceConfig.PIXEL_6.screenWidth,
            locale = lang,
            nightMode = if (dark) NightMode.NIGHT else NightMode.NOTNIGHT,
        )
    }

    /** Reduced matrix: every axis value appears, the worst combos are covered. */
    val matrix = listOf(
        Cfg("L100N_en", dark = false, fontScale = 1f, narrow = false, lang = "en"),
        Cfg("D130W_si", dark = true, fontScale = 1.3f, narrow = true, lang = "si"),
        Cfg("L200W_ta", dark = false, fontScale = 2f, narrow = true, lang = "ta"),
        Cfg("D200N_en", dark = true, fontScale = 2f, narrow = false, lang = "en"),
    )

    fun listing(
        id: Int,
        title: String,
        price: Double,
        median: Double? = null,
        score: Double? = null,
        mileage: Double? = 48_000.0,
        source: String = "riyasewana",
    ) = Listing(
        id = id, title = title, make = title.substringBefore(' '), model = title.substringAfter(' '),
        year = 2018, priceLkr = price, mileageKm = mileage, fuelType = "hybrid", transmission = "auto",
        condition = "used", bodyType = "hatchback", district = "Colombo", city = "Nugegoda", source = source,
        thumbnailUrl = null, images = emptyList(), dealScore = score, marketMedianLkr = median,
        scrapedAt = null, firstSeenAt = null, lastSeenAt = null, detailUrl = null, externalUrl = null, engineCc = 1000.0,
    )

    const val LONG_TITLE = "Mercedes-Benz S-Class S400d 4MATIC AMG Line Premium Plus Panoramic Executive Edition"

    val nissan = listing(7, "Nissan B211 TurboCharged Car", 950_000.0, 1_125_000.0, 3.0)
    val longPrice = listing(8, LONG_TITLE, 125_000_000.0, 118_000_000.0, -4.0)
    val zeroPrice = listing(9, "Toyota Land Cruiser Prado TX-L", 0.0, null, null, mileage = 0.0)
    val negative = listing(10, "Suzuki Alto", 1_850_000.0, 2_900_000.0, 35.0, mileage = -1.0)

    fun drop(id: Int, old: Double, new: Double) = PriceHistory(
        listingId = id,
        points = listOf(PricePoint(old, "2026-10-01"), PricePoint(new, "2026-10-20")),
        lastChangeAt = "2026-10-20",
    )

    @Composable
    fun Frame(cfg: Cfg, reducedMotion: Boolean = true, content: @Composable () -> Unit) {
        MotormilaTheme(darkTheme = cfg.dark, reducedMotion = reducedMotion, languageTag = cfg.lang) {
            Box(Modifier.fillMaxSize().background(MmColors.current.background)) { content() }
        }
    }

    /**
     * Snapshot after [millis] of frames so tickers/springs have SETTLED (a plain
     * compose snapshot is frame 0: a price drop shows the strips mid-roll).
     */
    fun Paparazzi.settled(name: String? = null, millis: Long = 3_000L, content: @Composable () -> Unit) {
        val view = ComposeView(context).apply { setContent(content) }
        snapshot(view, name, offsetMillis = millis)
    }
}
