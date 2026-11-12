package lk.motormila.app.ui.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** S11: typing a model and pressing Done must commit it without tapping a row. */
class ComboboxQueryTest {
    private val models = listOf("Allion", "Aqua", "Axio", "Corolla", "Prius", "Prius Alpha")

    @Test fun exactMatchIsCaseInsensitive() = assertEquals("Aqua", resolveComboboxQuery("aqua ", models))

    @Test fun prefixBeatsContains() = assertEquals("Prius", resolveComboboxQuery("pri", models))

    @Test fun containsFallback() = assertEquals("Prius Alpha", resolveComboboxQuery("alpha", models))

    @Test fun noMatchInLoadedListCommitsNothing() = assertNull(resolveComboboxQuery("Zzz", models))

    @Test fun freeTextWhenListNotLoaded() = assertEquals("Aqua", resolveComboboxQuery(" Aqua", emptyList()))

    @Test fun blankCommitsNothing() = assertNull(resolveComboboxQuery("  ", models))
}
