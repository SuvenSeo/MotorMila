# Motormila Android — NAV_CONTRACT (foundation ↔ screen builders)

`MotormilaNavGraph` (foundation-owned) calls every screen below. Section 1 lists
the **REAL signatures the graph compiles against**. Destinations live in
`ui.navigation.Routes.kt` (`@Serializable`, type-safe). Keep ViewModels behind
a `viewModel = hiltViewModel()` default so the graph never names VM types.

Search, Valuation, and Login are **data classes with query args** — screens still take
the same composable parameters; ViewModels read args via
`SavedStateHandle.toRoute<Search>()` / `toRoute<Valuation>()` / `toRoute<Login>()`.

## 1. Landed — graph matches these exactly

```kotlin
// lk.motormila.app.ui.home — HomeScreen.kt
@Composable
fun HomeScreen(
    onListingClick: (Int) -> Unit,   // -> ListingDetail(id)
    onSearchClick: () -> Unit,       // -> Search()
    onAlertsClick: () -> Unit,       // -> Alerts
    onSeeAll: (String) -> Unit,      // keys: "drops"|"deals" -> BestPicks
                                     //       "districts" -> Insights
                                     //       "feed"|"trends"|else -> Search()
    onLoginClick: () -> Unit = {},   // -> Login()
    onEvHubClick: () -> Unit = {},   // -> EvHub
    onBestPicksClick: () -> Unit = {}, // -> BestPicks
    onPulseClick: () -> Unit = {},   // -> OfficialPulse
    onMakeModelClick: (make: String, model: String) -> Unit = { _, _ -> }, // -> MakeModelHub
    onDistrictClick: (district: String) -> Unit = {}, // -> DistrictHub
    onCalculatorClick: () -> Unit = {}, // -> Calculator
    onPriceIndexClick: () -> Unit = {}, // -> PriceIndex
    onPermitsClick: () -> Unit = {},    // -> Permits
    viewModel: HomeViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.search — SearchScreen.kt
@Composable
fun SearchScreen(
    onListingClick: (Int) -> Unit,   // -> ListingDetail(id)
    onCompare: (List<Int>) -> Unit,  // -> Compare(ids)
    viewModel: SearchViewModel = hiltViewModel(),
)
// SearchViewModel injects SavedStateHandle and applies ListingQuery via
// searchArgsToQuery(Search) (SearchArgs.kt). If q or plate is present it
// sets the query text and calls onSearch. If voice=true, SearchUiState.pendingVoice
// is set; SearchScreen LaunchedEffect launches VoiceSearchHelper once then
// consumeVoice(). Free-tier deal_score sort is locked to newest.

// lk.motormila.app.ui.watchlist — WatchlistScreen.kt
@Composable
fun WatchlistScreen(
    onOpenDetail: (id: Int) -> Unit, // -> ListingDetail(id)
    onCreateAlert: (id: Int) -> Unit,// -> Alerts(listingId=id) prefill
    onBrowse: () -> Unit,            // -> Search()
    viewModel: WatchlistViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.insights — InsightsScreen.kt
@Composable
fun InsightsScreen(
    onOpenPulseDetail: (signalId: String) -> Unit, // -> OfficialPulseDetail(id)
    onDrillDistrict: (district: String) -> Unit,  // -> DistrictHub(district)
    onSearchModels: (query: String) -> Unit,      // two tokens -> MakeModelHub, else Search(q=)
    onChargersClick: () -> Unit = {},             // -> EvChargers
    onUpgrade: () -> Unit = {},                   // -> Pro
    initialTab: Int = 0,
    viewModel: InsightsViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.detail — DetailScreen.kt
@Composable
fun ListingDetailScreen(
    listingId: Int,
    onBack: () -> Unit,                 // popBackStack
    onCompare: (List<Int>) -> Unit,     // -> Compare(ids)
    onEstimate: () -> Unit,             // -> Valuation()
    viewModel: DetailViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.compare — CompareScreen.kt
@Composable
fun CompareScreen(
    ids: List<Int>,
    onOpenDetail: (id: Int) -> Unit, // -> ListingDetail(id)
    onAddListing: () -> Unit,        // -> Search()
    onBrowse: () -> Unit,            // -> Search()
    viewModel: CompareViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.valuation — ValuationScreen.kt
@Composable
fun ValuationScreen(
    onOpenListing: (id: Int) -> Unit, // -> ListingDetail(id)
    viewModel: ValuationViewModel = hiltViewModel(),
)
// ValuationViewModel reads Valuation(make, model) from SavedStateHandle and
// prefills ValuationForm when either field is non-blank.

// lk.motormila.app.ui.alerts — AlertsScreen.kt
@Composable
fun AlertsScreen(
    onOpenDetail: (id: Int) -> Unit, // -> ListingDetail(id)
    onUpgrade: () -> Unit,           // -> Pro
    viewModel: AlertsViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.notifications — NotificationsScreen.kt
@Composable
fun NotificationsScreen(
    onOpenNotification: (id: String) -> Unit, // numeric -> ListingDetail(id)
    viewModel: NotificationsViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.pro — ProScreen.kt
@Composable
fun ProScreen(
    onOpenCheckout: (url: String) -> Unit,   // LocalUriHandler
    onOpenDistrict: (district: String) -> Unit, // -> DistrictHub(district)
    viewModel: ProViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.dealer — DealerScreen.kt
@Composable
fun DealerScreen(
    onContactSupport: () -> Unit, // mailto:suvenseoras@gmail.com · 0758504424
    viewModel: DealerViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.auth — LoginScreen.kt
@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    onBrowse: () -> Unit = {},        // -> Home (public browse, web `/` parity)
    onBiometricAuth: (onSuccess: () -> Unit, onError: (String) -> Unit) -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.settings — SettingsScreen.kt
@Composable
fun SettingsScreen(
    onLoggedOut: () -> Unit,
    onOpenUrl: (url: String) -> Unit,
    onBiometricVerify: (onSuccess: () -> Unit, onError: (String) -> Unit) -> Unit,
    onPrivacyClick: () -> Unit = {},    // -> Privacy
    onTermsClick: () -> Unit = {},      // -> Terms
    viewModel: SettingsViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.profile — ProfileScreen.kt
@Composable
fun ProfileScreen(
    onLoginClick: () -> Unit,        // -> Login()
    onSettingsClick: () -> Unit,     // -> Settings
    onProClick: () -> Unit,          // -> Pro
    onDealerClick: () -> Unit,       // -> Dealer
    onAlertsClick: () -> Unit,       // -> Alerts
    onNotificationsClick: () -> Unit,// -> Notifications
    onEvHubClick: () -> Unit = {},   // -> EvHub
    onPulseClick: () -> Unit = {},   // -> OfficialPulse
    onBestPicksClick: () -> Unit = {}, // -> BestPicks
    onCalculatorClick: () -> Unit = {}, // -> Calculator
    onCompareClick: () -> Unit = {},     // -> Compare
    onTrendsClick: () -> Unit = {},     // -> Insights
    onPriceIndexClick: () -> Unit = {}, // -> PriceIndex
    onDocsClick: () -> Unit = {},       // -> Docs
    onPricingClick: () -> Unit = {},     // -> Pricing
    onPermitsClick: () -> Unit = {},    // -> Permits
    onSellClick: () -> Unit = {},       // -> Sell
    onAdminClick: () -> Unit = {},      // -> Admin
    onEvChargersClick: () -> Unit = {}, // -> EvChargers
    onPrivacyClick: () -> Unit = {},    // -> Privacy
    onTermsClick: () -> Unit = {},      // -> Terms
    viewModel: ProfileViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.sell — SellScreen.kt
@Composable
fun SellScreen(
    onBack: () -> Unit,              // -> popBackStack()
    onLoginClick: () -> Unit,        // -> Login()
    viewModel: SellViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.scan — PlateScanScreen.kt
@Composable
fun PlateScanScreen(
    onSearchPlate: (plate: String) -> Unit, // -> Search(q=plate, plate=plate)
    onOpenFmv: (listingId: Int) -> Unit,    // -> ListingDetail(id)
    viewModel: PlateScanViewModel = hiltViewModel(),
)
// ALSO LANDED: lk.motormila.app.ui.scan.ScanTileService : TileService
// (manifest-registered; fires motormila://scan).

// lk.motormila.app.ui.share — ShareImportScreen.kt
@Composable
fun ShareImportScreen(
    sharedUrl: String?,
    onSearch: (ListingQuery) -> Unit,       // -> Search(q, make, model, district, sort)
    onCompare: (ids: List<Int>) -> Unit,    // -> Compare(ids)
    onValuation: (make: String, model: String) -> Unit, // -> Valuation(make, model)
    onBrowse: () -> Unit,                   // -> Home
)
// NOTE: ShareImportScreen takes NO viewModel — parsing is synchronous via
// parseSharedUrl() + LaunchedEffect forward-once. Do not add one.

// lk.motormila.app.ui.ev — EvHubScreen.kt (Agent 2)
@Composable
fun EvHubScreen(
    onBack: () -> Unit,                 // popBackStack
    onSearchModels: (String) -> Unit,   // two tokens -> MakeModelHub, else Search(q=)
    onOpenListing: (Int) -> Unit,       // -> ListingDetail(id)
    onChargersClick: () -> Unit = {},   // -> EvChargers
    viewModel: EvHubViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.pulse — OfficialPulseScreen.kt (Agent 2)
@Composable
fun OfficialPulseScreen(
    onBack: () -> Unit,                 // popBackStack
    onOpenUrl: (String) -> Unit,        // LocalUriHandler
    onOpenSignal: (Int) -> Unit = {},  // -> OfficialPulseDetail
    viewModel: OfficialPulseViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.pulse — OfficialPulseDetailScreen.kt
@Composable
fun OfficialPulseDetailScreen(
    onBack: () -> Unit,
    onOpenUrl: (String) -> Unit,
    onOpenGuide: (String) -> Unit,
    viewModel: OfficialPulseDetailViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.bestpicks — BestPicksScreen.kt (Agent 2)
@Composable
fun BestPicksScreen(
    onBack: () -> Unit,                 // popBackStack
    onListingClick: (Int) -> Unit,      // -> ListingDetail(id)
    onSeeAllSearch: () -> Unit,         // -> Search(sort="deal_score")
    viewModel: BestPicksViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.make — MakeHubScreen.kt
@Composable
fun MakeHubScreen(
    onBack: () -> Unit,                              // popBackStack
    onModelClick: (make: String, model: String) -> Unit, // -> MakeModelHub
    onListingClick: (Int) -> Unit,                   // -> ListingDetail(id)
    onSeeAllSearch: (make: String) -> Unit,          // -> Search(make=)
    viewModel: MakeHubViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.make — MakeModelHubScreen.kt
@Composable
fun MakeModelHubScreen(
    onBack: () -> Unit,
    onMakeClick: (make: String) -> Unit,             // -> MakeHub
    onListingClick: (Int) -> Unit,                   // -> ListingDetail(id)
    onSeeAllSearch: (make: String, model: String) -> Unit, // -> Search(make, model)
    onEstimate: (make: String, model: String) -> Unit,     // -> Valuation(make, model)
    viewModel: MakeModelHubViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.district — DistrictHubScreen.kt
@Composable
fun DistrictHubScreen(
    onBack: () -> Unit,
    onListingClick: (Int) -> Unit,                   // -> ListingDetail(id)
    onModelClick: (make: String, model: String) -> Unit, // -> MakeModelHub
    onSeeAllSearch: (district: String) -> Unit,      // -> Search(district=)
    onDistrictClick: (district: String) -> Unit = {}, // -> DistrictHub
    viewModel: DistrictHubViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.calc — CalculatorScreen.kt
@Composable
fun CalculatorScreen(
    onBack: () -> Unit,                 // popBackStack
    onUpgrade: () -> Unit,              // -> Pro
    viewModel: CalculatorViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.pricing — PricingScreen.kt
@Composable
fun PricingScreen(
    onBack: () -> Unit,
    onSignUp: () -> Unit,               // -> Login
    onOpenPro: () -> Unit,              // -> Pro
    onOpenDealer: () -> Unit,           // -> Dealer
    onOpenHome: () -> Unit,             // -> Home
    onOpenUrl: (String) -> Unit,
    viewModel: PricingViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.docs — DocsScreen.kt
@Composable
fun DocsScreen(
    onBack: () -> Unit,
    initialSectionId: String? = null,
)

// lk.motormila.app.ui.pulse — PulseGuideScreen.kt
@Composable
fun PulseGuideScreen(
    guideKey: String,
    onBack: () -> Unit,
    onOpenPulse: () -> Unit,            // -> OfficialPulse
    onOpenCalculator: () -> Unit,       // -> Calculator
)

// lk.motormila.app.ui.admin — AdminScreen.kt
@Composable
fun AdminScreen(
    onBack: () -> Unit,
    onLoginClick: () -> Unit,           // -> Login
    viewModel: AdminViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.ev — EvChargersScreen.kt
@Composable
fun EvChargersScreen(
    onBack: () -> Unit,
    onOpenUrl: (String) -> Unit,
    viewModel: EvChargersViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.legal — LegalScreen.kt
@Composable
fun LegalScreen(
    documentId: String,                 // "privacy" | "terms"
    onBack: () -> Unit,
    onOpenOther: () -> Unit,            // Privacy <-> Terms
)

// lk.motormila.app.ui.permits — PermitsScreen.kt
@Composable
fun PermitsScreen(
    onBack: () -> Unit,
    onOpenCalculator: () -> Unit,       // -> Calculator
    viewModel: PermitsViewModel = hiltViewModel(),
)

// lk.motormila.app.ui.insights — PriceIndexScreen.kt
@Composable
fun PriceIndexScreen(
    onBack: () -> Unit,
    onOpenPro: () -> Unit,              // -> Pro
    viewModel: PriceIndexViewModel = hiltViewModel(),
)
```

## 2. Missing — none (retired)

New screens: add the destination to `Routes.kt`, wire it in
`MotormilaNavGraph.kt`, and record the exact signature in §1.

## Route shapes (`Routes.kt`)

```kotlin
@Serializable data object Splash / Login / Home / Watchlist / Insights / Profile
@Serializable data class Search(
    val q: String? = null,
    val district: String? = null,
    val make: String? = null,
    val model: String? = null,
    val sort: String? = null,
    val voice: Boolean = false,
    val plate: String? = null,
)
@Serializable data class ListingDetail(val id: Int)
@Serializable data class Compare(val ids: List<Int>)
@Serializable data class Valuation(val make: String? = null, val model: String? = null)
@Serializable data class Alerts(val listingId: Int = 0)
@Serializable data object Notifications / Pro / Dealer / Settings / PlateScan
@Serializable data class ShareImport(val url: String? = null)
@Serializable data object EvHub / OfficialPulse / BestPicks / Calculator
@Serializable data object Pricing / Docs / Admin / EvChargers / Privacy / Terms / Permits / PriceIndex
@Serializable data class OfficialPulseDetail(val id: Int)
@Serializable data class PulseGuide(val key: String)
@Serializable data class MakeHub(val make: String)
@Serializable data class MakeModelHub(val make: String, val model: String)
@Serializable data class DistrictHub(val district: String)
```

Bottom bar still `navigate(Search())` with empty defaults + `launchSingleTop` /
`restoreState`. `hasRoute<Search>()` and `BOTTOM_BAR_ROUTES` use the class
qualified name (works for data classes).

## Foundation-owned extras (not screens)

- `ui/biometric/BiometricAuth.kt` — `rememberBiometricAuth(title, subtitle)`
- `ShareImportActivity` — ACTION_SEND trampoline → MainActivity (`SHARED_URL_KEY`)
- `MainActivity.extractViewUri()` — ACTION_VIEW `intent.data` (search/watchlist/…)
- `SplashGate` — private to `MotormilaNavGraph.kt`; then [Home] (public browse)
  **or** the resolved deep-link target (`resolveMotormilaDeepLink`). Login is
  not a cold-start wall; guests tap Profile → Log in. `destinationAfterSplash`
  encodes this and is unit-tested.
- `AuthEventBus.Unauthorized` collector — Login with `launchSingleTop` so
  browse (Home) stays on the back stack. Only emitted when a **bearer token**
  was rejected (`shouldForceReLogin`); anonymous 401s on gated routes do not
  kick the visitor out of the market. Settings logout still `popUpTo(Home)`.
- Bottom bar shows ONLY on Home/Search/Watchlist/Insights/Profile
- `MotormilaScaffold` bottom labels from resources (`nav_home` …)

## Deep links

Handled two ways (query params on type-safe routes are picky in Navigation
Compose, so MainActivity parses VIEW URIs and navigates after splash):

| URI | Destination |
|---|---|
| `motormila://search?q={q}&district={district}&voice={voice}` (+ make/model/sort/plate) | `Search(...)` |
| `motormila://watchlist` | `Watchlist` |
| `motormila://home?dealOfDay=true` | `BestPicks` |
| `motormila://picks` | `BestPicks` |
| `motormila://ev` | `EvHub` |
| `motormila://pulse` | `OfficialPulse` |
| `motormila://listing/{id}` | `ListingDetail` |
| `https://motormila.pages.dev/listing/{id}` | `ListingDetail` (optional app link) |
| `motormila://scan` | `PlateScan` |
| `motormila://home` (no dealOfDay) | `Home` |
| `motormila://pro?deal=day` | `BestPicks` (legacy) |
| `motormila://calculator` | `Calculator` |
| `motormila://pricing` | `Pricing` |
| `motormila://docs` | `Docs` |
| `motormila://admin` | `Admin` |
| `motormila://chargers` | `EvChargers` |
| `motormila://privacy` | `Privacy` |
| `motormila://terms` | `Terms` |
| `motormila://permits` | `Permits` |
| `motormila://price-index` | `PriceIndex` |
| `motormila://guide/{key}` | `PulseGuide` |
| `motormila://cars/{make}` / `motormila://make/{make}` | `MakeHub` |
| `motormila://cars/{make}/{model}` | `MakeModelHub` |
| `motormila://locations/{district}` | `DistrictHub` |
| `https://motormila.pages.dev/cars/{make}[/{model}]` | `MakeHub` / `MakeModelHub` |
| `https://motormila.pages.dev/locations/{district}` | `DistrictHub` |
| `https://motormila.pages.dev/calculator` | `Calculator` |
| `https://motormila.pages.dev/privacy` | `Privacy` |
| `https://motormila.pages.dev/terms` | `Terms` |
| `https://motormila.pages.dev/permits` | `Permits` |
| `https://motormila.pages.dev/price-index` | `PriceIndex` |
| `https://motormila.pages.dev/trends` | `Insights` |
| `https://motormila.pages.dev/estimate` | `Valuation` |
| `https://motormila.pages.dev/best-picks` | `BestPicks` |
| `https://motormila.pages.dev/compare?ids=` | `Compare` |
| `https://motormila.pages.dev/compare/12-vs-45` | `Compare` |
| `https://motormila.pages.dev/dealer` | `Dealer` |
| `https://motormila.pages.dev/settings` | `Settings` |
| `https://motormila.pages.dev/alerts` | `Alerts` |
| `https://motormila.pages.dev/sign-in` | `Login()` |
| `https://motormila.pages.dev/sign-up?token=` | `Login(token, signup=true)` |
| `https://motormila.pages.dev/pro` | `Pro` |
| `https://motormila.pages.dev/official-pulse` | `OfficialPulse` |
| `https://motormila.pages.dev/pricing` `/docs` `/admin` `/ev-hub` `/ev-chargers` | matching screens |
| `https://motormila.pages.dev/` | `Home` |

Splash always runs on a cold start (unless ACTION_SEND → ShareImport). After
splash the deep-link target is used instead of always Home. `onNewIntent`
updates Compose state (no `recreate()`).

## Shortcuts (`res/xml/shortcuts.xml`) — wired end-to-end

Labels use existing `strings.xml` names (`shortcut_scan_plate_short` / `_long`,
`shortcut_voice_search_*`, `shortcut_deal_of_day_*`, `shortcut_watchlist_*`).

| Id | Intent data | Destination |
|---|---|---|
| `scan_plate` | `motormila://scan` | PlateScan |
| `voice_search` | `motormila://search?voice=true` | Search (pendingVoice → recogniser) |
| `deal_of_day` | `motormila://home?dealOfDay=true` | BestPicks |
| `watchlist` | `motormila://watchlist` | Watchlist |

## Rules for screen builders

- All static strings via resources; content descriptions on icon buttons/nav.
- 48dp minimum touch targets.
- No Android framework imports in data/domain layers (app/ui may use them).
- Dark-first tokens only from `ui.theme` (`MotormilaGold`, surfaces, …).
- Haptics via `rememberHaptics()`; motion via `emphasizedTween()`/`pressSpring()`.
- Do NOT rename landed-screen parameters — the graph calls them by name.
