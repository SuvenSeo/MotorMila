package lk.motormila.app.domain

import lk.motormila.app.domain.model.VehicleCategory
import lk.motormila.app.domain.model.VehicleCategoryRules
import lk.motormila.app.domain.model.carsFirst
import lk.motormila.app.domain.model.carsOnlyOrFirst
import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.ui.search.defaultSearchQuery
import lk.motormila.app.ui.search.withDefaultCategory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VehicleCategoryRulesTest {
    @Test
    fun taggedCategoriesWin() {
        assertTrue(VehicleCategoryRules.isCarLike("cars", "Toyota", "Aqua"))
        assertTrue(VehicleCategoryRules.isCarLike("suvs", "Toyota", "Land Cruiser"))
        assertFalse(VehicleCategoryRules.isCarLike("motorbikes", "Honda", "CB"))
        assertFalse(VehicleCategoryRules.isCarLike("three-wheelers", "Bajaj", "RE"))
        assertFalse(VehicleCategoryRules.isCarLike("Lorries", "Isuzu", "Elf"))
    }

    @Test
    fun untaggedRowsUseTextHeuristic() {
        assertTrue(VehicleCategoryRules.isCarLike(null, "Toyota", "Prius", "Toyota Prius 2018"))
        assertTrue(VehicleCategoryRules.isCarLike(null, "Land Rover", "Discovery"))
        assertFalse(VehicleCategoryRules.isCarLike(null, "Honda", "Dio"))
        assertFalse(VehicleCategoryRules.isCarLike(null, "TVS", "Ntorq"))
        assertFalse(VehicleCategoryRules.isCarLike(null, "Bajaj", "RE", "Bajaj RE three wheeler"))
    }

    @Test
    fun carsFirstIsStableAndNeverDrops() {
        val items = listOf("bike1", "car1", "bike2", "car2")
        assertEquals(listOf("car1", "car2", "bike1", "bike2"), items.carsFirst { it.startsWith("car") })
        // Too few cars -> ranking, not filtering.
        assertEquals(4, items.carsOnlyOrFirst(min = 3) { it.startsWith("car") }.size)
        // Enough cars -> cars only.
        assertEquals(listOf("car1", "car2"), items.carsOnlyOrFirst(min = 2) { it.startsWith("car") })
    }

    @Test
    fun searchDefaultsToCars() {
        assertEquals("cars", defaultSearchQuery().vehicleCategory)
        assertEquals(VehicleCategory.CARS, VehicleCategory.fromApi("cars"))
        assertEquals(VehicleCategory.ALL, VehicleCategory.fromApi(null))
    }

    @Test
    fun deepLinksDefaultToCarsUnlessClearlyNotACar() {
        assertEquals("cars", ListingQuery(make = "Toyota").withDefaultCategory().vehicleCategory)
        assertNull(ListingQuery(make = "Bajaj", model = "RE").withDefaultCategory().vehicleCategory)
        assertNull(ListingQuery(keyword = "honda dio").withDefaultCategory().vehicleCategory)
        assertEquals("motorbikes", ListingQuery(vehicleCategory = "motorbikes").withDefaultCategory().vehicleCategory)
    }
}
