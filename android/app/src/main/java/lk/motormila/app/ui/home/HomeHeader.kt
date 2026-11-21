package lk.motormila.app.ui.home

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import lk.motormila.app.R
import lk.motormila.app.domain.model.HotDeal
import lk.motormila.app.ui.components.MmEyebrow
import lk.motormila.app.ui.components.MmIconButton
import lk.motormila.app.ui.components.MmIconButtonStyle
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.mmPress

/** Web hero accent word (cinematic.css `.accent`, #5CA5FF) with its soft glow. */
private val HeroAccent = Color(0xFF5CA5FF)

/**
 * Home top row: brand lockup (theme-aware artwork) + price-alerts button.
 * [onStage] draws the light-on-dark lockup and a glass alerts button, for
 * the stage hero (stage ink is dark in both themes).
 */
@Composable
fun HomeTopRow(onAlertsClick: () -> Unit, modifier: Modifier = Modifier, onStage: Boolean = false) {
    val c = MmColors.current
    Row(
        modifier
            .fillMaxWidth()
            .padding(start = MmSpacing.gutter, end = 8.dp, top = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            painter = painterResource(lk.motormila.app.ui.components.motormilaWordmarkRes(onStage || c.isDark)),
            contentDescription = stringResource(R.string.v19_brand_name),
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .width(132.dp)
                .aspectRatio(lk.motormila.app.ui.components.MOTORMILA_WORDMARK_ASPECT),
        )
        Spacer(Modifier.weight(1f))
        MmIconButton(
            icon = Icons.Outlined.NotificationsNone,
            contentDescription = stringResource(R.string.mm_tools_alerts),
            onClick = onAlertsClick,
            style = if (onStage) MmIconButtonStyle.Glass else MmIconButtonStyle.Filled,
        )
    }
}

/**
 * Showroom hero, v1.10 (web Dashboard hero parity): a full-bleed stage-ink
 * band. The featured deal photo fills the top ~55% of the screen (the lockup
 * floats on it, the photo fades into stage ink, its title / price / verdict
 * sit as a caption and tapping it runs the card → Detail morph). Under it:
 * kicker eyebrow, the display headline with one glowing accent word, the
 * honest sub-line and the one search pill.
 *
 * Without a featured photo, the shorter editorial image keeps search in reach.
 */
@Composable
fun HomeStageHero(
    featured: HotDeal?,
    statusTop: Dp,
    onFeaturedClick: (HotDeal) -> Unit,
    onSearchClick: () -> Unit,
    onAlertsClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    val t = MmType.current
    val bandHeight = (LocalConfiguration.current.screenHeightDp * 0.55f).dp.coerceAtLeast(280.dp)
    Column(modifier.fillMaxWidth().background(c.stage)) {
        HomeHeroPhoto(
            deal = featured,
            height = if (featured == null) (bandHeight * 0.55f).coerceAtLeast(160.dp) else bandHeight,
            statusTop = statusTop,
            onClick = onFeaturedClick,
            topRow = { HomeTopRow(onAlertsClick = onAlertsClick, onStage = true) },
        )
        Column(Modifier.fillMaxWidth().padding(horizontal = MmSpacing.gutter)) {
            Spacer(Modifier.height(MmSpacing.sm))
            MmEyebrow(stringResource(R.string.v110_home_kicker), color = c.stageAccent)
            Spacer(Modifier.height(MmSpacing.md))
            HeroHeadline()
            Spacer(Modifier.height(MmSpacing.md))
            // The live count lives in the market strip below: one place, not two.
            Text(stringResource(R.string.mm_home_sub), style = t.bodyL, color = c.onStage.copy(alpha = 0.78f))
            Spacer(Modifier.height(MmSpacing.xxl))
            StageSearchPill(onSearchClick)
            Spacer(Modifier.height(MmSpacing.xxxl))
        }
    }
}

/**
 * Display headline in the hero step (48sp, line-height ~0.96, tight
 * tracking) with [R.string.v110_home_headline_accent] drawn in the accent
 * blue with a soft glow. A one-time rise on first show; reduced motion (and
 * Paparazzi/previews) render it in place.
 */
@Composable
private fun HeroHeadline() {
    val c = MmColors.current
    val t = MmType.current
    val headline = stringResource(R.string.mm_home_title)
    val accent = stringResource(R.string.v110_home_headline_accent)
    val text = remember(headline, accent) {
        buildAnnotatedString {
            val i = if (accent.isBlank()) -1 else headline.indexOf(accent, ignoreCase = true)
            if (i < 0) {
                append(headline)
            } else {
                append(headline.substring(0, i))
                withStyle(
                    SpanStyle(
                        color = HeroAccent,
                        shadow = Shadow(color = HeroAccent.copy(alpha = 0.55f), offset = Offset.Zero, blurRadius = 28f),
                    ),
                ) { append(headline.substring(i, i + accent.length)) }
                append(headline.substring(i + accent.length))
            }
        }
    }
    // Sinhala / Tamil words are long at 48sp (mid-word breaks on 360dp):
    // they take the 32sp display step with its open line height instead.
    val latin = LocalConfiguration.current.locales[0].language !in setOf("si", "ta")
    val style = if (latin) t.hero.copy(lineHeight = t.hero.fontSize * 0.96f) else t.displayM

    val still = MmMotion.reduced || LocalInspectionMode.current
    var revealed by rememberSaveable { mutableStateOf(false) }
    val rise = remember { Animatable(if (still || revealed) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (rise.value < 1f) {
            rise.animateTo(1f, MmMotion.emphasized<Float>(durationMillis = 560))
        }
        revealed = true
    }
    lk.motormila.app.ui.theme.CappedFontScale(max = 1.3f) {
        Text(
            text,
            style = style,
            color = c.onStage,
            modifier = Modifier.graphicsLayer {
                alpha = rise.value
                translationY = (1f - rise.value) * 18.dp.toPx()
            },
        )
    }
}

/** Search entry on stage ink: translucent pill, hairline ring, light ink. */
@Composable
private fun StageSearchPill(onSearchClick: () -> Unit) {
    val c = MmColors.current
    val t = MmType.current
    val press = remember { MutableInteractionSource() }
    val hint = stringResource(R.string.mm_home_search_hint)
    Row(
        Modifier
            .fillMaxWidth()
            .height(56.dp)
            .mmPress(press)
            .clip(MmShapes.pill)
            .background(c.onStage.copy(alpha = 0.08f))
            .border(1.dp, c.onStage.copy(alpha = 0.16f), MmShapes.pill)
            .clickable(interactionSource = press, indication = null, role = Role.Button, onClick = onSearchClick)
            .semantics { contentDescription = hint }
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(Icons.Outlined.Search, null, tint = c.onStageSecondary, modifier = Modifier.size(22.dp))
        Text(hint, style = t.bodyL, color = c.onStageSecondary, maxLines = 1)
    }
}
