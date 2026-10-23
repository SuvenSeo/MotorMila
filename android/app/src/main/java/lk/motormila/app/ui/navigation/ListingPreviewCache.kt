package lk.motormila.app.ui.navigation

import lk.motormila.app.domain.model.Listing

/**
 * Card → Detail hand-off. A listing card puts the row it already shows here
 * right before navigating, so Detail's first frame renders the real photo,
 * title and price instead of a skeleton. Without it the shared-element
 * targets (photo / title / price / container) did not exist while the
 * transition ran, so the morph had nothing to land on and "broke in the
 * middle", then the page popped in when the network answered.
 *
 * Small bounded LRU (process memory only, no persistence).
 */
object ListingPreviewCache {
    private const val MAX = 48
    private val map = object : LinkedHashMap<Int, Listing>(MAX, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Int, Listing>?): Boolean = size > MAX
    }

    @Synchronized fun put(listing: Listing) {
        map[listing.id] = listing
    }

    @Synchronized fun get(id: Int): Listing? = map[id]
}
