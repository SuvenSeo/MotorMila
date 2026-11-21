package lk.motormila.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import coil3.compose.AsyncImage
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import lk.motormila.app.ui.theme.CappedFontScale
import lk.motormila.app.ui.theme.MmType
import coil3.request.ImageRequest
import coil3.request.crossfade
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
    /** Caption under the silhouette when there is no photo (blank URL or a failed load), e.g. "No photo · see it on ikman.lk". */
    fallbackCaption: String? = null,
) {
    val c = MmColors.current
    val reduced = MmMotion.reduced
    if (url.isNullOrBlank() || LocalInspectionMode.current) {
        MmImagePlaceholder(modifier, caption = if (url.isNullOrBlank()) fallbackCaption else null)
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
    // The caption only appears once the load has actually failed (never while
    // the photo is still on its way).
    var failed by remember(url) { mutableStateOf(false) }
    Box(modifier.background(c.surfaceRaised)) {
        MmImagePlaceholder(Modifier.matchParentSize(), caption = if (failed) fallbackCaption else null)
        AsyncImage(
            model = request,
            contentDescription = contentDescription,
            contentScale = contentScale,
            onSuccess = { failed = false },
            onError = { failed = true },
            modifier = Modifier.matchParentSize(),
        )
    }
}

/**
 * Calm placeholder plate: theme-aware raised ground with a quiet vehicle
 * silhouette (replaces the Apex-M wordmark fallback). Used for blank URLs,
 * load failures and previews — never a hard brand stamp on a missing photo.
 * [caption] (optional) sits under the silhouette, one line.
 */
@Composable
fun MmImagePlaceholder(modifier: Modifier = Modifier, caption: String? = null) {
    val c = MmColors.current
    val silhouette = c.textTertiary.copy(alpha = if (c.isDark) 0.30f else 0.34f)
    val cabin = remember { vehicleCabinPath() }
    Box(
        modifier = modifier.background(c.surfaceRaised),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Canvas(
            Modifier
                .fillMaxWidth(0.44f)
                .aspectRatio(2.5f),
        ) {
            // Draw in a normalised 100×40 space, scaled to the plate.
            scale(size.width / 100f, size.height / 40f, pivot = Offset.Zero) {
                // Body
                drawRoundRect(
                    silhouette,
                    topLeft = Offset(4f, 17f),
                    size = Size(92f, 13f),
                    cornerRadius = CornerRadius(6f, 6f),
                )
                // Cabin
                drawPath(cabin, silhouette)
                // Wheels + quiet hub cutouts
                drawCircle(silhouette, radius = 7f, center = Offset(26f, 31f))
                drawCircle(silhouette, radius = 7f, center = Offset(74f, 31f))
                drawCircle(c.surfaceRaised, radius = 2.5f, center = Offset(26f, 31f))
                drawCircle(c.surfaceRaised, radius = 2.5f, center = Offset(74f, 31f))
            }
        }
        if (caption != null) {
            Spacer(Modifier.height(6.dp))
            CappedFontScale(max = 1.3f) {
                Text(
                    text = caption,
                    style = MmType.current.caption,
                    color = c.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 10.dp),
                )
            }
        }
        }
    }
}

/** Generic car cabin (roof + windscreen slopes) in the 100×40 placeholder space. */
private fun vehicleCabinPath(): Path = Path().apply {
    moveTo(22f, 18f)
    lineTo(30f, 9f)
    quadraticBezierTo(32f, 7f, 36f, 7f)
    lineTo(60f, 7f)
    quadraticBezierTo(64f, 7f, 67f, 10f)
    lineTo(77f, 18f)
    close()
}
