package lk.motormila.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Motormila radius scale — the single source of truth for corner rounding.
 *
 * The app's visual language is a continuous, soft "squircle" family: nothing is
 * squared, and the biggest surfaces are the roundest. Keep new work on these
 * steps instead of inventing radii, so every screen reads as one product.
 *
 * | Step | Radius | Used by |
 * |---|---|---|
 * | [MotormilaRadius.xs] | 12 dp | inner chips, mini bars, avatars-in-tile |
 * | [MotormilaRadius.sm] | 16 dp | nested tiles, inputs, small list rows |
 * | [MotormilaRadius.md] | 20 dp | compact cards, snackbars |
 * | [MotormilaRadius.lg] | 24 dp | **standard card / glass surface** |
 * | [MotormilaRadius.xl] | 32 dp | sheets, dialogs, hero surfaces |
 * | [MotormilaRadius.pill] | 50 % | buttons, chips, nav dock, badges |
 */
object MotormilaRadius {
    val xs = RoundedCornerShape(12.dp)
    val sm = RoundedCornerShape(16.dp)
    val md = RoundedCornerShape(20.dp)
    val lg = RoundedCornerShape(24.dp)
    val xl = RoundedCornerShape(32.dp)

    /** Fully-round capsule. Prefer this over arbitrary large dp values. */
    val pill = RoundedCornerShape(percent = 50)
}

/**
 * M3 component shape tokens mapped onto the real Motormila scale. Material uses
 * these for its own components (chips, text fields, menus, sheets), so the
 * mapping has to agree with hand-authored surfaces — otherwise M3 widgets look
 * inconsistently tighter than the cards around them.
 */
val MotormilaShapes = Shapes(
    extraSmall = MotormilaRadius.xs,   // chips, small tags
    small = MotormilaRadius.sm,        // inputs, compact containers
    medium = MotormilaRadius.md,       // menus, snackbars, small cards
    large = MotormilaRadius.lg,        // standard cards / glass surfaces
    extraLarge = MotormilaRadius.xl,   // sheets, dialogs, hero surfaces
)

