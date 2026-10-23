package lk.motormila.app.ui.compare

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CompareLogicTest {
    @Test fun mergeKeepsTrayAndAddsNewUpToThree() {
        assertEquals(listOf(1, 2, 3), CompareLogic.merge(listOf(1, 2), listOf(3)))
        assertEquals(listOf(2, 3, 4), CompareLogic.merge(listOf(1, 2, 3), listOf(4)))
        assertEquals(listOf(1, 3, 2), CompareLogic.merge(listOf(1, 2, 3), listOf(2)))
    }

    @Test fun bestIndexIgnoresNullsAndTies() {
        assertEquals(1, CompareLogic.bestIndex(listOf(5.0, 3.0, null), CompareLogic.Best.LOW))
        assertEquals(0, CompareLogic.bestIndex(listOf(2020.0, 2018.0), CompareLogic.Best.HIGH))
        assertNull(CompareLogic.bestIndex(listOf(4.0, 4.0), CompareLogic.Best.LOW))
        assertNull(CompareLogic.bestIndex(listOf(4.0, null), CompareLogic.Best.LOW))
    }

    @Test fun differsIsCaseInsensitiveAndSkipsBlanks() {
        assertFalse(CompareLogic.differs(listOf("Petrol", "petrol", null)))
        assertTrue(CompareLogic.differs(listOf("Petrol", "Hybrid")))
    }
}
