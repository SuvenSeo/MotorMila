@file:OptIn(ExperimentalSharedTransitionApi::class)

package lk.motormila.app.ui.navigation

import android.net.Uri
import androidx.compose.animation.ExperimentalSharedTransitionApi
import lk.motormila.app.BuildConfig
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navDeepLink
import androidx.navigation.toRoute
import lk.motormila.app.R
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.core.network.AuthEvent
import lk.motormila.app.data.local.datastore.SessionStore
import lk.motormila.app.ui.MotormilaScaffold
import lk.motormila.app.ui.MotormilaTabs
import lk.motormila.app.ui.tools.ToolsScreen
import androidx.compose.foundation.layout.consumeWindowInsets
import lk.motormila.app.ui.updates.AppUpdateDialog
import lk.motormila.app.ui.updates.AppUpdateViewModel
import lk.motormila.app.ui.admin.AdminScreen
import lk.motormila.app.ui.alerts.AlertsScreen
import lk.motormila.app.ui.auth.LoginScreen
import lk.motormila.app.ui.bestpicks.BestPicksScreen
import lk.motormila.app.ui.calc.CalculatorScreen
import lk.motormila.app.ui.district.DistrictHubScreen
import lk.motormila.app.ui.biometric.rememberBiometricAuth
import lk.motormila.app.ui.compare.CompareScreen
import lk.motormila.app.ui.dealer.DealerScreen
import lk.motormila.app.ui.detail.ListingDetailScreen
import lk.motormila.app.ui.docs.DocsScreen
import lk.motormila.app.ui.ev.EvChargersScreen
import lk.motormila.app.ui.ev.EvHubScreen
import lk.motormila.app.ui.home.HomeScreen
import lk.motormila.app.ui.insights.InsightsScreen
import lk.motormila.app.ui.insights.PriceIndexScreen
import lk.motormila.app.ui.legal.LegalScreen
import lk.motormila.app.ui.make.MakeHubScreen
import lk.motormila.app.ui.make.MakeModelHubScreen
import lk.motormila.app.ui.notifications.NotificationsScreen
import lk.motormila.app.ui.permits.PermitsScreen
import lk.motormila.app.ui.pricing.PricingScreen
import lk.motormila.app.ui.pro.ProScreen
import lk.motormila.app.ui.profile.ProfileScreen
import lk.motormila.app.ui.pulse.OfficialPulseDetailScreen
import lk.motormila.app.ui.pulse.OfficialPulseScreen
import lk.motormila.app.ui.pulse.PulseGuideScreen
import lk.motormila.app.ui.splash.SplashScreen
import lk.motormila.app.ui.scan.PlateScanScreen
import lk.motormila.app.ui.search.SearchScreen
import lk.motormila.app.ui.sell.SellScreen
import lk.motormila.app.ui.settings.SettingsScreen
import lk.motormila.app.ui.share.ShareImportScreen
import lk.motormila.app.ui.valuation.ValuationScreen
import lk.motormila.app.ui.watchlist.WatchlistScreen

/**
 * Root nav graph with persistent bottom navigation bar and auth event handling.
 * [sharedUrl] comes from MainActivity (ACTION_SEND).
 * [startDeepLink] is the ACTION_VIEW URI; splash runs first, then this target.
 * [navigationEventId] increments on each new intent so the same URI can be re-opened.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun MotormilaNavGraph(
    sharedUrl: String? = null,
    startDeepLink: Uri? = null,
    navigationEventId: Int = 0,
    navController: NavHostController = rememberNavController(),
    viewModel: NavGraphViewModel = hiltViewModel(),
) {
    val uriHandler = LocalUriHandler.current
    val biometricLogin = rememberBiometricAuth(
        title = stringResource(R.string.biometric_title),
        subtitle = stringResource(R.string.biometric_login_subtitle),
    )
    val biometricSettings = rememberBiometricAuth(
        title = stringResource(R.string.biometric_title),
        subtitle = stringResource(R.string.biometric_settings_subtitle),
    )

    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    val isHome = currentDestination?.hasRoute<Home>() == true
    val isSearch = currentDestination?.hasRoute<Search>() == true
    val isWatchlist = currentDestination?.hasRoute<Watchlist>() == true
    val isInsights = currentDestination?.hasRoute<Insights>() == true
    val isProfile = currentDestination?.hasRoute<Profile>() == true
    val isTools = currentDestination?.hasRoute<Tools>() == true
    val isSell = currentDestination?.hasRoute<Sell>() == true
    // Design v2 tabs: Buy (Home + Search), Prices (Insights), Tools (Tools +
    // Profile/account), Sell, Saved (Watchlist).
    val showBottomBar = isHome || isSearch || isWatchlist || isInsights || isProfile || isTools || isSell
    val selectedTab = when {
        isHome || isSearch -> MotormilaTabs.BUY
        isInsights -> MotormilaTabs.PRICES
        isTools || isProfile -> MotormilaTabs.TOOLS
        isSell -> MotormilaTabs.SELL
        isWatchlist -> MotormilaTabs.SAVED
        else -> ""
    }
    val reducedMotion = rememberReducedMotion()

    // In-app update check (sideload channel): one passive check per cold
    // start; the dialog is hosted above the scaffold content.
    //
    // ProfileScreen ALSO runs AppUpdateViewModel, but through the same Hilt
    // scope it resolves the SAME instance — there is exactly one store and
    // one check per process. Do not add a second checkOnLaunch here.
    val updateViewModel: AppUpdateViewModel = hiltViewModel()
    val updateState by updateViewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) {
        updateViewModel.checkOnLaunch(BuildConfig.VERSION_CODE)
    }
    LaunchedEffect(updateState.downloadFailedTick) {
        if (updateState.downloadFailedTick > 0) {
            // Transient failure toast; consumed state resets the tick.
            updateViewModel.consumeDownloadFailure()
        }
    }

    LaunchedEffect(Unit) {
        viewModel.authEventBus.events.collect { event ->
            // Only after SessionGuard really cleared the rejected session.
            if (event is AuthEvent.SessionEnded) {
                navController.navigate(Login()) {
                    launchSingleTop = true
                }
            }
        }
    }

    LaunchedEffect(navigationEventId) {
        if (navigationEventId <= 1) return@LaunchedEffect
        val onSplash = navController.currentDestination?.hasRoute<Splash>() == true
        if (onSplash) return@LaunchedEffect
        if (sharedUrl != null) {
            navController.navigate(ShareImport(sharedUrl)) {
                launchSingleTop = true
            }
            return@LaunchedEffect
        }
        val target = startDeepLink?.let { resolveMotormilaDeepLink(it) } ?: return@LaunchedEffect
        // Routes with arguments (search query, sign-up tab, compare ids…) must
        // not reuse the current entry via singleTop, or a second deep link to
        // the same screen silently drops its new arguments. Replace it instead.
        // ListingDetail too: a link to a listing that is already on top reused the
        // entry with its old scroll position, so the gallery was off-screen (D2).
        val carriesArgs = target is Search || target is Login || target is Compare ||
            target is Alerts || target is Valuation || target is ListingDetail
        val current = navController.currentDestination
        navController.navigate(target) {
            if (carriesArgs && current != null && current.hasRoute(target::class)) {
                popUpTo(current.id) { inclusive = true }
            } else {
                launchSingleTop = true
            }
        }
    }

    SharedTransitionLayout {
        CompositionLocalProvider(LocalSharedTransitionScope provides this) {
        MotormilaScaffold(
            selected = selectedTab,
            showBottomBar = showBottomBar,
            onNavigate = { routeKey ->
                val target: Any = when (routeKey) {
                    MotormilaTabs.BUY, "home" -> Home
                    MotormilaTabs.PRICES, "insights" -> Insights
                    MotormilaTabs.TOOLS -> Tools
                    MotormilaTabs.SELL -> Sell
                    MotormilaTabs.SAVED, "watchlist" -> Watchlist
                    "search" -> Search()
                    "profile" -> Profile
                    else -> Home
                }
                navController.navigate(target) {
                    popUpTo(navController.graph.findStartDestination().id) {
                        saveState = true
                    }
                    launchSingleTop = true
                    restoreState = true
                }
            },
            onScan = { navController.navigate(PlateScan) },
        ) { innerPadding ->
            // Edge-to-edge: every screen owns its status-bar inset (glass top
            // bars draw under it). Tab roots let content scroll under the
            // floating glass tab bar and pad via LocalBottomChrome; Detail
            // owns its bottom action bar; other pushed routes keep the
            // gesture/nav-bar inset here so nothing ends under it.
            val navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
            val isDetail = currentDestination?.hasRoute<ListingDetail>() == true
            val isSplash = currentDestination?.hasRoute<Splash>() == true
            val bottomPad = if (showBottomBar || isDetail || isSplash) 0.dp else navInset
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(bottom = bottomPad)
                    .consumeWindowInsets(PaddingValues(bottom = bottomPad))
            ) {
                updateState.available?.let { update ->
                    AppUpdateDialog(
                        update = update,
                        downloading = updateState.downloading,
                        onUpdate = { updateViewModel.downloadAndInstall(update) },
                        onDismiss = { updateViewModel.dismiss() },
                        installPermissionRequested = updateState.installPermissionRequested,
                    )
                }
                // Predictive back: Navigation-Compose 2.8 seeks the pop
                // transitions with the back-gesture progress (fade-through +
                // scale from MmMotion), so no custom PredictiveBackHandler here.
                NavHost(
                    navController = navController,
                    startDestination = if (sharedUrl != null) ShareImport(sharedUrl) else Splash,
                    enterTransition = { motormilaEnter(reducedMotion) },
                    exitTransition = { motormilaExit(reducedMotion) },
                    popEnterTransition = { motormilaPopEnter(reducedMotion) },
                    popExitTransition = { motormilaPopExit(reducedMotion) },
                ) {
                    motormilaComposable<Splash> {
                        SplashGate(
                            sessionStore = viewModel.sessionStore,
                            onDone = { isLoggedIn ->
                                val target = destinationAfterSplash(
                                    isLoggedIn = isLoggedIn,
                                    deepLinkTarget = startDeepLink?.let { resolveMotormilaDeepLink(it) },
                                )
                                navController.navigate(target) {
                                    popUpTo(Splash) { inclusive = true }
                                    launchSingleTop = true
                                }
                            },
                        )
                    }
                    motormilaComposable<Login>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://login" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/sign-in" },
                        ),
                    ) {
                        LoginScreen(
                            onLoggedIn = {
                                navController.navigate(Home) {
                                    popUpTo<Login> { inclusive = true }
                                }
                            },
                            onBrowse = {
                                navController.navigate(Home) {
                                    popUpTo<Login> { inclusive = true }
                                }
                            },
                            onBiometricAuth = biometricLogin,
                        )
                    }
                    motormilaComposable<Home> {
                        HomeScreen(
                            onListingClick = { id -> navController.navigate(ListingDetail(id)) },
                            onSearchClick = { navController.navigate(Search()) },
                            onAlertsClick = { navController.navigate(Alerts()) },
                            onSeeAll = { key ->
                                when (key) {
                                    "drops", "deals" -> navController.navigate(BestPicks)
                                    "districts" -> navController.navigate(Insights)
                                    else -> navController.navigate(Search())
                                }
                            },
                            onLoginClick = { navController.navigate(Login()) },
                            onEvHubClick = { navController.navigate(EvHub) },
                            onBestPicksClick = { navController.navigate(BestPicks) },
                            onPulseClick = { navController.navigate(OfficialPulse) },
                            onMakeModelClick = { make, model ->
                                navController.navigate(MakeModelHub(make, model))
                            },
                            onDistrictClick = { district ->
                                navController.navigate(DistrictHub(district))
                            },
                            onCalculatorClick = { navController.navigate(Calculator) },
                            onPriceIndexClick = { navController.navigate(PriceIndex) },
                            onPermitsClick = { navController.navigate(Permits) },
                        )
                    }
                    // No Navigation-level deep links here: NavHost's automatic cold-start
                    // handling matched motormila://search?… against the route's own fields
                    // only, silently dropping web filter keys (fuel_type, transmission…) and
                    // relaunching the task. resolveMotormilaDeepLink (Splash / onNewIntent)
                    // maps every key into Search.filters instead.
                    motormilaComposable<Search> {
                        SearchScreen(
                            onListingClick = { id -> navController.navigate(ListingDetail(id, fromCard = true)) },
                            onCompare = { ids -> navController.navigate(Compare(ids)) },
                            onOpenSharedUrl = { url -> navController.navigate(ShareImport(url)) },
                        )
                    }
                    motormilaComposable<Watchlist>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://watchlist" },
                        ),
                    ) {
                        WatchlistScreen(
                            onOpenDetail = { id -> navController.navigate(ListingDetail(id)) },
                            onCreateAlert = { id -> navController.navigate(Alerts(listingId = id)) },
                            onBrowse = { navController.navigate(Search()) },
                        )
                    }
                    motormilaComposable<Insights> {
                        InsightsScreen(
                            onOpenPulseDetail = { id ->
                                id.toIntOrNull()?.let { navController.navigate(OfficialPulseDetail(it)) }
                                    ?: navController.navigate(OfficialPulse)
                            },
                            onDrillDistrict = { district ->
                                navController.navigate(DistrictHub(district))
                            },
                            onSearchModels = { query ->
                                val parts = query.trim().split(Regex("\\s+"), limit = 2)
                                if (parts.size == 2) {
                                    navController.navigate(MakeModelHub(parts[0], parts[1]))
                                } else {
                                    navController.navigate(Search(q = query))
                                }
                            },
                            onChargersClick = { navController.navigate(EvChargers) },
                            onUpgrade = { navController.navigate(Pro) },
                        )
                    }
                    motormilaComposable<Profile> {
                        ProfileScreen(
                            onLoginClick = { navController.navigate(Login()) },
                            onSettingsClick = { navController.navigate(Settings) },
                            onProClick = { navController.navigate(Pro) },
                            onDealerClick = { navController.navigate(Dealer) },
                            onAlertsClick = { navController.navigate(Alerts()) },
                            onNotificationsClick = { navController.navigate(Notifications) },
                            onEvHubClick = { navController.navigate(EvHub) },
                            onPulseClick = { navController.navigate(OfficialPulse) },
                            onBestPicksClick = { navController.navigate(BestPicks) },
                            onCalculatorClick = { navController.navigate(Calculator) },
                            onCompareClick = { navController.navigate(Compare(emptyList())) },
                            onTrendsClick = { navController.navigate(Insights) },
                            onPriceIndexClick = { navController.navigate(PriceIndex) },
                            onDocsClick = { navController.navigate(Docs) },
                            onPricingClick = { navController.navigate(Pricing) },
                            onPermitsClick = { navController.navigate(Permits) },
                            onSellClick = { navController.navigate(Sell) },
                            onAdminClick = { navController.navigate(Admin) },
                            onEvChargersClick = { navController.navigate(EvChargers) },
                            onPrivacyClick = { navController.navigate(Privacy) },
                            onTermsClick = { navController.navigate(Terms) },
                        )
                    }
                    motormilaComposable<ListingDetail>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://listing/{id}" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/listing/{id}" },
                        ),
                    ) { entry ->
                        val route = entry.toRoute<ListingDetail>()
                        ListingDetailScreen(
                            listingId = route.id,
                            fromCard = route.fromCard,
                            onBack = { navController.popBackStack() },
                            onCompare = { ids -> navController.navigate(Compare(ids)) },
                            onEstimate = { navController.navigate(Valuation()) },
                            onOpenListing = { id -> navController.navigate(ListingDetail(id)) },
                        )
                    }
                    motormilaComposable<Compare>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://compare?ids={ids}" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/compare?ids={ids}" },
                        ),
                    ) { entry ->
                        val route = entry.toRoute<Compare>()
                        CompareScreen(
                            ids = route.ids,
                            onOpenDetail = { id -> navController.navigate(ListingDetail(id)) },
                            onAddListing = { navController.navigate(Search()) },
                            onBrowse = { navController.navigate(Search()) },
                        )
                    }
                    motormilaComposable<Valuation>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://valuation?make={make}&model={model}" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/valuation?make={make}&model={model}" },
                        ),
                    ) {
                        ValuationScreen(
                            onOpenListing = { id -> navController.navigate(ListingDetail(id)) },
                            onSeeSimilar = { make, model -> navController.navigate(MakeModelHub(make, model)) },
                        )
                    }
                    motormilaComposable<Alerts>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://alerts?listingId={listingId}" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/alerts?listingId={listingId}" },
                        ),
                    ) {
                        AlertsScreen(
                            onOpenDetail = { id -> navController.navigate(ListingDetail(id)) },
                            onUpgrade = { navController.navigate(Pro) },
                            onSignIn = { navController.navigate(Login()) },
                        )
                    }
                    motormilaComposable<Notifications>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://notifications" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/notifications" },
                        ),
                    ) {
                        NotificationsScreen(
                            onOpenNotification = { id ->
                                id.toIntOrNull()?.let { navController.navigate(ListingDetail(it)) }
                            },
                        )
                    }
                    motormilaComposable<Pro>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://pro" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/pro" },
                        ),
                    ) {
                        ProScreen(
                            onOpenCheckout = { url -> uriHandler.openUri(url) },
                            onOpenDistrict = { district ->
                                navController.navigate(DistrictHub(district))
                            },
                        )
                    }
                    motormilaComposable<Dealer>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://dealer" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/dealer" },
                        ),
                    ) {
                        DealerScreen(
                            onContactSupport = { uriHandler.openUri(SUPPORT_MAILTO) },
                        )
                    }
                    motormilaComposable<Settings>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://settings" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/settings" },
                        ),
                    ) {
                        SettingsScreen(
                            onLoggedOut = {
                                navController.navigate(Login()) {
                                    popUpTo(Home) { inclusive = true }
                                }
                            },
                            onOpenUrl = { url -> uriHandler.openUri(url) },
                            onBiometricVerify = biometricSettings,
                            onPrivacyClick = { navController.navigate(Privacy) },
                            onTermsClick = { navController.navigate(Terms) },
                        )
                    }
                    motormilaComposable<PlateScan>(
                        deepLinks = listOf(navDeepLink { uriPattern = "motormila://scan" }),
                    ) {
                        PlateScanScreen(
                            onSearchPlate = { plate ->
                                navController.navigate(Search(q = plate, plate = plate))
                            },
                            onOpenFmv = { id -> navController.navigate(ListingDetail(id)) },
                        )
                    }
                    motormilaComposable<ShareImport> { entry ->
                        val route = entry.toRoute<ShareImport>()
                        ShareImportScreen(
                            sharedUrl = route.url,
                            onSearch = { query ->
                                navController.navigate(
                                    Search(
                                        q = query.keyword,
                                        make = query.make,
                                        model = query.model,
                                        district = query.district,
                                        sort = query.sort,
                                    ),
                                ) {
                                    popUpTo(route) { inclusive = true }
                                }
                            },
                            onCompare = { ids ->
                                navController.navigate(Compare(ids)) {
                                    popUpTo(route) { inclusive = true }
                                }
                            },
                            onValuation = { make, model, year ->
                                navController.navigate(Valuation(make, model, year)) {
                                    popUpTo(route) { inclusive = true }
                                }
                            },
                            onBrowse = {
                                navController.navigate(Home) {
                                    popUpTo(route) { inclusive = true }
                                }
                            },
                        )
                    }
                    motormilaComposable<EvHub>(
                        deepLinks = listOf(navDeepLink { uriPattern = "motormila://ev" }),
                    ) {
                        EvHubScreen(
                            onBack = { navController.popBackStack() },
                            onSearchModels = { query ->
                                val parts = query.trim().split(Regex("\\s+"), limit = 2)
                                if (parts.size == 2) {
                                    navController.navigate(MakeModelHub(parts[0], parts[1]))
                                } else {
                                    navController.navigate(Search(q = query))
                                }
                            },
                            onOpenListing = { id -> navController.navigate(ListingDetail(id)) },
                            onChargersClick = { navController.navigate(EvChargers) },
                        )
                    }
                    motormilaComposable<OfficialPulse>(
                        deepLinks = listOf(navDeepLink { uriPattern = "motormila://pulse" }),
                    ) {
                        OfficialPulseScreen(
                            onBack = { navController.popBackStack() },
                            onOpenUrl = { url -> uriHandler.openUri(url) },
                            onOpenSignal = { id -> navController.navigate(OfficialPulseDetail(id)) },
                        )
                    }
                    motormilaComposable<OfficialPulseDetail>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://pulse/{id}" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/official-pulse/{id}" },
                        ),
                    ) {
                        OfficialPulseDetailScreen(
                            onBack = { navController.popBackStack() },
                            onOpenUrl = { url -> uriHandler.openUri(url) },
                            onOpenGuide = { key -> navController.navigate(PulseGuide(key)) },
                        )
                    }
                    motormilaComposable<BestPicks>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://home?dealOfDay=true" },
                            navDeepLink { uriPattern = "motormila://picks" },
                        ),
                    ) {
                        BestPicksScreen(
                            onBack = { navController.popBackStack() },
                            onListingClick = { id -> navController.navigate(ListingDetail(id, fromCard = true)) },
                            onSeeAllSearch = {
                                navController.navigate(Search(sort = "deal_score"))
                            },
                        )
                    }
                    motormilaComposable<MakeHub>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://cars/{make}" },
                            navDeepLink { uriPattern = "motormila://make/{make}" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/cars/{make}" },
                        ),
                    ) {
                        MakeHubScreen(
                            onBack = { navController.popBackStack() },
                            onModelClick = { make, model ->
                                navController.navigate(MakeModelHub(make, model))
                            },
                            onListingClick = { id -> navController.navigate(ListingDetail(id, fromCard = true)) },
                            onSeeAllSearch = { make ->
                                navController.navigate(Search(make = make))
                            },
                        )
                    }
                    motormilaComposable<MakeModelHub>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://cars/{make}/{model}" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/cars/{make}/{model}" },
                        ),
                    ) {
                        MakeModelHubScreen(
                            onBack = { navController.popBackStack() },
                            onMakeClick = { make -> navController.navigate(MakeHub(make)) },
                            onListingClick = { id -> navController.navigate(ListingDetail(id, fromCard = true)) },
                            onSeeAllSearch = { make, model ->
                                navController.navigate(Search(make = make, model = model))
                            },
                            onEstimate = { make, model ->
                                navController.navigate(Valuation(make, model))
                            },
                        )
                    }
                    motormilaComposable<DistrictHub>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://locations/{district}" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/locations/{district}" },
                        ),
                    ) {
                        DistrictHubScreen(
                            onBack = { navController.popBackStack() },
                            onListingClick = { id -> navController.navigate(ListingDetail(id, fromCard = true)) },
                            onModelClick = { make, model ->
                                navController.navigate(MakeModelHub(make, model))
                            },
                            onSeeAllSearch = { district ->
                                navController.navigate(Search(district = district))
                            },
                            onDistrictClick = { district ->
                                navController.navigate(DistrictHub(district))
                            },
                        )
                    }
                    motormilaComposable<Calculator>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://calculator" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/calculator" },
                        ),
                    ) {
                        CalculatorScreen(
                            onBack = { navController.popBackStack() },
                            onUpgrade = { navController.navigate(Pro) },
                        )
                    }
                    motormilaComposable<Pricing>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://pricing" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/pricing" },
                        ),
                    ) {
                        PricingScreen(
                            onBack = { navController.popBackStack() },
                            onSignUp = { navController.navigate(Login(signup = true)) },
                            onOpenPro = { navController.navigate(Pro) },
                            onOpenDealer = { navController.navigate(Dealer) },
                            onOpenHome = { navController.navigate(Home) },
                            onOpenUrl = { url -> uriHandler.openUri(url) },
                        )
                    }
                    motormilaComposable<Tools> {
                        ToolsScreen(
                            onValuation = { navController.navigate(Valuation()) },
                            onScan = { navController.navigate(PlateScan) },
                            onCompare = { navController.navigate(Compare(emptyList())) },
                            onCalculator = { navController.navigate(Calculator) },
                            onPermits = { navController.navigate(Permits) },
                            onDocs = { navController.navigate(Docs) },
                            onEvHub = { navController.navigate(EvHub) },
                            onAlerts = { navController.navigate(Alerts()) },
                            onAccount = { navController.navigate(Profile) },
                        )
                    }
                    motormilaComposable<Sell>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://sell" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/sell" },
                        ),
                    ) {
                        SellScreen(
                            onBack = { navController.popBackStack() },
                            onLoginClick = { navController.navigate(Login()) },
                        )
                    }
                    motormilaComposable<Docs>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://docs" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/docs" },
                        ),
                    ) {
                        DocsScreen(onBack = { navController.popBackStack() })
                    }
                    motormilaComposable<PulseGuide>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://guide/{key}" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/official-pulse/guide/{key}" },
                        ),
                    ) { entry ->
                        val route = entry.toRoute<PulseGuide>()
                        PulseGuideScreen(
                            guideKey = route.key,
                            onBack = { navController.popBackStack() },
                            onOpenPulse = { navController.navigate(OfficialPulse) },
                            onOpenCalculator = { navController.navigate(Calculator) },
                        )
                    }
                    motormilaComposable<Admin>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://admin" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/admin" },
                        ),
                    ) {
                        AdminScreen(
                            onBack = { navController.popBackStack() },
                            onLoginClick = { navController.navigate(Login()) },
                        )
                    }
                    motormilaComposable<EvChargers>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://chargers" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/ev-chargers" },
                        ),
                    ) {
                        EvChargersScreen(
                            onBack = { navController.popBackStack() },
                            onOpenUrl = { url -> uriHandler.openUri(url) },
                        )
                    }
                    motormilaComposable<Privacy>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://privacy" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/privacy" },
                        ),
                    ) {
                        LegalScreen(
                            documentId = "privacy",
                            onBack = { navController.popBackStack() },
                            onOpenOther = { navController.navigate(Terms) },
                        )
                    }
                    motormilaComposable<Terms>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://terms" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/terms" },
                        ),
                    ) {
                        LegalScreen(
                            documentId = "terms",
                            onBack = { navController.popBackStack() },
                            onOpenOther = { navController.navigate(Privacy) },
                        )
                    }
                    motormilaComposable<Permits>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://permits" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/permits" },
                        ),
                    ) {
                        PermitsScreen(
                            onBack = { navController.popBackStack() },
                            onOpenCalculator = { navController.navigate(Calculator) },
                        )
                    }
                    motormilaComposable<PriceIndex>(
                        deepLinks = listOf(
                            navDeepLink { uriPattern = "motormila://price-index" },
                            navDeepLink { uriPattern = "https://motormila.pages.dev/price-index" },
                        ),
                    ) {
                        PriceIndexScreen(
                            onBack = { navController.popBackStack() },
                            onOpenPro = { navController.navigate(Pro) },
                        )
                    }
                }
            }
        }
        }
    }
}

/**
 * Foundation-owned splash gate: restores any saved session, then proceeds to
 * [Home] (public browse, matching web `/`) or a deep-link target. Login is
 * opt-in from Profile, not a cold-start wall.
 */
@Composable
private fun SplashGate(
    sessionStore: SessionStore,
    onDone: (isLoggedIn: Boolean) -> Unit,
) {
    var loggedIn by remember { mutableStateOf(false) }
    var sessionReady by remember { mutableStateOf(false) }
    var splashDone by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        // rehydrate() (not snapshot()) primes the interceptor's token and
        // drops an expired session before any screen fires a request.
        val session = runCatching { sessionStore.rehydrate() }.getOrNull()
        loggedIn = session != null && session.token.isNotBlank()
        sessionReady = true
    }
    SplashScreen(onDone = { splashDone = true })
    LaunchedEffect(sessionReady, splashDone) {
        if (sessionReady && splashDone) onDone(loggedIn)
    }
}

private const val SUPPORT_MAILTO = lk.motormila.app.core.SupportContact.MAILTO
