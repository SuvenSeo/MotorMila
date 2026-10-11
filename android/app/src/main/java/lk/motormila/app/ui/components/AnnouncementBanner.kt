package lk.motormila.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import lk.motormila.app.R
import lk.motormila.app.data.local.datastore.SettingsStore
import lk.motormila.app.ui.theme.MotormilaBg
import lk.motormila.app.ui.theme.MotormilaGood
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaPrimary

@HiltViewModel
class AnnouncementBannerViewModel @Inject constructor(
    private val settings: SettingsStore,
) : ViewModel() {
    val dismissed: StateFlow<Boolean> = settings.observe()
        .map { it.announcementDismissed }
        .stateIn(viewModelScope, SharingStarted.Eagerly, false)

    fun dismiss() {
        viewModelScope.launch { settings.setAnnouncementDismissed(true) }
    }
}

/**
 * Dismissible market-update strip at the top of Home — web `AnnouncementBanner`
 * parity (HyperUI announcement pattern, Apex M tokens, deliberate dark strip).
 * Dismissal persists in SettingsStore.
 */
@Composable
fun AnnouncementBanner(
    onViewDeals: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AnnouncementBannerViewModel = hiltViewModel(),
) {
    val dismissed by viewModel.dismissed.collectAsStateWithLifecycle()
    if (dismissed) return

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(MotormilaBg)
            .padding(horizontal = 20.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(MotormilaGood.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.TrendingDown,
                contentDescription = null,
                tint = MotormilaGood,
                modifier = Modifier.size(16.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Text(
            text = stringResource(R.string.announcement_text),
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = Color.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(8.dp))
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(MotormilaPrimary)
                .clickable(onClick = onViewDeals)
                .padding(horizontal = 14.dp, vertical = 6.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.announcement_view_deals),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
            )
        }
        IconButton(
            onClick = viewModel::dismiss,
            modifier = Modifier.size(32.dp),
        ) {
            Icon(
                Icons.Filled.Close,
                contentDescription = stringResource(R.string.announcement_dismiss),
                tint = MotormilaOnSurface.copy(alpha = 0.7f),
                modifier = Modifier.size(16.dp),
            )
        }
    }
}
