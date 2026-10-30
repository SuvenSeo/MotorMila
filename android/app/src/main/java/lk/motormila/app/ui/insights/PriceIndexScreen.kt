package lk.motormila.app.ui.insights

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.core.ui.ErrorRetry
import lk.motormila.app.core.ui.SkeletonList
import lk.motormila.app.ui.theme.MmSpacing

@Composable
fun PriceIndexScreen(
    onBack: () -> Unit,
    onOpenPro: () -> Unit,
    viewModel: PriceIndexViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    lk.motormila.app.ui.common.MmScreen(title = "Price Index", onBack = onBack) {
        when {
            state.isLoading -> SkeletonList()
            state.error != null && state.index.points.isEmpty() ->
                ErrorRetry(state.error ?: "Couldn't load the price index", onRetry = viewModel::refresh)
            else -> PriceIndexPane(
                index = state.index,
                onOpenPro = onOpenPro,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = MmSpacing.gutter),
            )
        }
    }
}
