package lk.motormila.baselineprofile

import androidx.benchmark.macro.BaselineProfileMode
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Frame timing for the journeys the owner called out (Search scroll, Detail
 * open/close) plus cold start, each WITHOUT any AOT profile ("None") and WITH
 * the shipped baseline profile ("Partial"). CI uses a software-rendered
 * emulator, so only relative numbers between the two modes / builds mean much.
 */
@RunWith(AndroidJUnit4::class)
class Benchmarks {
    @get:Rule
    val rule = MacrobenchmarkRule()

    private val iterations = 3

    @Test fun startupNone() = startup(CompilationMode.None())
    @Test fun startupBaseline() = startup(CompilationMode.Partial(BaselineProfileMode.UseIfAvailable))
    @Test fun searchScrollNone() = searchScroll(CompilationMode.None())
    @Test fun searchScrollBaseline() = searchScroll(CompilationMode.Partial(BaselineProfileMode.UseIfAvailable))
    @Test fun detailOpenCloseNone() = detail(CompilationMode.None())
    @Test fun detailOpenCloseBaseline() = detail(CompilationMode.Partial(BaselineProfileMode.UseIfAvailable))

    private fun startup(mode: CompilationMode) = rule.measureRepeated(
        packageName = TARGET_PACKAGE,
        metrics = listOf(StartupTimingMetric()),
        compilationMode = mode,
        startupMode = StartupMode.COLD,
        iterations = iterations,
        setupBlock = {
            // CI flake (run 39929440281): the app was alive again right after
            // the harness killed it ("must not be running prior to cold
            // start"). Kill until it stays dead before the cold launch.
            pressHome()
            for (attempt in 0 until 5) {
                if (device.executeShellCommand("pidof $TARGET_PACKAGE").isBlank()) break
                killProcess()
                Thread.sleep(400)
            }
        },
    ) {
        startToHome()
    }

    private fun searchScroll(mode: CompilationMode) = rule.measureRepeated(
        packageName = TARGET_PACKAGE,
        metrics = listOf(FrameTimingMetric()),
        compilationMode = mode,
        startupMode = StartupMode.WARM,
        iterations = iterations,
        setupBlock = {
            startToHome()
            openSearch()
        },
    ) {
        scrollSearch(null)
    }

    private fun detail(mode: CompilationMode) = rule.measureRepeated(
        packageName = TARGET_PACKAGE,
        metrics = listOf(FrameTimingMetric()),
        compilationMode = mode,
        startupMode = StartupMode.WARM,
        iterations = iterations,
        setupBlock = {
            startToHome()
            openSearch()
        },
    ) {
        openAndCloseDetail()
    }
}
