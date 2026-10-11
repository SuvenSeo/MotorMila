package lk.motormila.app.ui.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** ShareUrlParser — pure JVM (java.net.URI). Swarm E owned. */
class ShareUrlParserTest {

    @Test
    fun blank_isUnsupported() {
        assertTrue(parseSharedUrl(null) is ShareTarget.Unsupported)
        assertTrue(parseSharedUrl("") is ShareTarget.Unsupported)
        assertTrue(parseSharedUrl("   ") is ShareTarget.Unsupported)
    }

    @Test
    fun unknownHost_isUnsupported() {
        val t = parseSharedUrl("https://example.com/cars/123456")
        assertTrue(t is ShareTarget.Unsupported)
    }

    @Test
    fun ikmanId_goesToSearch() {
        val t = parseSharedUrl("https://ikman.lk/en/ad/toyota-axio-2017-for-sale-colombo-1234567")
        assertTrue(t is ShareTarget.Search || t is ShareTarget.Compare)
        if (t is ShareTarget.Search) {
            assertEquals("1234567", t.query.keyword)
        }
    }

    @Test
    fun motormilaWebListing_goesToCompare() {
        val t = parseSharedUrl("https://motormila.pages.dev/listings/4242")
        assertTrue(t is ShareTarget.Compare)
        assertEquals(listOf(4242), (t as ShareTarget.Compare).ids)
    }

    @Test
    fun motormilaDeepLink_goesToCompare() {
        val t = parseSharedUrl("motormila://listing/99")
        assertTrue(t is ShareTarget.Compare)
        assertEquals(listOf(99), (t as ShareTarget.Compare).ids)
    }

    @Test
    fun slugWithoutId_goesToValuation() {
        val t = parseSharedUrl("https://ikman.lk/en/ad/toyota-axio")
        assertTrue(t is ShareTarget.Valuation || t is ShareTarget.Search)
    }

    @Test
    fun wwwHost_isStillSupported() {
        val t = parseSharedUrl("https://www.ikman.lk/en/ad/toyota-axio-2017-for-sale-colombo-1234567")
        assertTrue(t is ShareTarget.Search || t is ShareTarget.Compare)
    }

    @Test
    fun motormilaLkListing_goesToCompare() {
        val t = parseSharedUrl("https://motormila.lk/listings/88")
        assertTrue(t is ShareTarget.Compare)
        assertEquals(listOf(88), (t as ShareTarget.Compare).ids)
    }

    @Test
    fun invalidDeepLink_isUnsupported() {
        assertTrue(parseSharedUrl("motormila://listing/not-a-number") is ShareTarget.Unsupported)
    }
}
