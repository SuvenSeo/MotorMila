package lk.motormila.app.ui.share

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.text.TextPaint
import android.text.TextUtils
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.net.toUri
import java.io.File
import java.io.FileOutputStream
import lk.motormila.app.R
import lk.motormila.app.core.price.PriceVerdict
import lk.motormila.app.core.price.VerdictBand
import lk.motormila.app.domain.model.Listing

/**
 * Renders an FMV share card (bitmap + listing URL) and launches ACTION_SEND.
 *
 * FileProvider is owned by the foundation/manifest agent. Paste this under
 * `<application>` in AndroidManifest.xml:
 *
 * ```xml
 * <provider
 *     android:name="androidx.core.content.FileProvider"
 *     android:authorities="${applicationId}.fileprovider"
 *     android:exported="false"
 *     android:grantUriPermissions="true">
 *     <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths" />
 * </provider>
 * ```
 *
 * Authority at runtime is `${context.packageName}.fileprovider` so debug
 * (`applicationIdSuffix`) still matches. Paths: [cacheDir]/share via
 * `res/xml/file_paths.xml`.
 */
object FmvShare {

    const val CARD_WIDTH = 1080
    const val CARD_HEIGHT = 600
    const val WHATSAPP_PACKAGE = "com.whatsapp"
    const val WHATSAPP_BUSINESS_PACKAGE = "com.whatsapp.w4b"

    fun share(context: Context, listing: Listing, verdict: PriceVerdict?) {
        val text = listingShareText(listing)
        val sent = runCatching {
            val file = writeSharePng(context, listing, verdict)
            startImageShare(context, file, text, packageName = null)
        }.isSuccess
        if (!sent) shareTextOnly(context, text)
    }

    fun shareWhatsApp(context: Context, listing: Listing, verdict: PriceVerdict?) {
        val text = listingShareText(listing)
        val png = runCatching { writeSharePng(context, listing, verdict) }.getOrNull()
        if (png != null) {
            val imageSent = listOf(WHATSAPP_PACKAGE, WHATSAPP_BUSINESS_PACKAGE).any { pkg ->
                runCatching { startImageShare(context, png, text, packageName = pkg) }.isSuccess
            }
            if (imageSent) return
        }
        try {
            val waMe = "https://wa.me/?text=${Uri.encode(text)}".toUri()
            context.startActivity(Intent(Intent.ACTION_VIEW, waMe))
        } catch (_: Exception) {
            share(context, listing, verdict)
        }
    }

    fun listingShareUrl(listingId: Int): String =
        "https://motormila.pages.dev/listing/$listingId"

    fun listingShareText(listing: Listing): String =
        "${listing.displayName} — ${lk.motormila.app.ui.common.mn(listing.priceLkr)} (Motormila: ${listingShareUrl(listing.id)})"

    private fun startImageShare(
        context: Context,
        file: File,
        text: String,
        packageName: String?,
    ) {
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file,
        )
        if (packageName != null) {
            context.grantUriPermission(packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_TEXT, text)
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            clipData = ClipData.newUri(context.contentResolver, "share", uri)
            if (packageName != null) {
                `package` = packageName
            }
        }
        if (packageName != null) {
            context.startActivity(send)
        } else {
            val chooser = Intent.createChooser(send, context.getString(R.string.share_listing_chooser))
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            context.startActivity(chooser)
        }
    }

    private fun shareTextOnly(context: Context, text: String) {
        try {
            context.startActivity(
                Intent.createChooser(
                    Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, text)
                    },
                    context.getString(R.string.share_listing_chooser),
                ),
            )
        } catch (_: Exception) {
        }
    }

    private fun writeSharePng(context: Context, listing: Listing, verdict: PriceVerdict?): File {
        val bitmap = renderShareCard(context, listing, verdict)
        val dir = File(context.cacheDir, "share").apply { mkdirs() }
        val file = File(dir, "listing-${listing.id}.png")
        FileOutputStream(file).use { out ->
            check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
                "PNG compress failed"
            }
        }
        bitmap.recycle()
        return file
    }

    private fun renderShareCard(context: Context, listing: Listing, verdict: PriceVerdict?): Bitmap {
        val brandBlue = ContextCompat.getColor(context, R.color.motormila_gold) // remapped to Motormila Blue #0A7AFF (gold purge)
        val bg = ContextCompat.getColor(context, R.color.motormila_bg)
        val bitmap = Bitmap.createBitmap(CARD_WIDTH, CARD_HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(bg)

        val accent = paint(brandBlue)
        canvas.drawRect(0f, 0f, CARD_WIDTH.toFloat(), 14f, accent)

        val pad = 56f
        var y = 92f
        canvas.drawText(
            context.getString(R.string.share_card_brand),
            pad,
            y,
            textPaint(brandBlue, 28f, bold = true),
        )
        y += 72f

        val namePaint = textPaint(Color.WHITE, 48f, bold = true)
        drawEllipsized(canvas, listing.displayName, pad, y, namePaint, CARD_WIDTH - pad * 2)
        y += 42f

        val meta = listOfNotNull(listing.year?.toString(), listing.district)
            .joinToString(" · ")
        if (meta.isNotBlank()) {
            canvas.drawText(meta, pad, y, textPaint(0xFF8E8E93.toInt(), 28f, bold = false))
            y += 58f
        } else {
            y += 28f
        }

        canvas.drawText(lk.motormila.app.ui.common.mn(listing.priceLkr), pad, y, textPaint(brandBlue, 72f, bold = true))
        y += 68f

        // Same verdict as the detail screen: typical price + band only when it
        // stands; a withheld verdict shares the price alone (never a fake call).
        val ok = verdict as? PriceVerdict.Ok
        if (ok != null) {
            canvas.drawText(
                context.getString(R.string.share_card_typical, lk.motormila.app.ui.common.mn(ok.referenceLkr)),
                pad,
                y,
                textPaint(Color.WHITE, 32f, bold = false),
            )
            y += 52f
            drawBandPill(canvas, pad, y - 28f, verdictCaption(context, ok), verdictColor(ok))
        }

        val footer = textPaint(0xFF8E8E93.toInt(), 26f, bold = false).apply {
            textAlign = Paint.Align.RIGHT
        }
        canvas.drawText(
            context.getString(R.string.share_card_footer),
            CARD_WIDTH - pad,
            CARD_HEIGHT - 40f,
            footer,
        )
        return bitmap
    }

    private fun verdictCaption(context: Context, v: PriceVerdict.Ok): String = when {
        v.verifyFirst -> context.getString(R.string.mm_deal_verify)
        v.band == VerdictBand.BELOW -> context.getString(R.string.mm_verdict_below, v.pct)
        v.band == VerdictBand.ABOVE -> context.getString(R.string.mm_verdict_above, v.pct)
        else -> context.getString(R.string.mm_deal_near_typical)
    }

    private fun verdictColor(v: PriceVerdict.Ok): Int = when {
        v.verifyFirst -> 0xFFF59F0A.toInt()
        v.band == VerdictBand.BELOW -> 0xFF00C853.toInt()
        v.band == VerdictBand.ABOVE -> 0xFFEF4444.toInt()
        else -> 0xFF0A7AFF.toInt()
    }

    private fun drawBandPill(canvas: Canvas, x: Float, y: Float, text: String, color: Int) {
        val label = textPaint(color, 28f, bold = true)
        val width = label.measureText(text)
        val height = 44f
        val padH = 18f
        val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = Color.argb(48, Color.red(color), Color.green(color), Color.blue(color))
        }
        val rect = RectF(x, y, x + width + padH * 2, y + height)
        canvas.drawRoundRect(rect, 22f, 22f, bg)
        canvas.drawText(text, x + padH, y + height - 12f, label)
    }

    private fun drawEllipsized(
        canvas: Canvas,
        text: String,
        x: Float,
        y: Float,
        paint: Paint,
        maxWidth: Float,
    ) {
        val shown = TextUtils.ellipsize(
            text,
            TextPaint(paint),
            maxWidth,
            TextUtils.TruncateAt.END,
        )
        canvas.drawText(shown.toString(), x, y, paint)
    }

    private fun paint(color: Int): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }

    private fun textPaint(color: Int, size: Float, bold: Boolean): Paint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            textSize = size
            typeface = Typeface.create(Typeface.SANS_SERIF, if (bold) Typeface.BOLD else Typeface.NORMAL)
            isSubpixelText = true
        }
}
