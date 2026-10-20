package lk.motormila.app.ui.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import lk.motormila.app.R
import lk.motormila.app.core.format.formatLkr
import lk.motormila.app.core.format.formatPct
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.domain.repository.InsightsRepository
import lk.motormila.app.domain.repository.StatsRepository

/**
 * Deal-of-the-day widget (RemoteViews — no Glance dep).
 *
 * - [DealWidgetWorker] refreshes [DealWidgetState] every 6h into DataStore from
 *   `StatsRepository.priceDrops` (daily best deals) + index MoM, then pushes to
 *   all [DealWidgetProvider] instances via AppWidgetManager.
 * - [DealWidgetProvider] renders RemoteViews (`res/layout/widget_deal`); tap →
 *   `motormila://listing/{id}` deep link (falls back to launcher when no deal).
 * - [DealWidgetContent] is the Compose mirror for @Preview / design review.
 */
internal val Context.widgetStore by preferencesDataStore("deal_widget")

internal val IndexKey = stringPreferencesKey("index_label")
internal val MomKey = stringPreferencesKey("mom_label")
internal val DealTitleKey = stringPreferencesKey("deal_title")
internal val DealPriceKey = longPreferencesKey("deal_price_lkr")
internal val DealListingIdKey = intPreferencesKey("deal_listing_id")

data class DealWidgetState(
    val indexLabel: String = "Index —",
    val momLabel: String = "",
    val dealTitle: String = "Deal of the day",
    val dealPriceLkr: Long? = null,
    val listingId: Int? = null,
)

fun observeDealWidget(context: Context): Flow<DealWidgetState> =
    context.widgetStore.data.map { prefs ->
        DealWidgetState(
            indexLabel = prefs[IndexKey] ?: "Index —",
            momLabel = prefs[MomKey].orEmpty(),
            dealTitle = prefs[DealTitleKey] ?: "Deal of the day",
            dealPriceLkr = prefs[DealPriceKey],
            listingId = prefs[DealListingIdKey],
        )
    }

/** Provider-safe accessor (widgetStore is internal to this file). */
internal fun Context.widgetStorePublic() = widgetStore

internal fun androidx.datastore.preferences.core.Preferences.toWidgetState() = DealWidgetState(
    indexLabel = this[IndexKey] ?: "Index —",
    momLabel = this[MomKey].orEmpty(),
    dealTitle = this[DealTitleKey] ?: "Deal of the day",
    dealPriceLkr = this[DealPriceKey],
    listingId = this[DealListingIdKey],
)

@EntryPoint
@InstallIn(SingletonComponent::class)
interface DealWidgetEntryPoint {
    fun insightsRepository(): InsightsRepository
    fun statsRepository(): StatsRepository
}

class DealWidgetWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return runCatching {
            val entry = EntryPointAccessors.fromApplication(
                applicationContext,
                DealWidgetEntryPoint::class.java,
            )
            // Daily best deal = biggest % drop in the last 7 days (StatsRepository).
            val best = runCatching { entry.statsRepository().priceDrops(days = 7, limit = 5) }
                .getOrDefault(emptyList())
                .maxByOrNull { it.dropPct }
            val indexLast = runCatching { entry.insightsRepository().index() }
                .getOrNull()?.points?.lastOrNull()
            applicationContext.widgetStore.edit { prefs ->
                prefs[IndexKey] = indexLast?.let { "Index %.1f".format(it.indexValue) } ?: "Index —"
                prefs[MomKey] = indexLast?.let {
                    val mom = it.momChangePct ?: 0.0
                    "${if (mom >= 0) "+" else ""}${formatPct(mom)} MoM"
                }.orEmpty()
                if (best != null) {
                    val l = best.listing
                    prefs[DealTitleKey] =
                        "${l.displayName.ifBlank { l.title }} · ${formatPct(-best.dropPct)} · ${l.district.orEmpty()}".trim()
                    prefs[DealPriceKey] = best.newPriceLkr.toLong()
                    prefs[DealListingIdKey] = l.id
                } else {
                    prefs[DealTitleKey] = "Deal of the day"
                    prefs.remove(DealPriceKey)
                    prefs.remove(DealListingIdKey)
                }
            }
            // Push to all widget instances.
            val state = applicationContext.widgetStore.data.first().let { prefs ->
                DealWidgetState(
                    indexLabel = prefs[IndexKey] ?: "Index —",
                    momLabel = prefs[MomKey].orEmpty(),
                    dealTitle = prefs[DealTitleKey] ?: "Deal of the day",
                    dealPriceLkr = prefs[DealPriceKey],
                    listingId = prefs[DealListingIdKey],
                )
            }
            DealWidgetProvider.updateAll(applicationContext, state)
            Result.success()
        }.getOrElse {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    companion object {
        const val UNIQUE_NAME = "deal_widget_refresh"
        const val UNIQUE_ONCE = "deal_widget_refresh_once"
    }
}

fun enqueueDealWidgetRefresh(context: Context) {
    val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()
    val wm = WorkManager.getInstance(context)
    val periodic = PeriodicWorkRequestBuilder<DealWidgetWorker>(6, TimeUnit.HOURS)
        .setConstraints(constraints)
        .addTag(DealWidgetWorker.UNIQUE_NAME)
        .build()
    wm.enqueueUniquePeriodicWork(
        DealWidgetWorker.UNIQUE_NAME,
        ExistingPeriodicWorkPolicy.KEEP,
        periodic,
    )
    val once = OneTimeWorkRequestBuilder<DealWidgetWorker>()
        .setConstraints(constraints)
        .addTag(DealWidgetWorker.UNIQUE_NAME)
        .build()
    wm.enqueueUniqueWork(
        DealWidgetWorker.UNIQUE_ONCE,
        ExistingWorkPolicy.KEEP,
        once,
    )
}

/** Deep-link PendingIntent for widget/notification taps → motormila://listing/{id}. */
fun listingDeepLinkIntent(context: Context, listingId: Int?, requestCode: Int = 0): PendingIntent {
    val intent = if (listingId != null) {
        Intent(Intent.ACTION_VIEW, Uri.parse("motormila://listing/$listingId")).apply {
            `package` = context.packageName
        }
    } else {
        context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent(context, Class.forName("lk.motormila.app.MainActivity"))
    }
    return PendingIntent.getActivity(
        context, requestCode, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}

/** Render [state] into RemoteViews for one widget instance. */
fun dealRemoteViews(context: Context, state: DealWidgetState): RemoteViews =
    RemoteViews(context.packageName, R.layout.widget_deal).apply {
        setTextViewText(R.id.widget_index, state.indexLabel)
        setTextViewText(R.id.widget_mom, state.momLabel)
        setTextViewText(R.id.widget_deal_title, state.dealTitle)
        setTextViewText(
            R.id.widget_deal_price,
            state.dealPriceLkr?.let { lk.motormila.app.ui.common.mn(it) }.orEmpty(),
        )
        setOnClickPendingIntent(
            R.id.widget_deal_title,
            listingDeepLinkIntent(context, state.listingId, requestCode = state.listingId ?: 0),
        )
    }

@Composable
fun DealWidgetContent(state: DealWidgetState, modifier: Modifier = Modifier) {
    MotormilaSurface(
        modifier = modifier.semantics {
            contentDescription = "Motormila ${state.indexLabel} ${state.momLabel}, ${state.dealTitle}"
        },
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(state.indexLabel, style = MaterialTheme.typography.titleSmall)
            Text(state.momLabel, style = MaterialTheme.typography.labelMedium)
        }
        Text(state.dealTitle, style = MaterialTheme.typography.bodyMedium, maxLines = 2)
        state.dealPriceLkr?.let {
            Text(lk.motormila.app.ui.common.mn(it), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun DealWidgetPreview() {
    DealWidgetContent(
        DealWidgetState(
            indexLabel = "Index 142.6",
            momLabel = "+1.2% MoM",
            dealTitle = "Axio 2017 · 6.8% under FMV · Colombo",
            dealPriceLkr = 7_850_000,
        ),
    )
}
