package lk.motormila.app.ui.compare

internal const val COMPARE_CAPACITY = 4

/** Picker entry: preserve the tray in order and add one distinct listing, or do nothing. */
internal fun addOneToCompare(existing: List<Int>, picked: Int): List<Int>? {
    if (picked <= 0 || picked in existing || existing.size >= COMPARE_CAPACITY) return null
    return existing + picked
}
