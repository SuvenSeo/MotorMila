package lk.motormila.app.ui.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.format.DateUtils
import android.widget.RemoteViews
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.doublePreferencesKey
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

// Raw values only — labels are localized at render time (dealRemoteViews), so a
// language switch never leaves English baked into the widget.
internal val IndexValueKey = doublePreferencesKey("index_value")
internal val MomPctKey = doublePreferencesKey("mom_pct")
internal val DealNameKey = stringPreferencesKey("deal_name")
internal val DealDropPctKey = doublePreferencesKey("deal_drop_pct")
internal val DealDistrictKey = stringPreferencesKey("deal_district")
internal val DealPriceKey = longPreferencesKey("deal_price_lkr")
internal val DealListingIdKey = intPreferencesKey("deal_listing_id")
/** Epoch ms of the last successful deal fetch (drives "Updated X ago"). */
internal val UpdatedAtKey = longPreferencesKey("updated_at_ms")

/** Pre-1.10 keys that stored composed English labels; dropped on the next refresh. */
private val LegacyLabelKeys = listOf(
    stringPreferencesKey("index_label"),
    stringPreferencesKey("mom_label"),
    stringPreferencesKey("deal_title"),
)

data class DealWidgetState(
    val indexValue: Double? = null,
    val momPct: Double? = null,
    /** Listing display name (data, not UI copy). Null = no deal yet. */
    val dealName: String? = null,
    val dealDropPct: Double? = null,
    val dealDistrict: String? = null,
    val dealPriceLkr: Long? = null,
    val listingId: Int? = null,
    val updatedAtMs: Long? = null,
)

fun observeDealWidget(context: Context): Flow<DealWidgetState> =
    context.widgetStore.data.map { prefs -> prefs.toWidgetState() }

/** Provider-safe accessor (widgetStore is internal to this file). */
internal fun Context.widgetStorePublic() = widgetStore

internal fun androidx.datastore.preferences.core.Preferences.toWidgetState() = DealWidgetState(
    indexValue = this[IndexValueKey],
    momPct = this[MomPctKey],
    dealName = this[DealNameKey],
    dealDropPct = this[DealDropPctKey],
    dealDistrict = this[DealDistrictKey],
    dealPriceLkr = this[DealPriceKey],
    listingId = this[DealListingIdKey],
    updatedAtMs = this[UpdatedAtKey],
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
            // Cars first (launch rule): prefer the best car drop, else any.
            // Null = the fetch failed (offline): keep the last good deal on screen.
            val drops = runCatching { entry.statsRepository().priceDrops(days = 7, limit = 20) }
                .getOrNull()
            val best = drops?.let { all ->
                all.filter { lk.motormila.app.domain.model.VehicleCategoryRules.isCarLike(it.listing) }
                    .ifEmpty { all }
                    .maxByOrNull { it.dropPct }
            }
            val indexLast = runCatching { entry.insightsRepository().index() }
                .getOrNull()?.points?.lastOrNull()
            applicationContext.widgetStore.edit { prefs ->
                LegacyLabelKeys.forEach { prefs.remove(it) }
                if (indexLast != null) {
                    prefs[IndexValueKey] = indexLast.indexValue
                    val mom = indexLast.momChangePct
                    if (mom != null) prefs[MomPctKey] = mom else prefs.remove(MomPctKey)
                }
                if (drops != null) {
                    if (best != null) {
                        val l = best.listing
                        prefs[DealNameKey] = l.displayName.ifBlank { l.title }
                        prefs[DealDropPctKey] = best.dropPct
                        val district = l.district?.takeIf { it.isNotBlank() }
                        if (district != null) prefs[DealDistrictKey] = district else prefs.remove(DealDistrictKey)
                        prefs[DealPriceKey] = best.newPriceLkr.toLong()
                        prefs[DealListingIdKey] = l.id
                    } else {
                        // A successful fetch with no drops: genuinely no deal today.
                        prefs.remove(DealNameKey)
                        prefs.remove(DealDropPctKey)
                        prefs.remove(DealDistrictKey)
                        prefs.remove(DealPriceKey)
                        prefs.remove(DealListingIdKey)
                    }
                    prefs[UpdatedAtKey] = System.currentTimeMillis()
                }
            }
            // Push to all widget instances (the last good state when the fetch failed).
            val state = applicationContext.widgetStore.data.first().toWidgetState()
            DealWidgetProvider.updateAll(applicationContext, state)
            if (drops == null && runAttemptCount < 3) Result.retry() else Result.success()
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

/** Render [state] into RemoteViews for one widget instance; all copy is localized here. */
fun dealRemoteViews(context: Context, state: DealWidgetState): RemoteViews =
    RemoteViews(context.packageName, R.layout.widget_deal).apply {
        setTextViewText(R.id.widget_index, widgetIndexLabel(context, state))
        setTextViewText(
            R.id.widget_mom,
            state.momPct?.let { context.getString(R.string.v110m_widget_mom, formatPct(it)) }.orEmpty(),
        )
        setTextViewText(R.id.widget_deal_title, widgetDealLine(context, state))
        setTextViewText(
            R.id.widget_deal_price,
            state.dealPriceLkr?.let { lk.motormila.app.ui.common.mn(it) }.orEmpty(),
        )
        setTextViewText(
            R.id.widget_updated,
            state.updatedAtMs?.let { at ->
                val ago = DateUtils.getRelativeTimeSpanString(
                    at, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS,
                )
                context.getString(R.string.v110m_widget_updated, ago)
            }.orEmpty(),
        )
        setOnClickPendingIntent(
            R.id.widget_deal_title,
            listingDeepLinkIntent(context, state.listingId, requestCode = state.listingId ?: 0),
        )
    }

private fun widgetIndexLabel(context: Context, state: DealWidgetState): String =
    state.indexValue?.let { context.getString(R.string.v110m_widget_index, "%.1f".format(it)) }
        ?: context.getString(R.string.widget_index_missing)

/** "Name · down 6.8% · District", or the localized "Deal of the day" placeholder. */
private fun widgetDealLine(context: Context, state: DealWidgetState): String {
    val name = state.dealName?.takeIf { it.isNotBlank() }
        ?: return context.getString(R.string.widget_deal_title)
    return listOfNotNull(
        name,
        state.dealDropPct?.let {
            context.getString(R.string.v110m_widget_drop, "%.1f%%".format(kotlin.math.abs(it)))
        },
        state.dealDistrict,
    ).joinToString(" · ")
}

@Composable
fun DealWidgetContent(state: DealWidgetState, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val indexLabel = widgetIndexLabel(context, state)
    val momLabel = state.momPct?.let { stringResource(R.string.v110m_widget_mom, formatPct(it)) }.orEmpty()
    val dealLine = widgetDealLine(context, state)
    MotormilaSurface(
        modifier = modifier.semantics {
            contentDescription = "$indexLabel $momLabel, $dealLine"
        },
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(indexLabel, style = MaterialTheme.typography.titleSmall)
            Text(momLabel, style = MaterialTheme.typography.labelMedium)
        }
        Text(dealLine, style = MaterialTheme.typography.bodyMedium, maxLines = 2)
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
            indexValue = 142.6,
            momPct = 1.2,
            dealName = "Toyota Axio 2017",
            dealDropPct = 6.8,
            dealDistrict = "Colombo",
            dealPriceLkr = 7_850_000,
        ),
    )
}
