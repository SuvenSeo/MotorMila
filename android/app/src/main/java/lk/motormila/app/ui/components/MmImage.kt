package lk.motormila.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.res.painterResource
import coil3.compose.SubcomposeAsyncImage
import coil3.compose.SubcomposeAsyncImageContent
import coil3.compose.AsyncImagePainter
import coil3.request.ImageRequest
import coil3.request.crossfade
import lk.motormila.app.R
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion

/**
 * Remote image with a 280ms crossfade (off under reduced motion) and a calm
 * placeholder: the full MotorMila lockup, faded, centred on the raised
 * surface. The same placeholder shows when the URL is null or fails, so a
 * listing without photos never looks broken. Previews/screenshots always
 * render the placeholder.
 */
@Composable
fun MmImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
) {
    val c = MmColors.current
    val reduced = MmMotion.reduced
    if (url.isNullOrBlank() || LocalInspectionMode.current) {
        MmImagePlaceholder(modifier)
        return
    }
    val context = LocalContext.current
    SubcomposeAsyncImage(
        model = ImageRequest.Builder(context)
            .data(url)
            .crossfade(if (reduced) 0 else MmMotion.Base)
            .build(),
        contentDescription = contentDescription,
        contentScale = contentScale,
        modifier = modifier.background(c.surfaceRaised),
    ) {
        val state by painter.state.collectAsState()
        when (state) {
            is AsyncImagePainter.State.Success -> SubcomposeAsyncImageContent()
            else -> MmImagePlaceholder(Modifier.fillMaxSize())
        }
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
                if (c.isDark) R.drawable.logo_wordmark_on_dark else R.drawable.logo_wordmark_on_light,
            ),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxWidth(0.42f)
                .aspectRatio(1200f / 220f)
                .alpha(if (c.isDark) 0.22f else 0.28f),
        )
    }
}
