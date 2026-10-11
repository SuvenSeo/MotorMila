package lk.motormila.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.R
import lk.motormila.app.ui.theme.MotormilaGood
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurface

/**
 * Homepage "How it works" band — web `HowItWorksBand` parity, simplified for
 * Compose: three step nodes (sources → fair-value engine → alerts) joined by
 * curved beams drawn on Canvas, with dots travelling along each curve
 * (Magic UI Animated Beam feel). Blue on ink; static beams under reduced
 * motion.
 */
@Composable
fun HowItWorksBand(modifier: Modifier = Modifier) {
    val reduced = rememberReducedMotion()
    Column(modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 20.dp)) {
            Text(
                text = stringResource(R.string.how_it_works_eyebrow).uppercase(),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.5.sp,
                color = MotormilaPrimary,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = stringResource(R.string.how_it_works_title),
                style = MaterialTheme.typography.headlineMedium,
                color = MotormilaOnSurface,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = stringResource(R.string.how_it_works_blurb),
                fontSize = 13.sp,
                color = MotormilaSecondaryText,
            )
        }
        Spacer(Modifier.height(8.dp))
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .height(196.dp),
        ) {
            val density = LocalDensity.current
            val widthPx = with(density) { maxWidth.toPx() }
            val iconHalfPx = with(density) { 32.dp.toPx() }
            val centerYPx = with(density) { 40.dp.toPx() }
            val curvePx = with(density) { 34.dp.toPx() }

            val centers = listOf(widthPx / 6f, widthPx / 2f, 5f * widthPx / 6f)
            val beams = listOf(
                BeamSpec(
                    from = Offset(centers[0] + iconHalfPx, centerYPx),
                    to = Offset(centers[1] - iconHalfPx, centerYPx),
                    curve = curvePx,
                ),
                BeamSpec(
                    from = Offset(centers[1] + iconHalfPx, centerYPx),
                    to = Offset(centers[2] - iconHalfPx, centerYPx),
                    curve = curvePx,
                ),
            )

            val infinite = rememberInfiniteTransition(label = "beam")
            val progress by infinite.animateFloat(
                initialValue = 0f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(3200, easing = LinearEasing),
                ),
                label = "beam-progress",
            )

            Canvas(modifier = Modifier.fillMaxSize()) {
                beams.forEach { beam ->
                    val path = Path().apply {
                        moveTo(beam.from.x, beam.from.y)
                        quadraticBezierTo(
                            (beam.from.x + beam.to.x) / 2f,
                            (beam.from.y + beam.to.y) / 2f - beam.curve,
                            beam.to.x,
                            beam.to.y,
                        )
                    }
                    // Faint track.
                    drawPath(
                        path = path,
                        color = Color.White.copy(alpha = 0.08f),
                        style = Stroke(width = 2.dp.toPx()),
                    )
                    // Brand beam: deal green -> blue gradient.
                    drawPath(
                        path = path,
                        brush = Brush.horizontalGradient(
                            listOf(Color(0xFF00C853), Color(0xFF0A7AFF)),
                        ),
                        alpha = 0.85f,
                        style = Stroke(width = 2.dp.toPx()),
                    )
                    if (!reduced) {
                        // Travelling dots along the curve.
                        for (k in 0..1) {
                            val t = (progress + k * 0.5f) % 1f
                            val pos = quadPoint(t, beam)
                            drawCircle(
                                color = MotormilaPrimaryBright.copy(alpha = 0.25f),
                                radius = 7.dp.toPx(),
                                center = pos,
                            )
                            drawCircle(
                                color = MotormilaPrimaryBright,
                                radius = 3.dp.toPx(),
                                center = pos,
                            )
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = 8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                // Weighted slots so node centers sit exactly at W/6, W/2, 5W/6 —
                // matching the Canvas beam endpoints on every screen width.
                Box(
                    modifier = Modifier.weight(1f),
                    contentAlignment = Alignment.TopCenter,
                ) {
                    BeamNode(
                        icon = Icons.Filled.DirectionsCar,
                        iconTint = MotormilaPrimary,
                        title = stringResource(R.string.how_step1_title),
                        sub = stringResource(R.string.how_step1_sub),
                    )
                }
                Box(
                    modifier = Modifier.weight(1f),
                    contentAlignment = Alignment.TopCenter,
                ) {
                    BeamNode(
                        icon = Icons.Filled.Calculate,
                        iconTint = MotormilaPrimary,
                        title = stringResource(R.string.how_step2_title),
                        sub = stringResource(R.string.how_step2_sub),
                    )
                }
                Box(
                    modifier = Modifier.weight(1f),
                    contentAlignment = Alignment.TopCenter,
                ) {
                    BeamNode(
                        icon = Icons.Filled.Notifications,
                        iconTint = MotormilaGood,
                        title = stringResource(R.string.how_step3_title),
                        sub = stringResource(R.string.how_step3_sub),
                    )
                }
            }
        }
    }
}

private data class BeamSpec(
    val from: Offset,
    val to: Offset,
    val curve: Float,
)

private fun quadPoint(t: Float, beam: BeamSpec): Offset {
    val cx = (beam.from.x + beam.to.x) / 2f
    val cy = (beam.from.y + beam.to.y) / 2f - beam.curve
    val u = 1f - t
    return Offset(
        x = u * u * beam.from.x + 2f * u * t * cx + t * t * beam.to.x,
        y = u * u * beam.from.y + 2f * u * t * cy + t * t * beam.to.y,
    )
}

@Composable
private fun BeamNode(
    icon: ImageVector,
    iconTint: Color,
    title: String,
    sub: String,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.width(104.dp),
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(MotormilaRadius.md)
                .background(MotormilaSurface)
                .border(1.dp, MotormilaOutline, MotormilaRadius.md),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(28.dp),
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = title,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = MotormilaOnSurface,
            textAlign = TextAlign.Center,
        )
        Text(
            text = sub,
            fontSize = 11.sp,
            color = MotormilaSecondaryText,
            textAlign = TextAlign.Center,
            maxLines = 3,
        )
    }
}
