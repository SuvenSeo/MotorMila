package lk.motormila.baselineprofile

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Generates MotorMila's Baseline Profile on a CI emulator: cold start, scroll
 * the Search grid, open and close a listing (card -> Detail container
 * transform and back), switch tabs. Output `*-baseline-prof.txt` is committed
 * as app/src/main/baseline-prof.txt (also used as the startup profile).
 */
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generate() = rule.collect(
        packageName = TARGET_PACKAGE,
        includeInStartupProfile = false,
        maxIterations = 3,
        stableIterations = 2,
    ) {
        startToHome()
        val grid = openSearch()
        scrollSearch(grid)
        openAndCloseDetail()
        switchTabs()
    }
}
