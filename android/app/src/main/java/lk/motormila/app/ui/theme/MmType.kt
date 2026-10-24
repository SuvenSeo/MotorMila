package lk.motormila.app.ui.theme

import android.content.Context
import android.graphics.Typeface
import android.os.Build
import androidx.annotation.FontRes
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.AndroidFont
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontLoadingStrategy
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.sp
import androidx.core.content.res.ResourcesCompat
import lk.motormila.app.R

/**
 * Bundled brand faces: Cal Sans v2 (SIL OFL 1.1, github.com/calcom/sans,
 * "static-essentials" cut, Latin subset; licence in assets/licenses/).
 * - [CalSans] (display optical size, Medium/SemiBold/Bold): display, large
 *   titles and hero prices (>= 24sp, where the display drawing is designed).
 * - [CalSansText] (Cal Sans Text UI, 10pt optical size, Regular-Bold): body,
 *   labels, captions and small prices. Wider spacing and a plain I/l keep
 *   14-16sp body copy readable.
 * - Noto Sans Sinhala / Tamil 400/600: per-glyph fallback when the app
 *   language is si / ta (API 29+ CustomFallbackBuilder; older devices use the
 *   system Noto fallback). Latin always renders in Cal Sans.
 */
val CalSans = FontFamily(
    Font(R.font.cal_sans_medium, FontWeight.Normal),
    Font(R.font.cal_sans_medium, FontWeight.Medium),
    Font(R.font.cal_sans_semibold, FontWeight.SemiBold),
    Font(R.font.cal_sans_bold, FontWeight.Bold),
)

val CalSansText = FontFamily(
    Font(R.font.cal_sans_text_regular, FontWeight.Normal),
    Font(R.font.cal_sans_text_medium, FontWeight.Medium),
    Font(R.font.cal_sans_text_semibold, FontWeight.SemiBold),
    Font(R.font.cal_sans_text_bold, FontWeight.Bold),
)

/** Legacy aliases: every Latin face in the app is Cal Sans now. */
val SpaceGrotesk: FontFamily get() = CalSans
val Inter: FontFamily get() = CalSansText

/** Cal Sans primary + bundled Noto fallback for Sinhala / Tamil glyphs. */
@OptIn(ExperimentalTextApi::class)
private class CalSansWithFallback(
    @FontRes val primary: Int,
    @FontRes val fallback: Int,
    override val weight: FontWeight,
) : AndroidFont(FontLoadingStrategy.Blocking, FallbackLoader, FontVariation.Settings()) {
    override val style: FontStyle = FontStyle.Normal
}

@OptIn(ExperimentalTextApi::class)
private object FallbackLoader : AndroidFont.TypefaceLoader {
    override fun loadBlocking(context: Context, font: AndroidFont): Typeface? {
        val f = font as CalSansWithFallback
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            runCatching {
                val res = context.resources
                val primary = android.graphics.fonts.FontFamily.Builder(
                    android.graphics.fonts.Font.Builder(res, f.primary).build(),
                ).build()
                val fallback = android.graphics.fonts.FontFamily.Builder(
                    android.graphics.fonts.Font.Builder(res, f.fallback).build(),
                ).build()
                return Typeface.CustomFallbackBuilder(primary)
                    .addCustomFallback(fallback)
                    .setSystemFallback("sans-serif")
                    .setStyle(
                        android.graphics.fonts.FontStyle(
                            f.weight.weight,
                            android.graphics.fonts.FontStyle.FONT_SLANT_UPRIGHT,
                        ),
                    )
                    .build()
            }
        }
        return ResourcesCompat.getFont(context, f.primary)
    }

    override suspend fun awaitLoad(context: Context, font: AndroidFont): Typeface? =
        loadBlocking(context, font)
}

private fun withScript(
    regular: Int,
    medium: Int,
    semibold: Int,
    bold: Int,
    scriptRegular: Int,
    scriptSemibold: Int,
) = FontFamily(
    CalSansWithFallback(regular, scriptRegular, FontWeight.Normal),
    CalSansWithFallback(medium, scriptRegular, FontWeight.Medium),
    CalSansWithFallback(semibold, scriptSemibold, FontWeight.SemiBold),
    CalSansWithFallback(bold, scriptSemibold, FontWeight.Bold),
)

private val CalSansSinhala by lazy {
    withScript(
        R.font.cal_sans_medium, R.font.cal_sans_medium, R.font.cal_sans_semibold, R.font.cal_sans_bold,
        R.font.noto_sans_sinhala_regular, R.font.noto_sans_sinhala_semibold,
    )
}
private val CalSansTextSinhala by lazy {
    withScript(
        R.font.cal_sans_text_regular, R.font.cal_sans_text_medium, R.font.cal_sans_text_semibold, R.font.cal_sans_text_bold,
        R.font.noto_sans_sinhala_regular, R.font.noto_sans_sinhala_semibold,
    )
}
private val CalSansTamil by lazy {
    withScript(
        R.font.cal_sans_medium, R.font.cal_sans_medium, R.font.cal_sans_semibold, R.font.cal_sans_bold,
        R.font.noto_sans_tamil_regular, R.font.noto_sans_tamil_semibold,
    )
}
private val CalSansTextTamil by lazy {
    withScript(
        R.font.cal_sans_text_regular, R.font.cal_sans_text_medium, R.font.cal_sans_text_semibold, R.font.cal_sans_text_bold,
        R.font.noto_sans_tamil_regular, R.font.noto_sans_tamil_semibold,
    )
}

/** Bundled Noto faces (kept public for any caller that wants the pure script face). */
val NotoSansSinhala = FontFamily(
    Font(R.font.noto_sans_sinhala_regular, FontWeight.Normal),
    Font(R.font.noto_sans_sinhala_regular, FontWeight.Medium),
    Font(R.font.noto_sans_sinhala_semibold, FontWeight.SemiBold),
    Font(R.font.noto_sans_sinhala_semibold, FontWeight.Bold),
)

val NotoSansTamil = FontFamily(
    Font(R.font.noto_sans_tamil_regular, FontWeight.Normal),
    Font(R.font.noto_sans_tamil_regular, FontWeight.Medium),
    Font(R.font.noto_sans_tamil_semibold, FontWeight.SemiBold),
    Font(R.font.noto_sans_tamil_semibold, FontWeight.Bold),
)

private val Trim = LineHeightStyle(
    alignment = LineHeightStyle.Alignment.Center,
    trim = LineHeightStyle.Trim.None,
)
private val NoFontPadding = PlatformTextStyle(includeFontPadding = false)

private fun style(
    family: FontFamily,
    weight: FontWeight,
    size: Int,
    line: Int,
    tracking: Double = 0.0,
    features: String? = null,
) = TextStyle(
    fontFamily = family,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = tracking.sp,
    fontFeatureSettings = features,
    platformStyle = NoFontPadding,
    lineHeightStyle = Trim,
)

/**
 * Type scale. Read with `MmType.current.titleL` etc. All Latin text is Cal
 * Sans (display tier for big type, Text UI tier for body/UI).
 * Prices use tabular figures so animated digits never jitter.
 */
@Immutable
data class MmType(
    val displayL: TextStyle,
    val displayM: TextStyle,
    val titleL: TextStyle,
    val titleM: TextStyle,
    val titleS: TextStyle,
    val bodyL: TextStyle,
    val bodyM: TextStyle,
    val bodyS: TextStyle,
    val label: TextStyle,
    val labelS: TextStyle,
    val caption: TextStyle,
    val overline: TextStyle,
    val priceL: TextStyle,
    val priceM: TextStyle,
    val priceS: TextStyle,
    val numeric: TextStyle,
) {
    companion object {
        /**
         * Cal Sans scale. Display tier (designed for >= 24sp) carries display,
         * large titles and the hero price; the Text UI tier carries everything
         * at 11-20sp. Cal Sans' display cut is already tightly spaced (word
         * spaces are narrow), so tracking is much gentler than the old Space Grotesk values; body sits at 0 so 14-16sp
         * copy keeps its open spacing (and stays legible at 200% font scale,
         * where line heights scale with the sp size).
         */
        fun build(body: FontFamily = CalSansText, display: FontFamily = CalSans) = MmType(
            displayL = style(display, FontWeight.Bold, 40, 46, -0.4),
            displayM = style(display, FontWeight.Bold, 32, 38, -0.3),
            titleL = style(display, FontWeight.SemiBold, 26, 32, -0.15),
            titleM = style(body, FontWeight.SemiBold, 20, 26, -0.2),
            titleS = style(body, FontWeight.SemiBold, 17, 22, -0.1),
            bodyL = style(body, FontWeight.Normal, 16, 24, 0.0),
            bodyM = style(body, FontWeight.Normal, 15, 22, 0.0),
            bodyS = style(body, FontWeight.Normal, 13, 18, 0.05),
            label = style(body, FontWeight.SemiBold, 14, 18, 0.0),
            labelS = style(body, FontWeight.SemiBold, 12, 16, 0.1),
            caption = style(body, FontWeight.Medium, 12, 16, 0.1),
            overline = style(body, FontWeight.SemiBold, 11, 14, 0.9),
            priceL = style(display, FontWeight.Bold, 30, 36, -0.2, "tnum"),
            priceM = style(body, FontWeight.Bold, 20, 24, -0.2, "tnum"),
            priceS = style(body, FontWeight.SemiBold, 16, 20, -0.1, "tnum"),
            numeric = style(body, FontWeight.Medium, 14, 18, 0.0, "tnum"),
        )

        val Default = build()

        /** Body face for the app language (si → Noto Sinhala, ta → Noto Tamil). */
        fun forLanguage(languageTag: String?): MmType = when (languageTag?.substringBefore('-')) {
            "si" -> build(body = CalSansTextSinhala, display = CalSansSinhala)
            "ta" -> build(body = CalSansTextTamil, display = CalSansTamil)
            else -> Default
        }

        val current: MmType
            @Composable @ReadOnlyComposable
            get() = LocalMmType.current
    }
}

val LocalMmType = staticCompositionLocalOf { MmType.Default }

/** Material 3 typography mapped from [MmType] so stock M3 widgets match. */
fun MmType.toMaterial(): Typography = Typography(
    displayLarge = displayL,
    displayMedium = priceL,
    displaySmall = displayM,
    headlineLarge = titleL,
    headlineMedium = titleM,
    headlineSmall = titleM,
    titleLarge = titleM,
    titleMedium = titleS,
    titleSmall = label,
    bodyLarge = bodyL,
    bodyMedium = bodyM,
    bodySmall = bodyS,
    labelLarge = label,
    labelMedium = labelS,
    labelSmall = caption,
)

/** Tabular-figure Cal Sans for numbers in tables, tickers and price rows. */
fun TextStyle.tabular(): TextStyle =
    if (fontFamily != null) copy(fontFeatureSettings = "tnum")
    else copy(fontFeatureSettings = "tnum")

/**
 * Caps the user's font scale for fixed-height chrome (tab bar labels, stat
 * tiles), the way iOS caps tab-bar text: content still grows up to [max]
 * (default 1.3x) but never clips at 200%. Body copy elsewhere scales fully.
 */
@Composable
fun CappedFontScale(max: Float = 1.3f, content: @Composable () -> Unit) {
    val density = androidx.compose.ui.platform.LocalDensity.current
    if (density.fontScale <= max) {
        content()
    } else {
        androidx.compose.runtime.CompositionLocalProvider(
            androidx.compose.ui.platform.LocalDensity provides
                androidx.compose.ui.unit.Density(density.density, max),
            content = content,
        )
    }
}
