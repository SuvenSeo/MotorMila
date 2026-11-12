package lk.motormila.app.ui.navigation

import lk.motormila.app.domain.repository.ListingSorts
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Primitive Search args → [lk.motormila.app.domain.repository.ListingQuery]. Pure JVM. */
class SearchRouteArgsTest {

    @Test
    fun searchArgsToQuery_mapsMakeDistrictSort() {
        val query = searchArgsToQuery(
            Search(
                q = " axio ",
                district = "Colombo",
                make = "Toyota",
                model = "Axio",
                sort = ListingSorts.PRICE_ASC,
            ),
        )
        assertEquals("axio", query.keyword)
        assertEquals("Colombo", query.district)
        assertEquals("Toyota", query.make)
        assertEquals("Axio", query.model)
        assertEquals(ListingSorts.PRICE_ASC, query.sort)
        assertFalse(query.isEmpty)
    }

    @Test
    fun searchArgsToQuery_qWinsPlateIsFallback() {
        val both = searchArgsToQuery(q = "axio", plate = " CAB-1234 ")
        assertEquals("axio", both.keyword)

        val plateOnly = searchArgsToQuery(
            q = "  ",
            district = "  ",
            make = "",
            model = null,
            sort = "  ",
            plate = " CAB-1234 ",
        )
        assertEquals("CAB-1234", plateOnly.keyword)
        assertNull(plateOnly.district)
        assertNull(plateOnly.make)
        assertNull(plateOnly.model)
        assertEquals(ListingSorts.NEWEST, plateOnly.sort)
        assertTrue(searchArgsToQuery().isEmpty)
    }

    @Test
    fun isBottomBarRoute_onlyTabDestinations() {
        assertTrue(isBottomBarRoute(Home::class.qualifiedName))
        assertTrue(isBottomBarRoute(Search::class.qualifiedName))
        assertTrue(isBottomBarRoute(Watchlist::class.qualifiedName))
        assertTrue(isBottomBarRoute(Insights::class.qualifiedName))
        assertTrue(isBottomBarRoute(Profile::class.qualifiedName))
        assertFalse(isBottomBarRoute(ListingDetail::class.qualifiedName))
        assertFalse(isBottomBarRoute(null))
    }

    @Test
    fun resolveMotormilaDeepLink_hubsAndCalculator() {
        val cars = resolveMotormilaDeepLink("motormila://cars/toyota/axio")
        assertTrue(cars is MakeModelHub)
        assertEquals("toyota", (cars as MakeModelHub).make)
        assertEquals("axio", cars.model)

        val make = resolveMotormilaDeepLink("motormila://cars/honda")
        assertTrue(make is MakeHub)
        assertEquals("honda", (make as MakeHub).make)

        val district = resolveMotormilaDeepLink("motormila://locations/Colombo")
        assertTrue(district is DistrictHub)
        assertEquals("Colombo", (district as DistrictHub).district)
        assertTrue(resolveMotormilaDeepLink("motormila://locations") is Insights)
        assertTrue(resolveMotormilaDeepLink("motormila://locations/") is Insights)
        assertTrue(resolveMotormilaDeepLink("https://motormila.pages.dev/locations") is Insights)
        assertTrue(resolveMotormilaDeepLink("https://motormila.pages.dev/locations/Kandy") is DistrictHub)

        assertTrue(resolveMotormilaDeepLink("motormila://calculator") is Calculator)
        assertTrue(resolveMotormilaDeepLink("motormila://pricing") is Pricing)
        assertTrue(resolveMotormilaDeepLink("motormila://docs") is Docs)
        assertTrue(resolveMotormilaDeepLink("motormila://admin") is Admin)
        assertTrue(resolveMotormilaDeepLink("motormila://chargers") is EvChargers)
        assertTrue(resolveMotormilaDeepLink("motormila://privacy") is Privacy)
        assertTrue(resolveMotormilaDeepLink("motormila://terms") is Terms)
        assertTrue(resolveMotormilaDeepLink("motormila://permits") is Permits)
        assertTrue(resolveMotormilaDeepLink("https://motormila.pages.dev/price-index") is PriceIndex)
        assertTrue(resolveMotormilaDeepLink("motormila://price-index") is PriceIndex)
        assertTrue(resolveMotormilaDeepLink("https://motormila.pages.dev/trends") is Insights)
        val guide = resolveMotormilaDeepLink("https://motormila.pages.dev/official-pulse/guide/dmt_registrations")
        assertTrue(guide is PulseGuide)
        assertEquals("dmt_registrations", (guide as PulseGuide).key)
        assertTrue(resolveMotormilaDeepLink("motormila://pulse/12") is OfficialPulseDetail)
        assertEquals(12, (resolveMotormilaDeepLink("motormila://pulse/12") as OfficialPulseDetail).id)
        assertTrue(
            resolveMotormilaDeepLink("https://motormila.pages.dev/official-pulse/9") is OfficialPulseDetail,
        )
        assertTrue(isTabNavRoute(Home::class.qualifiedName))
        assertFalse(isTabNavRoute(ListingDetail::class.qualifiedName))
        assertFalse(isTabNavRoute(null))
        assertTrue(isTabSwitch(Home::class.qualifiedName, Search::class.qualifiedName))
        assertFalse(isTabSwitch(Home::class.qualifiedName, ListingDetail::class.qualifiedName))
        assertTrue(
            resolveMotormilaDeepLink("https://motormila.pages.dev/cars/toyota/aqua") is MakeModelHub,
        )
        assertTrue(resolveMotormilaDeepLink("https://motormila.pages.dev/") is Home)
        assertTrue(resolveMotormilaDeepLink("https://motormila.pages.dev/estimate") is Valuation)
        assertTrue(resolveMotormilaDeepLink("https://motormila.pages.dev/best-picks") is BestPicks)
        assertTrue(resolveMotormilaDeepLink("https://motormila.pages.dev/dealer") is Dealer)
        assertTrue(resolveMotormilaDeepLink("https://motormila.pages.dev/settings") is Settings)
        assertTrue(resolveMotormilaDeepLink("https://motormila.pages.dev/alerts") is Alerts)
        val signIn = resolveMotormilaDeepLink("https://motormila.pages.dev/sign-in")
        assertTrue(signIn is Login)
        assertEquals(false, (signIn as Login).signup)
        assertNull(signIn.token)
        val signUp = resolveMotormilaDeepLink("https://motormila.pages.dev/sign-up?token=invite-abc")
        assertTrue(signUp is Login)
        assertEquals(true, (signUp as Login).signup)
        assertEquals("invite-abc", signUp.token)
        val motormilaSignup = resolveMotormilaDeepLink("motormila://sign-up?token=from-app")
        assertTrue(motormilaSignup is Login)
        assertEquals("from-app", (motormilaSignup as Login).token)
        assertTrue(motormilaSignup.signup)
        assertTrue(resolveMotormilaDeepLink("https://motormila.pages.dev/pro") is Pro)
        assertTrue(resolveMotormilaDeepLink("https://motormila.pages.dev/official-pulse") is OfficialPulse)
        val compare = resolveMotormilaDeepLink("https://motormila.pages.dev/compare?ids=1,2,9")
        assertTrue(compare is Compare)
        assertEquals(listOf(1, 2, 9), (compare as Compare).ids)
        val compareSlug = resolveMotormilaDeepLink("https://motormila.pages.dev/compare/12-vs-45")
        assertTrue(compareSlug is Compare)
        assertEquals(listOf(12, 45), (compareSlug as Compare).ids)
        assertEquals(
            listOf(4, 5),
            (resolveMotormilaDeepLink("motormila://compare/4-vs-5") as Compare).ids,
        )
        assertTrue(resolveMotormilaDeepLink("motormila://estimate") is Valuation)
        assertTrue(resolveMotormilaDeepLink("motormila://compare?ids=4,5") is Compare)
    }

    @Test
    fun destinationAfterSplash_alwaysHomeUnlessDeepLink() {
        assertEquals(Home, destinationAfterSplash(isLoggedIn = false))
        assertEquals(Home, destinationAfterSplash(isLoggedIn = true))
        val listing = ListingDetail(42)
        assertEquals(listing, destinationAfterSplash(isLoggedIn = false, deepLinkTarget = listing))
        assertEquals(listing, destinationAfterSplash(isLoggedIn = true, deepLinkTarget = listing))
    }
}
