package lk.motormila.app.core.price

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import lk.motormila.app.data.remote.dto.FmvDto
import lk.motormila.app.data.remote.dto.ListingDto
import lk.motormila.app.data.remote.mapper.toDomain
import lk.motormila.app.domain.model.DealBand
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Android port of the one price verdict asserts the SAME cases as
 * backend/tests/test_price_verdict.py and web src/lib/priceVerdict.test.ts:
 * docs/price-verdict-fixtures.json at the repo root.
 */
class PriceVerdictTest {

    private fun fixtures(): JsonObject {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            val f = File(dir, "docs/price-verdict-fixtures.json")
            if (f.isFile) return Json.parseToJsonElement(f.readText()).jsonObject
            dir = dir.parentFile
        }
        error("docs/price-verdict-fixtures.json not found above ${System.getProperty("user.dir")}")
    }

    private fun JsonObject.str(k: String): String? = (this[k] as? JsonElement)?.takeIf { it !is JsonNull }?.jsonPrimitive?.contentOrNull
    private fun JsonObject.dbl(k: String): Double? = (this[k] as? JsonElement)?.takeIf { it !is JsonNull }?.jsonPrimitive?.doubleOrNull
    private fun JsonObject.int(k: String): Int? = (this[k] as? JsonElement)?.takeIf { it !is JsonNull }?.jsonPrimitive?.intOrNull

    @Test
    fun sharedFixtures_matchBackendAndWeb() {
        val cases = fixtures()["cases"]!!.jsonArray
        assertTrue("expected the shared cases", cases.size >= 30)
        for (c in cases) {
            val case = c.jsonObject
            val name = case.str("name")
            val input = case["input"]!!.jsonObject
            val expect = case["expect"]!!.jsonObject
            val v = PriceVerdicts.verdict(
                asking = input.dbl("asking"),
                reference = input.dbl("reference"),
                comps = input.int("comps"),
                confidence = input.str("confidence"),
                secondaryReference = input.dbl("secondary"),
                ctx = PriceContext(
                    category = input.str("category"),
                    model = input.str("model"),
                    title = input.str("title"),
                ),
            )
            when (expect.str("status")) {
                "ok" -> {
                    assertTrue("$name: expected ok, got $v", v is PriceVerdict.Ok)
                    v as PriceVerdict.Ok
                    assertEquals("$name: band", expect.str("band"), v.band.name.lowercase())
                    assertEquals("$name: pct", expect.int("pct"), v.pct)
                    expect["verify_first"]?.jsonPrimitive?.booleanOrNull?.let {
                        assertEquals("$name: verify_first", it, v.verifyFirst)
                    }
                }
                "withheld" -> {
                    assertTrue("$name: expected withheld, got $v", v is PriceVerdict.Withheld)
                    assertEquals("$name: reason", expect.str("reason"), (v as PriceVerdict.Withheld).reason.key)
                }
                else -> error("$name: unknown status")
            }
        }
    }

    @Test
    fun listing680073_bikeAgainstCarCohort_isNeverRated() {
        // Rs 735,000 Hero-Honda Hunk stored as "Honda Other 2026" and scored against a
        // Rs 7.2 Mn mixed cohort showed "90 % below similar cars". The row now
        // carries no signal at all (no badge, no tier, no ring).
        val listing = ListingDto(
            id = 680073,
            title = "Hero-Honda Hunk Motorbike",
            make = "Honda",
            model = "Other",
            priceLkr = 735_000.0,
            dealScore = 89.8,
            marketMedianLkr = 7_201_142.86,
            vehicleCategory = "motorbikes",
        ).toDomain()
        assertNull(listing.dealScore)
        assertNull(listing.marketMedianLkr)
        assertEquals(DealBand.LOCKED, listing.dealBand())
        assertTrue(listing.rowVerdict() is PriceVerdict.Withheld)
    }

    @Test
    fun resolve_fmvIsTheReference_storedMedianCrossChecks() {
        val ctx = PriceContext(category = "cars", model = "Aqua", title = "Toyota Aqua 2017")
        val fmv = FmvReference(fmvLkr = 5_000_000.0, sampleSize = 20, confidence = "high", method = "cohort_median", withheldReason = null)
        val v = PriceVerdicts.resolve(4_500_000.0, 5_000_000.0, ctx, fmv)
        assertTrue(v is PriceVerdict.Ok)
        assertEquals(10, (v as PriceVerdict.Ok).pct)
        // Stored median says above, FMV says below → withheld, never both.
        val split = PriceVerdicts.resolve(4_500_000.0, 4_000_000.0, ctx, fmv)
        assertEquals(WithheldReason.ESTIMATES_DISAGREE, (split as PriceVerdict.Withheld).reason)
        // Backend already withheld → withheld, whatever the numbers say.
        val server = PriceVerdicts.resolve(4_500_000.0, 5_000_000.0, ctx, fmv.copy(withheldReason = "thin_comps"))
        assertEquals(WithheldReason.THIN_COMPS, (server as PriceVerdict.Withheld).reason)
        // No FMV yet → exactly the card's verdict.
        assertEquals(PriceVerdicts.forListingRow(4_500_000.0, 5_000_000.0, ctx), PriceVerdicts.resolve(4_500_000.0, 5_000_000.0, ctx, null))
    }

    @Test
    fun fmvDto_acceptsVerdictObjectAndLegacyString() {
        val json = Json { ignoreUnknownKeys = true }
        val withheld = json.decodeFromString(
            FmvDto.serializer(),
            """{"asking_lkr":85000,"fmv_lkr":null,"estimate_lkr":8500000,"deal_score":null,
               "verdict":{"status":"withheld","reason":"unit_mismatch","band":null},"sample_size":12,"confidence":"low"}""",
        ).toDomain()
        assertNull(withheld.fmvLkr)
        assertEquals("unit_mismatch", withheld.withheldReason)
        assertEquals(DealBand.LOCKED, withheld.band)
        assertEquals(12, withheld.sampleCount)

        val ok = json.decodeFromString(
            FmvDto.serializer(),
            """{"asking_lkr":4500000,"fmv_lkr":5000000,"deal_score":10.0,
               "verdict":{"status":"ok","reason":null,"band":"below","pct":10},"sample_size":20,"confidence":"high"}""",
        ).toDomain()
        assertEquals(DealBand.GREAT, ok.band)
        assertNull(ok.withheldReason)

        val legacy = json.decodeFromString(
            FmvDto.serializer(),
            """{"fmv_lkr":5000000,"deal_score":-3.0,"verdict":"fair"}""",
        ).toDomain()
        assertEquals(DealBand.FAIR, legacy.band)
        assertEquals("fair", legacy.label)
    }

    @Test
    fun leaseDetector_scrubsHarmlessPhrases() {
        assertTrue(LeaseTakeover.detect("Honda Vezel lease takeover"))
        assertTrue(!LeaseTakeover.detect("Toyota Vitz 2018 leasing available"))
        assertTrue(!LeaseTakeover.detect("Lease fully settled, leasing can be arranged"))
    }
}
