package lk.motormila.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.sp
import lk.motormila.app.R

/**
 * Bundled brand faces (SIL OFL 1.1, static instances cut from the Google Fonts
 * variable masters; licences in assets/licenses/).
 * - Space Grotesk 500/600/700: display, titles, prices (tabular figures).
 * - Inter 400/500/600/700: body + UI.
 * - Noto Sans Sinhala / Tamil 400/600: body face when the app language is
 *   si / ta (they also carry Latin, so mixed text stays consistent). Display
 *   text keeps Space Grotesk; Sinhala/Tamil glyphs there fall back to the
 *   system Noto fonts automatically.
 */
val SpaceGrotesk = FontFamily(
    Font(R.font.space_grotesk_medium, FontWeight.Medium),
    Font(R.font.space_grotesk_semibold, FontWeight.SemiBold),
    Font(R.font.space_grotesk_bold, FontWeight.Bold),
)

val Inter = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold),
)

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

/** Legacy alias: the app used Cal Sans before v2. Points at Space Grotesk. */
val CalSans: FontFamily = SpaceGrotesk

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
 * Type scale. Read with `MmType.current.titleL` etc. Display/title use Space
 * Grotesk with tight tracking (brand: −3.5% on display); body uses Inter.
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
        fun build(body: FontFamily = Inter, display: FontFamily = SpaceGrotesk) = MmType(
            displayL = style(display, FontWeight.Bold, 40, 44, -1.4),
            displayM = style(display, FontWeight.Bold, 32, 36, -1.0),
            titleL = style(display, FontWeight.SemiBold, 24, 30, -0.6),
            titleM = style(display, FontWeight.SemiBold, 20, 26, -0.3),
            titleS = style(body, FontWeight.SemiBold, 17, 22, -0.2),
            bodyL = style(body, FontWeight.Normal, 16, 24, -0.1),
            bodyM = style(body, FontWeight.Normal, 15, 22, -0.1),
            bodyS = style(body, FontWeight.Normal, 13, 18),
            label = style(body, FontWeight.SemiBold, 14, 18),
            labelS = style(body, FontWeight.SemiBold, 12, 16, 0.1),
            caption = style(body, FontWeight.Medium, 12, 16),
            overline = style(body, FontWeight.SemiBold, 11, 14, 0.8),
            priceL = style(display, FontWeight.Bold, 30, 34, -0.8, "tnum"),
            priceM = style(display, FontWeight.Bold, 20, 24, -0.4, "tnum"),
            priceS = style(display, FontWeight.SemiBold, 16, 20, -0.2, "tnum"),
            numeric = style(body, FontWeight.Medium, 14, 18, 0.0, "tnum"),
        )

        val Default = build()

        /** Body face for the app language (si → Noto Sinhala, ta → Noto Tamil). */
        fun forLanguage(languageTag: String?): MmType = when (languageTag?.substringBefore('-')) {
            "si" -> build(body = NotoSansSinhala)
            "ta" -> build(body = NotoSansTamil)
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
