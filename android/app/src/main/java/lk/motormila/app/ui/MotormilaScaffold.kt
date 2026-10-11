package lk.motormila.app.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.R
import lk.motormila.app.ui.chat.AIChatBottomSheet
import lk.motormila.app.ui.home.badgeFor
import lk.motormila.app.ui.theme.MotormilaGlassFill
import lk.motormila.app.ui.theme.MotormilaGlassFillStrong
import lk.motormila.app.ui.theme.MotormilaGood
import lk.motormila.app.ui.theme.MotormilaPill
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaPrimaryContainer
import lk.motormila.app.ui.theme.MotormilaPrimaryGlow
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.ReduceMotion
import lk.motormila.app.ui.theme.applePress
import lk.motormila.app.ui.theme.appleTween
import lk.motormila.app.ui.theme.fluidSpring
import lk.motormila.app.ui.theme.liquidGlass
import lk.motormila.app.ui.theme.rememberHaptics
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.ui.unit.Dp

data class BottomNavItem(
    val route: String,
    val label: String,
    val icon: ImageVector,
    val badgeKey: String? = null,
)

@Composable
fun motormilaNavItems(): List<BottomNavItem> = listOf(
    BottomNavItem("home", stringResource(R.string.nav_home), Icons.Filled.Home),
    BottomNavItem("search", stringResource(R.string.nav_search), Icons.Filled.Search),
    BottomNavItem("watchlist", stringResource(R.string.nav_watchlist), Icons.Filled.Favorite, badgeKey = "watchlist"),
    BottomNavItem("insights", stringResource(R.string.nav_insights), Icons.Filled.AutoAwesome),
    BottomNavItem("profile", stringResource(R.string.nav_profile), Icons.Filled.Person, badgeKey = "inbox"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MotormilaScaffold(
    selected: String,
    showBottomBar: Boolean = true,
    badges: Map<String, Int> = emptyMap(),
    onNavigate: (route: String) -> Unit,
    onScan: () -> Unit,
    onOpenListing: ((Int) -> Unit)? = null,
    content: @Composable (PaddingValues) -> Unit,
) {
    var showAIChat by rememberSaveable { mutableStateOf(false) }
    // Fully-rounded capsule dock (50% corners) — reads as one smooth pill,
    // matching the liquid-glass FAB stack and the app's rounded design language.
    val dockShape = MotormilaPill
    val haptics = rememberHaptics()
    val reduceMotion = ReduceMotion.current

    Scaffold(
        containerColor = Color.Transparent,
        bottomBar = {
            if (showBottomBar) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(start = 20.dp, end = 20.dp, bottom = 14.dp),
                ) {
                    // Custom tab row (NOT NavigationBarItem): the M3 active
                    // indicator is a fixed rounded-rectangle that clashed with
                    // the dock's capsule language. Every tab owns a fully-round
                    // MotormilaPill wash that fades/springs in when selected.
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(dockShape)
                            .liquidGlass(
                                dockShape,
                                fill = MotormilaGlassFillStrong,
                                border = MotormilaPrimaryGlow,
                                specular = true,
                            )
                            .padding(horizontal = 6.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        motormilaNavItems().forEach { item ->
                            val isSelected = selected == item.route
                            val count = item.badgeKey?.let { badgeFor(it, badges) }
                            val interaction = remember(item.route) { MutableInteractionSource() }

                            val iconScale by animateFloatAsState(
                                targetValue = if (isSelected) 1.1f else 1.0f,
                                animationSpec = fluidSpring(),
                                label = "nav-icon-scale",
                            )
                            val iconLift by animateDpAsState(
                                targetValue = if (isSelected) (-1).dp else 0.dp,
                                animationSpec = fluidSpring(),
                                label = "nav-icon-lift",
                            )
                            val tint by animateColorAsState(
                                targetValue = if (isSelected) MotormilaPrimaryBright else MotormilaSecondaryText,
                                animationSpec = appleTween(220),
                                label = "nav-tint",
                            )
                            val pillWash by animateColorAsState(
                                targetValue = if (isSelected) MotormilaPrimaryContainer else Color.Transparent,
                                animationSpec = appleTween(220),
                                label = "nav-pill",
                            )
                            val pillScale by animateFloatAsState(
                                targetValue = if (isSelected) 1f else 0.85f,
                                animationSpec = fluidSpring(),
                                label = "nav-pill-scale",
                            )
                            val liftPx = with(LocalDensity.current) { iconLift.toPx() }

                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(MotormilaPill)
                                    .applePress(interaction, pressedScale = 0.92f)
                                    .clickable(
                                        interactionSource = interaction,
                                        indication = null,
                                        role = Role.Tab,
                                        onClick = {
                                            if (!reduceMotion) haptics.tick()
                                            onNavigate(item.route)
                                        },
                                    )
                                    .semantics {
                                        contentDescription = item.label
                                        // Qualified: the scaffold's own `selected`
                                        // route param shadows the accessor.
                                        this.selected = isSelected
                                    }
                                    .padding(vertical = 2.dp),
                            ) {
                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier
                                        .graphicsLayer {
                                            scaleX = pillScale
                                            scaleY = pillScale
                                        }
                                        .clip(MotormilaPill)
                                        .background(pillWash)
                                        .padding(horizontal = 14.dp, vertical = 4.dp),
                                ) {
                                    Box(
                                        modifier = Modifier.graphicsLayer {
                                            scaleX = iconScale
                                            scaleY = iconScale
                                            translationY = liftPx
                                        },
                                    ) {
                                        val iconSlot: @Composable () -> Unit = {
                                            Icon(item.icon, contentDescription = null, tint = tint)
                                        }
                                        if (count != null && count > 0) {
                                            BadgedBox(
                                                badge = {
                                                    Badge(
                                                        containerColor = MotormilaGood,
                                                        contentColor = Color.Black,
                                                        modifier = Modifier.semantics {
                                                            contentDescription = "$count new"
                                                        },
                                                    ) {
                                                        Text(
                                                            text = if (count > 99) "99+" else count.toString(),
                                                            fontWeight = FontWeight.Bold,
                                                            fontSize = 10.sp,
                                                        )
                                                    }
                                                },
                                            ) { iconSlot() }
                                        } else {
                                            iconSlot()
                                        }
                                    }
                                }
                                Text(
                                    text = item.label,
                                    color = tint,
                                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                                    fontSize = 11.sp,
                                )
                            }
                        }
                    }
                }
            }
        },
        floatingActionButton = {
            if (showBottomBar) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier
                        .padding(end = 4.dp, bottom = 88.dp)
                        .liquidGlass(
                            MotormilaRadius.lg,
                            fill = MotormilaGlassFillStrong,
                            border = MotormilaPrimaryGlow,
                        )
                        .padding(8.dp),
                ) {
                    val aiInteraction = remember { MutableInteractionSource() }
                    FloatingActionButton(
                        onClick = { showAIChat = true },
                        containerColor = Color.Transparent,
                        contentColor = MotormilaPrimaryBright,
                        elevation = FloatingActionButtonDefaults.elevation(
                            defaultElevation = 0.dp,
                            pressedElevation = 0.dp,
                        ),
                        interactionSource = aiInteraction,
                        shape = CircleShape,
                        modifier = Modifier
                            .size(48.dp)
                            .applePress(aiInteraction, pressedScale = 0.92f)
                            .semantics { contentDescription = "Open Motormila AI Intelligence Assistant" },
                    ) {
                        Icon(
                            imageVector = Icons.Filled.AutoAwesome,
                            contentDescription = "Motormila AI Assistant",
                            tint = MotormilaPrimaryBright,
                            modifier = Modifier.size(22.dp),
                        )
                    }

                    val scanInteraction = remember { MutableInteractionSource() }
                    FloatingActionButton(
                        onClick = onScan,
                        containerColor = MotormilaPrimary,
                        contentColor = Color.White,
                        elevation = FloatingActionButtonDefaults.elevation(
                            defaultElevation = 0.dp,
                            pressedElevation = 0.dp,
                        ),
                        interactionSource = scanInteraction,
                        shape = CircleShape,
                        modifier = Modifier
                            .size(56.dp)
                            .applePress(scanInteraction, pressedScale = 0.92f)
                            .semantics { contentDescription = "Scan number plate" },
                    ) {
                        Icon(
                            imageVector = Icons.Filled.CameraAlt,
                            contentDescription = "Scan number plate",
                            tint = Color.White,
                            modifier = Modifier.size(24.dp),
                        )
                    }
                }
            }
        },
        content = { paddingValues ->
            // When the floating AI/scan button stack is visible, reserve end
            // padding so scrollable content doesn't slide underneath it.
            // Stack width: 8dp glass padding + 56dp button + 8dp glass padding,
            // plus 4dp screen margin = 76dp.
            val fabSafePadding = if (showBottomBar) {
                PaddingValues(
                    start = paddingValues.calculateStartPadding(LayoutDirection.Ltr),
                    top = paddingValues.calculateTopPadding(),
                    end = paddingValues.calculateEndPadding(LayoutDirection.Ltr) + 76.dp,
                    bottom = paddingValues.calculateBottomPadding(),
                )
            } else {
                paddingValues
            }
            content(fabSafePadding)
        },
    )

    if (showAIChat) {
        AIChatBottomSheet(
            onDismissRequest = { showAIChat = false },
            onOpenListing = { listingId ->
                showAIChat = false
                onOpenListing?.invoke(listingId) ?: onNavigate("listing/$listingId")
            },
        )
    }
}
