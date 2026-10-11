package lk.motormila.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import lk.motormila.app.core.geo.SriLankaDistricts
import lk.motormila.app.domain.model.DistrictStat
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaPrimaryGlow
import kotlin.math.hypot
import kotlin.math.sqrt

data class DistrictMapPoint(
    val district: String,
    val lat: Double,
    val lng: Double,
    val weight: Float,
)

fun DistrictStat.toMapPoint(): DistrictMapPoint {
    val (lat, lng) = SriLankaDistricts.coordFor(district, lat, lng)
    return DistrictMapPoint(
        district = district,
        lat = lat,
        lng = lng,
        weight = count.toFloat(),
    )
}

/**
 * Stylised Sri Lanka heat map. Island silhouette is a hand-tuned bezier so it
 * reads as the island at a glance; district dots are projected from real
 * coordinates and sized by listing weight.
 */
@Composable
fun SriLankaHeatMap(
    points: List<DistrictMapPoint>,
    modifier: Modifier = Modifier,
    selected: String? = null,
    onDistrictClick: (String) -> Unit = {},
) {
    val maxWeight = remember(points) { points.maxOfOrNull { it.weight }?.coerceAtLeast(1f) ?: 1f }
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(280.dp)
            .semantics { contentDescription = "Sri Lanka district heat map" }
            .pointerInput(points) {
                detectTapGestures { tap ->
                    val hit = points.minByOrNull { p ->
                        val (x, y) = SriLankaDistricts.project(p.lat, p.lng, size.width.toFloat(), size.height.toFloat())
                        hypot(tap.x - x, tap.y - y)
                    } ?: return@detectTapGestures
                    val (x, y) = SriLankaDistricts.project(hit.lat, hit.lng, size.width.toFloat(), size.height.toFloat())
                    if (hypot(tap.x - x, tap.y - y) < 48f) onDistrictClick(hit.district)
                }
            },
    ) {
        val island = islandPath(size.width, size.height)
        drawPath(island, Color(0x22161B22), style = Fill)
        drawPath(island, MotormilaPrimaryGlow, style = Stroke(width = 2.5f))

        points.forEach { point ->
            val (x, y) = SriLankaDistricts.project(point.lat, point.lng, size.width, size.height)
            val t = sqrt((point.weight / maxWeight).coerceIn(0.08f, 1f))
            val radius = 5f + t * 14f
            val isSelected = selected.equals(point.district, ignoreCase = true)
            val color = if (isSelected) Color.White else MotormilaPrimaryBright.copy(alpha = 0.35f + t * 0.65f)
            drawCircle(color = MotormilaPrimary.copy(alpha = 0.22f), radius = radius * 1.8f, center = Offset(x, y))
            drawCircle(color = color, radius = radius, center = Offset(x, y))
        }
    }
}

/**
 * Rough island outline in normalized 0..1 space, then scaled to the canvas.
 * Tuned to read as Sri Lanka without shipping a vector asset.
 */
private fun islandPath(width: Float, height: Float): Path {
    fun pt(nx: Float, ny: Float) = Offset(nx * width, ny * height)
    return Path().apply {
        moveTo(pt(0.28f, 0.08f).x, pt(0.28f, 0.08f).y)
        cubicTo(pt(0.42f, 0.00f).x, pt(0.42f, 0.00f).y, pt(0.55f, 0.04f).x, pt(0.55f, 0.04f).y, pt(0.58f, 0.16f).x, pt(0.58f, 0.16f).y)
        cubicTo(pt(0.66f, 0.22f).x, pt(0.66f, 0.22f).y, pt(0.72f, 0.32f).x, pt(0.72f, 0.32f).y, pt(0.78f, 0.42f).x, pt(0.78f, 0.42f).y)
        cubicTo(pt(0.88f, 0.55f).x, pt(0.88f, 0.55f).y, pt(0.86f, 0.68f).x, pt(0.86f, 0.68f).y, pt(0.74f, 0.80f).x, pt(0.74f, 0.80f).y)
        cubicTo(pt(0.64f, 0.90f).x, pt(0.64f, 0.90f).y, pt(0.50f, 0.96f).x, pt(0.50f, 0.96f).y, pt(0.40f, 0.92f).x, pt(0.40f, 0.92f).y)
        cubicTo(pt(0.28f, 0.88f).x, pt(0.28f, 0.88f).y, pt(0.22f, 0.74f).x, pt(0.22f, 0.74f).y, pt(0.18f, 0.58f).x, pt(0.18f, 0.58f).y)
        cubicTo(pt(0.14f, 0.42f).x, pt(0.14f, 0.42f).y, pt(0.16f, 0.24f).x, pt(0.16f, 0.24f).y, pt(0.22f, 0.14f).x, pt(0.22f, 0.14f).y)
        close()
    }
}
