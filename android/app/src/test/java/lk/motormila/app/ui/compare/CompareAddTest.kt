package lk.motormila.app.ui.compare

import org.junit.Assert.*
import org.junit.Test

class CompareAddTest {
    @Test fun oneNewPickKeepsBothExistingListingsInOrder() {
        assertEquals(listOf(20, 10, 30), addOneToCompare(listOf(20, 10), 30))
    }

    @Test fun duplicatesAndFullTraysNeverReplaceAnExistingListing() {
        assertNull(addOneToCompare(listOf(20, 10), 10))
        assertNull(addOneToCompare(listOf(1, 2, 3, 4), 5))
        assertNull(addOneToCompare(listOf(1), 0))
    }
}
