package lk.motormila.app.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.R
import lk.motormila.app.ui.theme.MotormilaGood
import lk.motormila.app.ui.theme.MotormilaGoodContainer
import lk.motormila.app.ui.theme.MotormilaGoodSoft
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText

enum class BrandLogoSize(
    val markSize: Dp,
    val textSize: TextUnit,
    val lockupHeight: Dp,
    val showTagline: Boolean,
) {
    COMPACT(markSize = 32.dp, textSize = 18.sp, lockupHeight = 30.dp, showTagline = false),
    NAV(markSize = 38.dp, textSize = 20.sp, lockupHeight = 34.dp, showTagline = false),
    DEFAULT(markSize = 44.dp, textSize = 22.sp, lockupHeight = 40.dp, showTagline = true),
    LARGE(markSize = 56.dp, textSize = 28.sp, lockupHeight = 52.dp, showTagline = true),
}

/** Width / height of the brand v2 wordmark vectors (viewport 505.86 x 83). */
const val MOTORMILA_WORDMARK_ASPECT: Float = 505.86f / 83f

/** Theme-matched brand v2 wordmark vector. */
fun motormilaWordmarkRes(isDark: Boolean): Int =
    if (isDark) R.drawable.motormila_wordmark_on_dark else R.drawable.motormila_wordmark_on_light

/**
 * Official Motormila brand lockup.
 *
 * Brand bible: the Apex M is the only mark and "motormila" must never be set in
 * plain type next to it — so the lockup is the official `logo-wordmark`
 * artwork (brand v2: traced mark + Open Sans Bold lettering), never composed
 * text. The mark-only variant shows `motormila_mark` in the rounded squircle.
 */
@Composable
fun BrandLogo(
    modifier: Modifier = Modifier,
    size: BrandLogoSize = BrandLogoSize.NAV,
    showWordmark: Boolean = true,
    showTagline: Boolean = size.showTagline,
    tagline: String = "Sri Lanka Vehicle Market Intelligence",
    showLiveIndicator: Boolean = false,
) {
    if (!showWordmark) {
        // Mark-only variant: Apex M glyph in the rounded squircle.
        Box(
            modifier = modifier
                .size(size.markSize)
                .clip(RoundedCornerShape(size.markSize * 0.24f))
                .border(1.dp, MotormilaOutline, RoundedCornerShape(size.markSize * 0.24f)),
            contentAlignment = Alignment.Center,
        ) {
            // Brand v2 mark (vector, crisp at any density) on Ink, as the old
            // blue-on-Ink bitmap was.
            Box(
                Modifier.size(size.markSize).background(Color(0xFF09090B)),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(id = R.drawable.motormila_mark),
                    contentDescription = "Motormila",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(size.markSize * 0.66f),
                )
            }
        }
        return
    }

    Column(modifier = modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // Brand v2 lockup (fixed M size/baseline/weight), transparent vector
            // per theme so it stays crisp at every density and font scale.
            Image(
                painter = painterResource(
                    id = motormilaWordmarkRes(lk.motormila.app.ui.theme.MmColors.current.isDark),
                ),
                contentDescription = "Motormila",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .height(size.lockupHeight * 0.7f)
                    .aspectRatio(MOTORMILA_WORDMARK_ASPECT),
            )

            if (showLiveIndicator) {
                Spacer(Modifier.width(8.dp))
                MarketLivePill()
            }
        }

        if (showTagline) {
            Text(
                text = tagline.uppercase(),
                fontSize = 8.5.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.12.sp,
                color = MotormilaSecondaryText,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

/**
 * Pulsing deal-green live market pulse pill.
 */
@Composable
fun MarketLivePill(modifier: Modifier = Modifier) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val scale by infiniteTransition.animateFloat(
        initialValue = 0.85f,
        targetValue = 1.25f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulse-scale",
    )

    Row(
        modifier = modifier
            .clip(MotormilaRadius.pill)
            .background(MotormilaGoodContainer)
            .border(1.dp, MotormilaGoodSoft, MotormilaRadius.pill)
            .padding(horizontal = 7.dp, vertical = 2.5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .scale(scale)
                .clip(CircleShape)
                .background(MotormilaGood),
        )
        Spacer(Modifier.width(5.dp))
        Text(
            text = "LIVE",
            fontSize = 9.sp,
            fontWeight = FontWeight.ExtraBold,
            color = lk.motormila.app.ui.theme.MotormilaGoodText,
            letterSpacing = 0.08.sp,
        )
    }
}
