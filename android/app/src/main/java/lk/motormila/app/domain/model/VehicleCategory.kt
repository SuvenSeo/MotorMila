package lk.motormila.app.domain.model

/**
 * Browse categories (mirrors backend app/utils/vehicle_category.py).
 *
 * Product rule (launch, Oct 2026): the first impression is cars. Default
 * browse filters send `vehicle_category=cars`; rails built from endpoints that
 * have no category param (insights, price drops, live strip) are ranked with
 * [carsFirst] so motorbikes / three-wheelers / lorries never lead.
 */
enum class VehicleCategory(val apiValue: String?, val label: String) {
    CARS("cars", "Cars"),
    ALL(null, "All vehicles"),
    MOTORBIKES("motorbikes", "Bikes"),
    THREE_WHEELERS("three-wheelers", "Three-wheelers"),
    VANS("vans", "Vans"),
    LORRIES("lorries", "Lorries"),
    BUSES("buses", "Buses"),
    // Web parity (FilterSidebar VEHICLE_CATEGORY_VALUES): the rest of the
    // backend's vehicle_category values.
    HEAVY_DUTY("heavy-duty", "Heavy"),
    TRACTORS("tractors", "Tractors"),
    BOATS("boats", "Boats"),
    BICYCLES("bicycles", "Cycles"),
    OTHERS("others", "Other"),
    ;

    companion object {
        /** Default browse category for every listing list a user lands on. */
        val DEFAULT = CARS

        fun fromApi(value: String?): VehicleCategory =
            entries.firstOrNull { it.apiValue != null && it.apiValue == value?.trim()?.lowercase() }
                ?: if (value.isNullOrBlank()) ALL else CARS
    }
}

object VehicleCategoryRules {
    private val CAR_TOKENS = setOf(
        "cars", "car", "suvs", "suv", "jeeps", "jeep", "wagons", "pickups", "pickup",
        "crew-cabs", "crew-cab", "sports",
    )
    private val NON_CAR_TOKENS = setOf(
        "motorbikes", "motorcycles", "bike", "bikes", "three-wheelers", "three-wheels",
        "threewheeler", "vans", "van", "buses", "bus", "lorries", "lorries-trucks", "trucks",
        "truck", "tipper", "heavy-duty", "heavy-duties", "heavy", "tractors", "tractor",
        "bicycles", "bicycle", "push-cycles", "boats", "boats-water-transport", "others",
    )

    /** Same heuristic the backend uses for legacy untagged rows. */
    private val NON_CAR_TEXT = Regex(
        "(?i)\\b(motorbike|motorcycle|scooter|three[\\s-]?wheel(?:er)?s?|tuk|tractor|bicycle|" +
            "push[\\s-]?cycle|heavy[\\s-]?duty|tipper|boat|lorry|bus|ntorq|activa|pcx|dio|" +
            "pulsar|fz|apache|discover|platina|ct\\s?100|gixxer|bajaj\\s+re|tvs\\s+king|piaggio\\s+ape|" +
            "canter|dyna|elf|dimo\\s+batta|rosa|coaster)\\b",
    )
    private val NON_CAR_MAKES = setOf("tvs", "hero", "yamaha", "ktm", "royal enfield", "piaggio", "ashok leyland")

    fun normalize(value: String?): String? = value?.trim()?.lowercase()
        ?.replace('_', '-')?.replace(Regex("\\s+"), "-")?.replace(Regex("[^a-z0-9-]"), "")
        ?.takeIf { it.isNotEmpty() }

    /**
     * True for passenger cars / SUVs / jeeps / pickups. Untagged rows count as
     * cars unless the text looks like another vehicle type.
     */
    fun isCarLike(category: String?, vararg text: String?): Boolean {
        val token = normalize(category)
        if (token != null) {
            if (token in NON_CAR_TOKENS) return false
            if (token in CAR_TOKENS) return true
        }
        val make = text.firstOrNull()?.trim()?.lowercase()
        if (make != null && make in NON_CAR_MAKES) return false
        val joined = text.filterNotNull().joinToString(" ")
        return !NON_CAR_TEXT.containsMatchIn(joined)
    }

    fun isCarLike(listing: Listing): Boolean =
        isCarLike(listing.vehicleCategory, listing.make, listing.model, listing.title)
}

/**
 * Stable partition: car-like items first (original order kept within each
 * group). Never drops items, so a rail is never emptied by the rule.
 */
fun <T> List<T>.carsFirst(isCar: (T) -> Boolean): List<T> {
    val (cars, others) = partition(isCar)
    return cars + others
}

/** Cars only when there are at least [min] car items (default 1); else cars-first ranking. */
fun <T> List<T>.carsOnlyOrFirst(min: Int = 1, isCar: (T) -> Boolean): List<T> {
    val cars = filter(isCar)
    return if (cars.size >= min || cars.size == size) cars else carsFirst(isCar)
}
