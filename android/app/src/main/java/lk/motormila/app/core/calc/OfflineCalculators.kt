package lk.motormila.app.core.calc

import lk.motormila.app.data.remote.dto.LandedCostResponseDto
import lk.motormila.app.data.remote.dto.OwnershipBundleResponseDto
import lk.motormila.app.data.remote.dto.PermitDto
import lk.motormila.app.data.remote.dto.TcoResponseDto
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

/**
 * Offline calculator engine — a faithful port of
 * `backend/app/api/v1/endpoints/calculators.py` plus
 * `backend/app/services/ownership_costs.py`.
 *
 * Same role as the web `src/lib/offlineCalculators.ts`: when Neon is down
 * the repository falls back to on-device math instead of failing. Pure
 * Kotlin (no android.* imports) so it stays unit-testable on the JVM.
 *
 * Rule: backend schedule changes MUST be mirrored here.
 */
object OfflineCalculators {

    const val ENGINE_VERSION = "2026-09-21"

    // Fuel fallbacks (LKR) — identical to the backend constants.
    const val FALLBACK_PETROL_95 = 410.0
    const val FALLBACK_DIESEL = 320.0
    const val FALLBACK_ELECTRIC_KWH = 35.0

    private val excisePetrol = listOf(
        1000 to 2450.0, 1300 to 3850.0, 1500 to 4450.0, 1800 to 5150.0,
        2000 to 6400.0, 2500 to 7700.0, Int.MAX_VALUE to 8900.0,
    )
    private val exciseHybrid = listOf(
        1000 to 2100.0, 1300 to 3300.0, 1500 to 3850.0, 1800 to 4700.0,
        2000 to 5600.0, 2500 to 7100.0, Int.MAX_VALUE to 8400.0,
    )
    private val exciseDiesel = listOf(
        1500 to 5150.0, 1800 to 6150.0, 2000 to 7100.0,
        2500 to 8400.0, Int.MAX_VALUE to 9650.0,
    )
    private val exciseElectric = listOf(
        50 to 12500.0, 100 to 25000.0, 200 to 43000.0, Int.MAX_VALUE to 55000.0,
    )

    private val luxuryThresholds = mapOf(
        "petrol" to (5_000_000.0 to 1.00),
        "diesel" to (5_000_000.0 to 1.20),
        "hybrid" to (5_500_000.0 to 0.80),
        "electric" to (6_000_000.0 to 0.60),
    )

    private fun bandRate(bands: List<Pair<Int, Double>>, value: Int): Double =
        bands.first { value <= it.first }.second

    private fun r2(value: Double): Double = round(value * 100) / 100.0

    fun landedCost(
        cifUsd: Double,
        exchangeRate: Double,
        fuelType: String,
        engineCc: Int? = null,
        motorKw: Int? = null,
        applySurcharge: Boolean = true,
        applySscl: Boolean = true,
    ): LandedCostResponseDto {
        val fuel = fuelType.lowercase()
        val cifLkr = cifUsd * exchangeRate
        val cid = cifLkr * 0.20
        // 50% CID surcharge: in force 2026-05-16 → 2026-12-31 (the initial
        // 3-month window was extended; Gazette 2488/56 + 2501/88). No expiry
        // gate here — mirrors backend calculators.py, which also applies it
        // unconditionally (default ON). Re-verify the gazette after
        // 2026-12-31 and mirror any change here, in the backend, and in
        // src/data/importTaxRates.json (web).
        val surcharge = if (applySurcharge) cid * 0.50 else 0.0
        val excise = if (fuel == "electric") {
            val kw = motorKw ?: throw IllegalArgumentException("motorKw required for electric")
            kw * bandRate(exciseElectric, kw)
        } else {
            val cc = engineCc ?: throw IllegalArgumentException("engineCc required for ICE/hybrid")
            val bands = when (fuel) {
                "petrol" -> excisePetrol
                "hybrid" -> exciseHybrid
                else -> exciseDiesel
            }
            cc * bandRate(bands, cc)
        }
        val sscl = if (applySscl) (cifLkr + cid + surcharge + excise) * 0.025 else 0.0
        val vat = (cifLkr + cid + surcharge + excise + sscl) * 0.18
        val (threshold, rateExcess) = luxuryThresholds[fuel] ?: (5_000_000.0 to 1.00)
        val luxuryTax = max(0.0, cifLkr - threshold) * rateExcess
        val totalTax = cid + surcharge + excise + sscl + vat + luxuryTax
        return LandedCostResponseDto(
            cifLkr = r2(cifLkr),
            cid = r2(cid),
            surcharge = r2(surcharge),
            excise = r2(excise),
            sscl = r2(sscl),
            vat = r2(vat),
            luxuryTax = r2(luxuryTax),
            totalTax = r2(totalTax),
            landedCost = r2(cifLkr + totalTax),
            surchargeApplied = applySurcharge,
            notes = "Computed on-device (offline engine).",
        )
    }

    fun tco(
        dailyKm: Double,
        fuelType: String,
        mileageKmpl: Double,
        leaseInstallment: Double = 0.0,
        insuranceAnnual: Double = 120_000.0,
        serviceAnnual: Double = 60_000.0,
        tyresAnnual: Double = 30_000.0,
        resaleLossAnnual: Double = 100_000.0,
    ): TcoResponseDto {
        // Same fallbacks the backend uses when the Octane fetch fails; the
        // offline path skips the network call entirely.
        val fuelPrice = when (fuelType.lowercase()) {
            "diesel" -> FALLBACK_DIESEL
            "electric" -> FALLBACK_ELECTRIC_KWH
            else -> FALLBACK_PETROL_95
        }
        val fuelMonthly = (dailyKm * 30.0 / mileageKmpl) * fuelPrice
        val overheadMonthly = (insuranceAnnual + serviceAnnual + tyresAnnual + resaleLossAnnual) / 12.0
        return TcoResponseDto(
            fuelPriceLkr = r2(fuelPrice),
            fuelCostMonthly = r2(fuelMonthly),
            leaseCostMonthly = r2(leaseInstallment),
            overheadCostMonthly = r2(overheadMonthly),
            totalTcoMonthly = r2(fuelMonthly + leaseInstallment + overheadMonthly),
            notes = "Using fallback fuel prices. Computed on-device (offline engine).",
        )
    }

    // ── Ownership schedules (mirrors ownership_costs.py) ──

    private val motorCarBands = listOf(
        Triple(762.0, 2500.0, 3900.0),
        Triple(1016.0, 2600.0, 5000.0),
        Triple(1270.0, 4000.0, 7500.0),
        Triple(Double.POSITIVE_INFINITY, 5000.0, 10000.0),
    )
    private const val DUAL_PURPOSE_PETROL = 2500.0
    private const val DUAL_PURPOSE_DIESEL = 4500.0
    private const val MOTORCYCLE_REVENUE = 900.0
    private const val THREE_WHEELER_REVENUE = 550.0
    private const val EMISSION_CAR = 1550.0
    private const val EMISSION_MOTORCYCLE = 1500.0
    private const val EMISSION_THREE_WHEELER = 2000.0
    private const val STAMP_TP = 25.0

    private val tpCarBands = listOf(
        1000 to 2750.0, 1500 to 3250.0, 2000 to 4000.0, 2500 to 5000.0, Int.MAX_VALUE to 6500.0,
    )

    private fun estimateUnladenKg(engineCc: Int?): Double = when {
        engineCc == null || engineCc <= 0 -> 1100.0
        engineCc <= 1000 -> 850.0
        engineCc <= 1500 -> 1120.0
        engineCc <= 2000 -> 1350.0
        else -> 1550.0
    }

    fun ownershipBundle(
        vehicleClass: String = "motor_car",
        fuelType: String = "petrol",
        engineCc: Int? = 1500,
        unladenKg: Double? = null,
        considerationLkr: Double = 0.0,
        includeTransfer: Boolean = false,
    ): OwnershipBundleResponseDto {
        val fuel = fuelType.lowercase()
        val weight = if (unladenKg != null && unladenKg > 0) unladenKg else estimateUnladenKg(engineCc)
        val (licenceBase, emission) = when (vehicleClass) {
            "motorcycle" -> MOTORCYCLE_REVENUE to EMISSION_MOTORCYCLE
            "three_wheeler" -> THREE_WHEELER_REVENUE to EMISSION_THREE_WHEELER
            "dual_purpose" -> {
                val base = when (fuel) {
                    "diesel" -> DUAL_PURPOSE_DIESEL
                    "electric" -> DUAL_PURPOSE_PETROL * 0.5
                    else -> DUAL_PURPOSE_PETROL
                }
                base to if (fuel == "electric") 0.0 else EMISSION_CAR
            }
            else -> {
                val band = motorCarBands.first { weight < it.first }
                val base = when (fuel) {
                    "diesel" -> band.third
                    "electric" -> band.second * 0.5
                    else -> band.second
                }
                base to if (fuel == "electric") 0.0 else EMISSION_CAR
            }
        }
        val tpBase = when (vehicleClass) {
            "motorcycle" -> 850.0
            "three_wheeler" -> 1200.0
            "dual_purpose" -> 3500.0
            else -> {
                val cc = if (engineCc != null && engineCc > 0) engineCc else 1500
                tpCarBands.first { cc <= it.first }.second
            }
        }
        val transferFee = when (vehicleClass) {
            "motorcycle" -> 1500.0
            "three_wheeler" -> 2000.0
            else -> 6500.0
        }
        val transferStamp = if (includeTransfer && considerationLkr > 0) {
            r2(considerationLkr * 0.03)
        } else {
            0.0
        }
        val transferTotal = if (includeTransfer) r2(transferFee + transferStamp) else 0.0
        val licenceTotal = r2(licenceBase + emission)
        val insuranceTotal = r2(tpBase + STAMP_TP)
        return OwnershipBundleResponseDto(
            revenueLicenceLkr = licenceTotal,
            insuranceLkr = insuranceTotal,
            transferFeesLkr = transferTotal,
            emissionTestLkr = r2(emission),
            firstYearTotalLkr = r2(licenceTotal + insuranceTotal + transferTotal),
            notes = "Computed on-device (offline engine). Confirm eRL / insurer / RMV before paying.",
        )
    }

    /** Benchmark permit rates (mirrors the web hardcoded fallback). */
    fun benchmarkPermits(): List<PermitDto> = listOf(
        PermitDto(id = 1, permitName = "Government Doctor Permit", permitType = "duty_free", marketPriceLkr = 5_500_000.0),
        PermitDto(id = 2, permitName = "Government MP / State Officer Permit", permitType = "duty_free", marketPriceLkr = 9_800_000.0),
        PermitDto(id = 3, permitName = "Special EV Import Permit (Remittance)", permitType = "ev", marketPriceLkr = 2_200_000.0),
        PermitDto(id = 4, permitName = "Foreign Employment EV Permit", permitType = "ev", marketPriceLkr = 1_800_000.0),
    )
}
