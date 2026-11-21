package lk.motormila.app.ui.components

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Test

/** Architecture guard: these collection surfaces only have listing observations, not verdict evidence.
 * If the feed gains a canonical verdict, pass that object; never read a naked score or fetch FMV per row.
 */
class BuyerPricePublicationBoundaryTest {
    private fun source(path: String): String = listOf("src/main", "app/src/main", "android/app/src/main")
        .map { File(it, "java/lk/motormila/app/$path") }.first { it.isFile }.readText()

    @Test fun `grid list and saved cannot turn partial rows into market comparisons`() {
        val surfaces = listOf("ui/components/ListingCard.kt", "ui/watchlist/WatchlistScreen.kt")
        val rawEvidence = Regex("""\.(?:dealScore|marketMedianLkr|underFmvFraction|fmvLkr|dealBand|rowVerdict|deltaVsMedianPct)\b""")
        for (path in surfaces) assertFalse("Partial comparison in $path", rawEvidence.containsMatchIn(source(path)))
    }

    @Test fun `saved refresh never requests a valuation per listing`() {
        assertFalse(Regex("""\.getFmv\s*\(""").containsMatchIn(source("data/repository/WatchlistRepositoryImpl.kt")))
    }
}
