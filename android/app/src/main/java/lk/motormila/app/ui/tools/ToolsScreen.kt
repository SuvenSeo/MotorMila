package lk.motormila.app.ui.tools

import lk.motormila.app.ui.theme.mmTappable
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.ElectricCar
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PriceCheck
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import lk.motormila.app.R
import lk.motormila.app.ui.components.MmCard
import lk.motormila.app.ui.components.MmTopBar
import lk.motormila.app.ui.components.rememberMmTopBarScrollBehavior
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType

/** One entry on the Tools tab. */
data class ToolEntry(
    val icon: ImageVector,
    val title: String,
    val subtitle: String?,
    val onClick: () -> Unit,
)

/**
 * Tools tab: a calm, grouped index of every utility destination that used to
 * be scattered across Home/Profile (valuation, plate scan, compare, cost
 * calculators, permits, documents, EV, alerts, account). Pure navigation —
 * no data of its own.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ToolsScreen(
    onValuation: () -> Unit,
    onScan: () -> Unit,
    onCompare: () -> Unit,
    onCalculator: () -> Unit,
    onPermits: () -> Unit,
    onDocs: () -> Unit,
    onEvHub: () -> Unit,
    onAlerts: () -> Unit,
    onAccount: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    val groups = listOf(
        stringResource(R.string.mm_tools_section_price) to listOf(
            ToolEntry(Icons.Outlined.PriceCheck, stringResource(R.string.mm_tools_valuation), stringResource(R.string.mm_tools_valuation_sub), onValuation),
            ToolEntry(Icons.Outlined.CameraAlt, stringResource(R.string.mm_tools_scan), stringResource(R.string.mm_tools_scan_sub), onScan),
            ToolEntry(Icons.AutoMirrored.Filled.CompareArrows, stringResource(R.string.mm_tools_compare), stringResource(R.string.mm_tools_compare_sub), onCompare),
            ToolEntry(Icons.Outlined.NotificationsActive, stringResource(R.string.mm_tools_alerts), stringResource(R.string.mm_tools_alerts_sub), onAlerts),
        ),
        stringResource(R.string.mm_tools_section_cost) to listOf(
            ToolEntry(Icons.Outlined.Calculate, stringResource(R.string.mm_tools_calculator), stringResource(R.string.mm_tools_calculator_sub), onCalculator),
            ToolEntry(Icons.Outlined.VerifiedUser, stringResource(R.string.mm_tools_permits), stringResource(R.string.mm_tools_permits_sub), onPermits),
            ToolEntry(Icons.Outlined.Description, stringResource(R.string.mm_tools_docs), stringResource(R.string.mm_tools_docs_sub), onDocs),
        ),
        stringResource(R.string.mm_tools_section_more) to listOf(
            ToolEntry(Icons.Outlined.ElectricCar, stringResource(R.string.mm_tools_ev), stringResource(R.string.mm_tools_ev_sub), onEvHub),
            ToolEntry(Icons.Outlined.Person, stringResource(R.string.mm_tools_account), stringResource(R.string.mm_tools_account_sub), onAccount),
        ),
    )
    lk.motormila.app.ui.common.MmScreen(
        title = stringResource(R.string.mm_tools_title),
        showBack = false,
        edgeToEdge = true,
        modifier = modifier,
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = lk.motormila.app.ui.common.mmScreenPadding(horizontal = MmSpacing.gutter, bottom = MmSpacing.lg),
            verticalArrangement = Arrangement.spacedBy(MmSpacing.xxl),
        ) {
            item {
                Text(
                    stringResource(R.string.mm_tools_subtitle),
                    style = MmType.current.bodyM,
                    color = c.textSecondary,
                )
            }
            groups.forEach { (header, entries) ->
                item(key = header) {
                    Column {
                        Text(
                            header.uppercase(),
                            style = MmType.current.overline,
                            color = c.textTertiary,
                            modifier = Modifier.padding(start = 4.dp, bottom = MmSpacing.sm),
                        )
                        ToolGroup(entries)
                    }
                }
            }
        }
    }
}

@Composable
fun ToolGroup(entries: List<ToolEntry>) {
    val c = MmColors.current
    MmCard(contentPadding = PaddingValues(0.dp)) {
        entries.forEachIndexed { index, entry ->
            ToolRow(entry)
            if (index < entries.lastIndex) {
                HorizontalDivider(
                    color = c.outline,
                    thickness = 1.dp,
                    modifier = Modifier.padding(start = 64.dp),
                )
            }
        }
    }
}

@Composable
private fun ToolRow(entry: ToolEntry) {
    val c = MmColors.current
    Row(
        modifier = Modifier
            .mmTappable(role = Role.Button, shape = MmShapes.md, onClick = entry.onClick)
            .fillMaxWidth()
            .clip(MmShapes.md)
            .padding(horizontal = MmSpacing.lg, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(34.dp)
                .clip(MmShapes.sm)
                .background(c.brandContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(entry.icon, null, tint = c.onBrandContainer, modifier = Modifier.size(19.dp))
        }
        Spacer(Modifier.size(MmSpacing.md + 2.dp))
        Column(Modifier.weight(1f)) {
            Text(entry.title, style = MmType.current.titleS.copy(fontSize = MmType.current.bodyL.fontSize), color = c.textPrimary)
            if (entry.subtitle != null) {
                Spacer(Modifier.height(2.dp))
                Text(entry.subtitle, style = MmType.current.bodyS, color = c.textSecondary)
            }
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = c.textTertiary, modifier = Modifier.size(20.dp))
    }
}
