package lk.motormila.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.res.painterResource
import coil3.compose.AsyncImage
import androidx.compose.runtime.remember
import coil3.request.ImageRequest
import coil3.request.crossfade
import lk.motormila.app.R
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion

/**
 * Remote image, smooth-scroll edition: a single [AsyncImage] (no
 * subcomposition per cell — SubcomposeAsyncImage re-ran a subcomposition on
 * every state change, which showed up as jank while flinging the grid) drawn
 * over the calm MotorMila placeholder, which simply stays underneath (and is
 * what shows when the URL is null or fails). Crossfade 280 ms (off under
 * reduced motion).
 *
 * Memory cache is keyed by URL so a card's photo and Detail's hero share one
 * entry; [placeholderKey] (Detail page 0 passes the card's hero URL) shows the
 * already-decoded card bitmap while the larger one loads, so the card → Detail
 * morph never flashes the placeholder mid-flight. Previews/screenshots always
 * render the placeholder.
 */
@Composable
fun MmImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    placeholderKey: String? = null,
) {
    val c = MmColors.current
    val reduced = MmMotion.reduced
    if (url.isNullOrBlank() || LocalInspectionMode.current) {
        MmImagePlaceholder(modifier)
        return
    }
    val context = LocalContext.current
    val request = remember(context, url, placeholderKey, reduced) {
        ImageRequest.Builder(context)
            .data(url)
            .memoryCacheKey(url)
            .apply { (placeholderKey ?: url).let { placeholderMemoryCacheKey(it) } }
            .crossfade(if (reduced) 0 else MmMotion.Base)
            .build()
    }
    Box(modifier.background(c.surfaceRaised)) {
        MmImagePlaceholder(Modifier.matchParentSize())
        AsyncImage(
            model = request,
            contentDescription = contentDescription,
            contentScale = contentScale,
            modifier = Modifier.matchParentSize(),
        )
    }
}

@Composable
fun MmImagePlaceholder(modifier: Modifier = Modifier) {
    val c = MmColors.current
    Box(
        modifier = modifier.background(c.surfaceRaised),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            painter = painterResource(
                motormilaWordmarkRes(c.isDark),
            ),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxWidth(0.42f)
                .aspectRatio(MOTORMILA_WORDMARK_ASPECT)
                .alpha(if (c.isDark) 0.22f else 0.28f),
        )
    }
}
