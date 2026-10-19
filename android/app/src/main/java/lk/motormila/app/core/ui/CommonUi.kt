package lk.motormila.app.core.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface

/** Standard 48dp-minimum primary action. */
@Composable
fun PrimaryAction(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    MotormilaPrimaryButton(
        label = label,
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        loading = loading,
    )
}

/** Full-screen error state with retry. */
@Composable
fun ErrorRetry(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp)
            .semantics { contentDescription = "Error: $message" },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.error,
        )
        Spacer(Modifier.height(16.dp))
        MotormilaPrimaryButton(
            label = "Retry",
            onClick = onRetry,
            fillMaxWidth = false,
        )
    }
}

/** Static (reduced-motion-safe) skeleton rows for loading lists. */
@Composable
fun SkeletonList(
    rows: Int = 5,
    modifier: Modifier = Modifier,
) {
    rememberReducedMotion()
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
            .semantics { contentDescription = "Loading content" },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(rows) {
            MotormilaSurface(contentPadding = PaddingValues(0.dp)) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(84.dp),
                )
            }
        }
    }
}

/** Section header used across secondary screens. */
@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = modifier.padding(vertical = 8.dp),
    )
}

/**
 * Health ring: % under FMV. progress 0..1, deal green when >= 10% under.
 */
@Composable
fun HealthRing(
    fractionUnderFmv: Float,
    modifier: Modifier = Modifier,
    sizeDp: Int = 44,
) {
    val clamped = fractionUnderFmv.coerceIn(0f, 1f)
    val ring = if (clamped >= 0.10f) Color(0xFF00C853) else MaterialTheme.colorScheme.primary
    Canvas(
        modifier
            .then(modifier)
            .height(sizeDp.dp)
            .fillMaxWidth()
            .semantics { contentDescription = "Health ${(clamped * 100).toInt()} percent under fair value" },
    ) {
            val stroke = 6.dp.toPx()
            drawArc(
                color = ring.copy(alpha = 0.25f),
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                style = Stroke(stroke, cap = StrokeCap.Round),
            )
            drawArc(
                color = ring,
                startAngle = -90f,
                sweepAngle = 360f * clamped.coerceAtMost(1f),
                useCenter = false,
                style = Stroke(stroke, cap = StrokeCap.Round),
            )
        }
    }

/** Simple steering-wheel empty graphic (Canvas-drawn, no asset dep). */
@Composable
fun SteeringWheelGraphic(modifier: Modifier = Modifier) {
    Canvas(
        modifier
            .height(120.dp)
            .fillMaxWidth()
            .semantics { contentDescription = "Empty steering wheel illustration" },
    ) {
        val c = Offset(size.width / 2, size.height / 2)
        val r = size.minDimension / 2.4f
        drawCircle(
            color = Color.Gray.copy(alpha = 0.5f),
            radius = r,
            center = c,
            style = Stroke(width = 14f),
        )
        drawCircle(color = Color.Gray.copy(alpha = 0.5f), radius = r / 4.5f, center = c)
        for (angle in listOf(90f, 210f, 330f)) {
            val rad = Math.toRadians(angle.toDouble())
            drawLine(
                color = Color.Gray.copy(alpha = 0.5f),
                start = c,
                end = Offset(
                    c.x + (r * Math.cos(rad)).toFloat(),
                    c.y + (r * Math.sin(rad)).toFloat(),
                ),
                strokeWidth = 12f,
                cap = StrokeCap.Round,
            )
        }
    }
}
