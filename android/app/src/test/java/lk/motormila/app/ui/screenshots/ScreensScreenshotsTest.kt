package lk.motormila.app.ui.screenshots

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DataSaverOn
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.ui.common.InsetGroup
import lk.motormila.app.ui.common.InsetRow
import lk.motormila.app.ui.common.InsetSwitchRow
import lk.motormila.app.ui.common.MmSegmented
import lk.motormila.app.ui.common.TrendLineChart
import lk.motormila.app.ui.compare.CompareMatrix
import lk.motormila.app.ui.pricing.PricingContent
import lk.motormila.app.ui.profile.ProfileActions
import lk.motormila.app.ui.profile.ProfileContent
import lk.motormila.app.ui.profile.UiProfile
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MotormilaTheme
import lk.motormila.app.ui.valuation.QuizResult
import lk.motormila.app.ui.valuation.ValuationContent
import lk.motormila.app.ui.valuation.ValuationQuiz
import lk.motormila.app.ui.valuation.ValuationUiState
import org.junit.Rule
import org.junit.Test

/**
 * android/screens review shots (not CI goldens): record with
 * `./gradlew :app:recordPaparazziDirectDebug --tests '*ScreensScreenshotsTest*'`.
 * Sample data below is illustrative fixture data for layout only.
 */
class ScreensScreenshotsTest {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6)

    private fun shot(dark: Boolean = true, content: @androidx.compose.runtime.Composable () -> Unit) {
        // Review-only: skipped unless MM_SCREENS_SHOTS=1 so CI's verifyPaparazzi
        // never fails on goldens that were not recorded.
        org.junit.Assume.assumeTrue(System.getenv("MM_SCREENS_SHOTS") == "1")
        paparazzi.snapshot {
            MotormilaTheme(darkTheme = dark) {
                Box(Modifier.fillMaxSize().background(MmColors.current.background)) { content() }
            }
        }
    }

    private val valuationResult = ValuationUiState(
        step = 3,
        make = "Toyota",
        model = "Aqua",
        year = 2015,
        mileage = "92000",
        registration = ValuationQuiz.Registration.USED,
        answers = mapOf(
            ValuationQuiz.Question.ACCIDENTS to "minor",
            ValuationQuiz.Question.SERVICE to "full",
            ValuationQuiz.Question.OWNERS to "2",
            ValuationQuiz.Question.FLOOD to "no",
            ValuationQuiz.Question.MODS to "none",
        ),
        makesLoading = false,
        result = QuizResult(
            low = 6_450_000.0, median = 7_100_000.0, high = 7_800_000.0,
            confidence = "medium", comparableCount = 42, methodology = "", comparables = emptyList(),
        ),
    )

    @Test fun valuation_result_dark() = shot { ValuationContent(valuationResult, {}, {}, { _, _ -> }) }

    @Test fun valuation_question_dark() = shot {
        ValuationContent(valuationResult.copy(step = 2, questionIndex = 1, result = null, loading = true), {}, {}, { _, _ -> })
    }

    @Test fun valuation_car_light() = shot(dark = false) {
        ValuationContent(ValuationUiState(makesLoading = false, make = "Honda", model = "Vezel", year = 2018), {}, {}, { _, _ -> })
    }

    @Test fun pricing_dark() = shot {
        PricingContent(
            isPro = false, externalCheckout = false, dealerBusy = false,
            onOpenHome = {}, onOpenPro = {}, onDealer = {}, onOpenDealer = {},
            notify = { Text("[notify me block]", color = MmColors.current.textSecondary) },
        )
    }

    @Test fun profile_dark() = shot {
        ProfileContent(
            UiProfile(
                displayName = "Suven", email = "suven@example.com", planName = "Free", isPro = false,
                role = "user", isAdmin = false, sessionState = "signed_in", expiresAt = null,
                watchlistCount = 3, alertCount = 1, loggedIn = true,
            ),
            ProfileActions(),
        )
    }

    @Test fun settings_groups_dark() = shot { SettingsSample() }

    @Test fun settings_groups_light() = shot(dark = false) { SettingsSample() }

    @androidx.compose.runtime.Composable
    private fun SettingsSample() {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            InsetGroup(header = "Appearance") {
                Box(Modifier.padding(12.dp)) { MmSegmented(listOf("Dark", "Light", "System"), 0, {}) }
            }
            InsetGroup(header = "Language") {
                InsetRow("English", icon = Icons.Filled.Language, onClick = {})
                InsetRow("සිංහල", onClick = {})
                InsetRow("தமிழ்", onClick = {}, showDivider = false)
            }
            InsetGroup(header = "Data", footer = "Stops downloading new photos.") {
                InsetSwitchRow("Low-data mode", checked = true, onCheckedChange = {}, icon = Icons.Filled.DataSaverOn, showDivider = false)
            }
        }
    }

    @Test fun trend_chart_dark() = shot {
        Box(Modifier.padding(16.dp)) {
            TrendLineChart(
                values = listOf(7.1e6, 7.3e6, 7.2e6, 7.6e6, 7.9e6, 8.2e6),
                xLabels = listOf("May 26", "Jun 26", "Jul 26", "Aug 26", "Sep 26", "Oct 26"),
                yLabel = { lk.motormila.app.ui.common.Mn.axis(it) },
                contentDescription = "chart",
            )
        }
    }

    private fun car(id: Int, make: String, model: String, year: Int, price: Double, km: Double, fuel: String, gear: String) = Listing(
        id = id, title = "$make $model $year", make = make, model = model, year = year, priceLkr = price,
        mileageKm = km, fuelType = fuel, transmission = gear, condition = "Used", bodyType = "Hatchback",
        district = "Colombo", city = null, source = "ikman", thumbnailUrl = null, dealScore = if (id == 2) 9.0 else 2.0,
        marketMedianLkr = 7_200_000.0, scrapedAt = null, firstSeenAt = null, lastSeenAt = null,
        detailUrl = null, externalUrl = null, engineCc = 1500.0,
    )

    @Test fun compare_dark() = shot { CompareSample() }

    @Test fun compare_light() = shot(dark = false) { CompareSample() }

    @androidx.compose.runtime.Composable
    private fun CompareSample() {
        CompareMatrix(
            items = listOf(
                car(1, "Toyota", "Aqua", 2015, 6_950_000.0, 92_000.0, "Hybrid", "Auto"),
                car(2, "Honda", "Fit", 2016, 6_400_000.0, 78_000.0, "Hybrid", "Auto"),
                car(3, "Suzuki", "Swift", 2018, 7_300_000.0, 41_000.0, "Petrol", "Auto"),
            ),
            onlyDifferences = false, onToggleDifferences = {}, onOpenDetail = {}, onRemove = {}, onAdd = {},
        )
    }
}
