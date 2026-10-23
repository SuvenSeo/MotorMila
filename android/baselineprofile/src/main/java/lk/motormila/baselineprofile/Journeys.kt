package lk.motormila.baselineprofile

import android.graphics.Point
import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until

/** Preview build package (`.debug` suffix so it installs over earlier previews). */
val TARGET_PACKAGE: String =
    InstrumentationRegistry.getArguments().getString("targetAppId") ?: "lk.motormila.app.debug"

private const val WAIT_MS = 20_000L

/** Answers the update / rating prompts that can sit on top of the app. */
fun MacrobenchmarkScope.dismissNoise() {
    for (label in listOf("Later", "Not now", "Wait")) {
        device.findObject(By.text(label))?.click()
    }
}

/** Cold start through the splash to the Home tab bar. */
fun MacrobenchmarkScope.startToHome() {
    pressHome()
    startActivityAndWait()
    device.wait(Until.hasObject(By.text("Buy")), WAIT_MS)
    dismissNoise()
}

fun MacrobenchmarkScope.deepLink(uri: String) {
    device.executeShellCommand("am start -W -a android.intent.action.VIEW -d $uri $TARGET_PACKAGE")
}

fun MacrobenchmarkScope.openSearch(): UiObject2? {
    deepLink("motormila://search")
    device.wait(Until.hasObject(By.desc("Search results")), WAIT_MS)
    dismissNoise()
    return device.findObject(By.desc("Search results"))
}

/**
 * Fling the result grid down three times and back up once (the scroll the
 * user feels most). Raw screen swipes: UiObject2.fling on the grid did not
 * reach the Compose list on the CI emulator (no frames were recorded).
 */
@Suppress("UNUSED_PARAMETER")
fun MacrobenchmarkScope.scrollSearch(grid: UiObject2?) {
    val w = device.displayWidth
    val h = device.displayHeight
    repeat(3) {
        device.swipe(w / 2, (h * 0.78).toInt(), w / 2, (h * 0.30).toInt(), 10)
        Thread.sleep(900)
    }
    device.swipe(w / 2, (h * 0.35).toInt(), w / 2, (h * 0.75).toInt(), 10)
    Thread.sleep(900)
}

/** Tap the first card's title block (its photo carries the Compare toggle), then back. */
fun MacrobenchmarkScope.openAndCloseDetail() {
    val grid = device.findObject(By.desc("Search results")) ?: return
    val card = grid.children.firstOrNull { it.isClickable } ?: grid.children.firstOrNull() ?: return
    val b = card.visibleBounds
    device.click(b.centerX(), b.top + (b.height() * 0.86f).toInt())
    device.wait(Until.hasObject(By.desc("Back")), WAIT_MS)
    Thread.sleep(1_500)
    device.pressBack()
    device.wait(Until.hasObject(By.desc("Search results")), WAIT_MS)
    device.waitForIdle()
}

fun MacrobenchmarkScope.switchTabs() {
    for (tab in listOf("Prices", "Tools", "Saved", "Sell", "Buy")) {
        device.findObject(By.text(tab))?.click()
        device.waitForIdle()
        Thread.sleep(600)
    }
}

/** Drag gesture helper (unused by default, kept for scroll variants). */
fun MacrobenchmarkScope.swipeUp() {
    val w = device.displayWidth
    val h = device.displayHeight
    device.swipe(arrayOf(Point(w / 2, (h * 0.8).toInt()), Point(w / 2, (h * 0.25).toInt())), 12)
}
