package lk.motormila.app.ui.share

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import lk.motormila.app.R
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.core.ui.PrimaryAction
import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.ui.components.MotormilaSurface

/**
 * Entry for shared marketplace URLs (ACTION_SEND trampoline → MainActivity →
 * ShareImport route). Resolves the URL via [parseSharedUrl] and forwards
 * exactly once to search / compare / valuation; unsupported hosts stay on an
 * error state with a Browse fallback. All copy via `R.string.share_*`.
 */
@Composable
fun ShareImportScreen(
    sharedUrl: String?,
    onSearch: (ListingQuery) -> Unit,
    onCompare: (ids: List<Int>) -> Unit,
    onValuation: (make: String, model: String, year: Int?) -> Unit,
    onBrowse: () -> Unit,
) {
    val target = remember(sharedUrl) { parseSharedUrl(sharedUrl) }
    // Hoisted: stringResource is @Composable and cannot run inside Modifier.semantics {}.
    val resolvingDesc = stringResource(R.string.share_resolving)

    LaunchedEffect(target) {
        when (target) {
            is ShareTarget.Search -> onSearch(target.query)
            is ShareTarget.Compare -> onCompare(target.ids)
            is ShareTarget.Valuation -> onValuation(target.make, target.model, target.year)
            is ShareTarget.Unsupported -> Unit // stay: error state below
        }
    }

    lk.motormila.app.ui.common.MmScreen(title = stringResource(R.string.share_title)) {
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            when (target) {
                is ShareTarget.Unsupported -> EmptyState(
                    title = stringResource(R.string.share_unsupported_title),
                    body = stringResource(R.string.share_unsupported_body, (sharedUrl ?: "").take(80)),
                    ctaLabel = stringResource(R.string.share_browse),
                    onCta = onBrowse,
                )
                else -> MotormilaSurface(
                    modifier = Modifier.semantics { contentDescription = resolvingDesc },
                    contentPadding = PaddingValues(24.dp),
                ) {
                    Text(stringResource(R.string.share_taking_you), style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        (sharedUrl ?: "").take(120),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(16.dp))
                    // Manual fallback if auto-nav was swallowed.
                    when (target) {
                        is ShareTarget.Search -> PrimaryAction(stringResource(R.string.share_open_search), onClick = { onSearch(target.query) })
                        is ShareTarget.Compare -> PrimaryAction(stringResource(R.string.share_open_compare), onClick = { onCompare(target.ids) })
                        is ShareTarget.Valuation -> PrimaryAction(stringResource(R.string.share_open_valuation), onClick = {
                            onValuation(target.make, target.model, target.year)
                        })
                        else -> Unit
                    }
                }
            }
        }
    }
}
