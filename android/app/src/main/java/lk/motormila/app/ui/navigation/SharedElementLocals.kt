@file:OptIn(ExperimentalSharedTransitionApi::class)

package lk.motormila.app.ui.navigation

import androidx.compose.animation.AnimatedContentScope
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavDeepLink
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize

val LocalSharedTransitionScope = staticCompositionLocalOf<SharedTransitionScope?> { null }

val LocalNavAnimatedVisibilityScope = staticCompositionLocalOf<AnimatedVisibilityScope?> { null }

fun listingHeroKey(listingId: Int): String = "listing-hero-$listingId"

/** Destination class name, stripping Navigation Compose args suffixes. */
fun navRouteBase(route: String?): String? {
    if (route.isNullOrBlank()) return null
    return route.substringBefore("/").substringBefore("?")
}

fun isTabNavRoute(route: String?): Boolean {
    if (route.isNullOrBlank()) return false
    val base = navRouteBase(route) ?: return false
    if (base in BOTTOM_BAR_ROUTES) return true
    return BOTTOM_BAR_ROUTES.any { tab -> route.startsWith(tab) }
}

inline fun <reified T : Any> NavGraphBuilder.motormilaComposable(
    deepLinks: List<NavDeepLink> = emptyList(),
    noinline content: @Composable AnimatedContentScope.(NavBackStackEntry) -> Unit,
) {
    composable<T>(deepLinks = deepLinks) {
        CompositionLocalProvider(LocalNavAnimatedVisibilityScope provides this) {
            // Every page is opaque (window ground + the dark ambient bloom), so
            // a push slides a solid page over a solid page instead of two
            // see-through layers overlapping mid-transition.
            // A card-opened Detail is the exception: it draws its own ground
            // inside the card's sharedBounds, so the page beneath stays visible
            // around the growing card.
            val opaque = it.navKind() != NavKind.DETAIL_CARD
            androidx.compose.foundation.layout.Box(
                androidx.compose.ui.Modifier
                    .fillMaxSize()
                    .then(
                        if (opaque) {
                            androidx.compose.ui.Modifier.background(lk.motormila.app.ui.theme.MmColors.current.background)
                        } else {
                            androidx.compose.ui.Modifier
                        },
                    ),
            ) {
                if (opaque) lk.motormila.app.ui.theme.MotormilaAmbient()
                content(it)
            }
        }
    }
}
