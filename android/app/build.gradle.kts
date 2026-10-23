import org.gradle.api.tasks.testing.Test

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
    alias(libs.plugins.serialization)
    alias(libs.plugins.paparazzi)
}

data class ReleaseSigning(
    val storeFile: String,
    val storePassword: String,
    val keyAlias: String,
    val keyPassword: String,
)

fun envOrNull(name: String): String? =
    System.getenv(name)?.takeIf { it.isNotBlank() }

/** All four values present and the keystore file exists, else null. */
fun signingFromEnv(prefix: String): ReleaseSigning? {
    val file = envOrNull("${prefix}_KEYSTORE_FILE") ?: return null
    val storePassword = envOrNull("${prefix}_KEYSTORE_PASSWORD") ?: return null
    val alias = envOrNull("${prefix}_KEY_ALIAS") ?: return null
    val keyPassword = envOrNull("${prefix}_KEY_PASSWORD") ?: storePassword
    if (!File(file).isFile) return null
    return ReleaseSigning(file, storePassword, alias, keyPassword)
}

val directSigning: ReleaseSigning? = signingFromEnv("ANDROID")
val playSigning: ReleaseSigning? = signingFromEnv("PLAY_UPLOAD") ?: directSigning
val allowUnsignedRelease: Boolean =
    (findProperty("motormilaAllowUnsignedRelease") as String?)?.toBoolean() == true

android {
    namespace = "lk.motormila.app"
    // Play requires targetSdk 36 for updates from 1 Nov 2026. compileSdk 36
    // needs Paparazzi 2.x (1.3.5 crashed in Renderer.configureBuildProperties
    // on API 36's android.os.Build.VERSION_CODES_FULL) and AGP 8.10+.
    compileSdk = 36

    defaultConfig {
        applicationId = "lk.motormila.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 18
        versionName = "1.7.0-preview"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
        // QA hooks (crawl theme/lang extras, destructive DB fallback): debug +
        // preview only, never release.
        buildConfigField("boolean", "QA_HOOKS", "false")
    }

    // Two distribution channels (see docs/overhaul/android.md):
    // - play:   Google Play. Play Billing only; no self-updater, no
    //           REQUEST_INSTALL_PACKAGES, no external (bank/WhatsApp/web) checkout.
    // - direct: GitHub/R2 sideload. Self-updater with SHA-256 verification and
    //           the external checkout path (Play Billing is unavailable there).
    flavorDimensions += "distribution"
    productFlavors {
        create("play") {
            dimension = "distribution"
            buildConfigField("String", "DISTRIBUTION", "\"play\"")
            buildConfigField("boolean", "SELF_UPDATE_ENABLED", "false")
            buildConfigField("boolean", "EXTERNAL_CHECKOUT_ENABLED", "false")
            buildConfigField("boolean", "PLAY_BILLING_ENABLED", "true")
        }
        create("direct") {
            dimension = "distribution"
            buildConfigField("String", "DISTRIBUTION", "\"direct\"")
            buildConfigField("boolean", "SELF_UPDATE_ENABLED", "true")
            buildConfigField("boolean", "EXTERNAL_CHECKOUT_ENABLED", "true")
            buildConfigField("boolean", "PLAY_BILLING_ENABLED", "false")
        }
    }

    // Java 17 + Kotlin jvmToolchain(17). composeOptions is configured by the
    // org.jetbrains.kotlin.plugin.compose plugin — do not set it manually.
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin {
        jvmToolchain(17)
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    // Release signing comes ONLY from the environment (GitHub Actions secrets
    // or a local shell). Nothing secret is committed. Missing values make any
    // release packaging task fail with a clear message (see bottom of file),
    // unless -PmotormilaAllowUnsignedRelease=true is passed (CI R8 smoke build
    // that is never published).
    //   ANDROID_KEYSTORE_FILE      path to the keystore file (CI decodes the
    //                              base64 secret to a temp path first)
    //   ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
    // Play upload key (optional, falls back to the ANDROID_* values):
    //   PLAY_UPLOAD_KEYSTORE_FILE, PLAY_UPLOAD_KEYSTORE_PASSWORD,
    //   PLAY_UPLOAD_KEY_ALIAS, PLAY_UPLOAD_KEY_PASSWORD
    signingConfigs {
        // Preview/debug ONLY (lk.motormila.app.debug). A committed, well-known
        // key (passwords "android") so every CI preview APK is signed
        // identically and installs as an in-place update over the previous
        // preview. NEVER used for release: release signing comes only from
        // env/secrets below. Fingerprint (SHA-256):
        // BD:50:03:0F:71:FB:18:07:04:79:D6:8F:F8:D2:FA:BE:86:BB:B2:8F:C6:54:1E:D8:DF:C0:14:2E:09:28:14:9F
        getByName("debug") {
            storeFile = file("preview-debug.keystore")
            storePassword = "android"
            keyAlias = "motormila-preview"
            keyPassword = "android"
        }
        directSigning?.let { cfg ->
            create("directRelease") {
                storeFile = file(cfg.storeFile)
                storePassword = cfg.storePassword
                keyAlias = cfg.keyAlias
                keyPassword = cfg.keyPassword
                enableV2Signing = true
                enableV3Signing = true
            }
        }
        playSigning?.let { cfg ->
            create("playRelease") {
                storeFile = file(cfg.storeFile)
                storePassword = cfg.storePassword
                keyAlias = cfg.keyAlias
                keyPassword = cfg.keyPassword
                enableV2Signing = true
                enableV3Signing = true
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            // Point a physical-device demo build at any backend without editing code:
            //   .\gradlew.bat :app:assembleDebug -PmotormilaApiUrl=https://host/api/v1
            // or MOTORMILA_API_URL=https://host/api/v1. Default is the production HF backend.
            val debugBaseUrl = providers.environmentVariable("MOTORMILA_API_URL")
                .orElse(providers.gradleProperty("motormilaApiUrl"))
                .getOrElse("https://seo292-vehicle-platform-backend.hf.space/api/v1")
            buildConfigField(
                "String",
                "BASE_URL",
                "\"$debugBaseUrl\"",
            )
            isDebuggable = true
            buildConfigField("boolean", "QA_HOOKS", "true")
            signingConfig = signingConfigs.getByName("debug")
            // Preview self-updater channel: the debug app reads its update
            // manifest from the preview pre-release instead of production
            // (a release APK can never update the .debug package anyway).
            buildConfigField(
                "String",
                "PREVIEW_UPDATE_MANIFEST_URL",
                "\"https://github.com/SuvenSeo/Vehicle-Platform/releases/download/preview-android-1.7.0/preview-latest.json\"",
            )
        }
        release {
            buildConfigField(
                "String",
                "BASE_URL",
                "\"https://seo292-vehicle-platform-backend.hf.space/api/v1\"",
            )
            buildConfigField("String", "PREVIEW_UPDATE_MANIFEST_URL", "\"\"")
            // Per-flavor signing (env only) is wired below the android block.
            signingConfig = null
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    // Preview sideload channel (GitHub pre-release preview-android-1.7.0).
    // Same package as the old debug preview (lk.motormila.app.debug) and the
    // same committed preview key, so it installs in place over every earlier
    // preview, but NOT debuggable: R8-minified + resource-shrunk like release
    // (debuggable Compose runs uncompiled and stutters). Obfuscation is off
    // (proguard-preview.pro) so the generated Baseline Profile keeps source
    // names and preview crash traces stay readable. Profileable from shell
    // (src/preview/AndroidManifest.xml) for macrobenchmark / baseline profile.
    // Release signing, the release build type and android-release.yml are
    // untouched.
    buildTypes {
        create("preview") {
            initWith(getByName("release"))
            applicationIdSuffix = ".debug"
            // defaultConfig versionName is already "1.7.0-preview".
            versionNameSuffix = null
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
                "proguard-preview.pro",
            )
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
            buildConfigField("boolean", "QA_HOOKS", "true")
            buildConfigField(
                "String",
                "PREVIEW_UPDATE_MANIFEST_URL",
                "\"https://github.com/SuvenSeo/Vehicle-Platform/releases/download/preview-android-1.7.0/preview-latest.json\"",
            )
        }
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            excludes += "META-INF/DEPENDENCIES"
            excludes += "META-INF/LICENSE*"
            excludes += "META-INF/NOTICE*"
        }
    }

    sourceSets {
        getByName("main") {
            // Defaults: manifest, java, res, assets. Declared for clarity.
            manifest.srcFile("src/main/AndroidManifest.xml")
        }
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
    }

    // Show test stdout in CI logs (diagnosing ViewModel dispatcher behaviour).
    tasks.withType<Test> {
        testLogging {
            showStandardStreams = true
        }
    }
}

// Preview builds: CI passes MOTORMILA_PREVIEW_VERSION_CODE (minutes since the
// Unix epoch, monotonic across workflows) so each preview APK has a higher
// versionCode than the last and installs/self-updates in place. Debug only;
// release versionCodes stay the defaultConfig value.
val previewVersionCode: Int? = envOrNull("MOTORMILA_PREVIEW_VERSION_CODE")?.toIntOrNull()
androidComponents {
    onVariants(selector().withBuildType("debug")) { variant ->
        previewVersionCode?.let { code ->
            variant.outputs.forEach { it.versionCode.set(code) }
        }
    }
    onVariants(selector().withBuildType("preview")) { variant ->
        previewVersionCode?.let { code ->
            variant.outputs.forEach { it.versionCode.set(code) }
        }
    }
}

ksp {
    // Exported Room schemas back the migration tests (commit app/schemas/).
    arg("room.schemaLocation", "$projectDir/schemas")
}

// Room schema export races when the play/direct KSP tasks run in parallel
// (org.gradle.parallel=true): both variants share $projectDir/schemas and
// Room's exportSchema() reads the schema file back while the other task is
// still writing it, failing with "IllegalStateException: Empty schema file"
// (seen on CI for :app:kspDirectDebugKotlin). The schema is
// flavor-independent, so serialize the KSP tasks instead of the whole build.
tasks.configureEach {
    if (name.matches(Regex("^kspDirect\\w*Kotlin$"))) {
        mustRunAfter(tasks.matching { it.name.matches(Regex("^kspPlay\\w*Kotlin$")) })
    }
}

// Wire per-flavor release signing.
android.productFlavors.getByName("direct").signingConfig =
    android.signingConfigs.findByName("directRelease")
android.productFlavors.getByName("play").signingConfig =
    android.signingConfigs.findByName("playRelease")

// Fail release packaging loudly when signing env is missing (never fall back
// to a committed/public key again). Debug and unit-test tasks are unaffected.
gradle.taskGraph.whenReady {
    val releaseTaskRe = Regex("^(assemble|bundle|package)(Play|Direct)?Release$")
    val releaseTasks = allTasks.filter { it.project == project && releaseTaskRe.matches(it.name) }
    if (releaseTasks.isEmpty() || allowUnsignedRelease) return@whenReady
    val needsDirect = releaseTasks.any { !it.name.contains("Play") }
    val needsPlay = releaseTasks.any { !it.name.contains("Direct") }
    val missing = buildList {
        if (needsDirect && directSigning == null) {
            add("direct (ANDROID_KEYSTORE_FILE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD)")
        }
        if (needsPlay && playSigning == null) {
            add("play (PLAY_UPLOAD_KEYSTORE_* or ANDROID_KEYSTORE_*)")
        }
    }
    if (missing.isNotEmpty()) {
        throw GradleException(
            "MotorMila release signing is not configured for: ${missing.joinToString("; ")}. " +
                "Set the env vars / GitHub secrets (see docs/overhaul/android.md, 'Signing'). " +
                "The committed sideload keystore was removed on purpose. " +
                "For a non-publishable R8 smoke build pass -PmotormilaAllowUnsignedRelease=true.",
        )
    }
}

dependencies {
    // Compose BOM — versions for all compose artifacts
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.animation.graphics) // brand v2 splash AVD
    androidTestImplementation(platform(libs.compose.bom))

    // Compose UI
    implementation(libs.ui)
    implementation(libs.ui.graphics)
    implementation(libs.ui.tooling.preview)
    debugImplementation(libs.ui.tooling)
    implementation(libs.material3)
    implementation(libs.material3.window.size)
    implementation(libs.material.icons.core)
    implementation(libs.material.icons.extended)
    implementation(libs.activity.compose)
    implementation(libs.core.ktx)
    implementation(libs.appcompat)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)

    // Navigation
    implementation(libs.navigation.compose)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.hilt.work)

    // Work
    implementation(libs.work.runtime.ktx)

    // Network
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.serialization.json)

    // Storage
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    implementation(libs.room.paging)
    ksp(libs.room.compiler)
    implementation(libs.datastore.preferences)

    // Paging
    implementation(libs.paging.runtime)
    implementation(libs.paging.compose)

    // Startup: compiles src/main/baseline-prof.txt on install (sideload too).
    implementation(libs.androidx.profileinstaller)

    // Images
    // Backdrop blur (liquid-glass chrome); RenderEffect on API 31+, tinted scrim below.
    implementation(libs.haze)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)

    // CameraX plate scan
    implementation(libs.camerax.core)
    implementation(libs.camerax.camera2)
    implementation(libs.camerax.lifecycle)
    implementation(libs.camerax.view)

    // ML Kit
    implementation(libs.mlkit.text.recognition)

    // Billing
    implementation(libs.play.billing.ktx)

    // Coroutines
    implementation(libs.coroutines.core)
    implementation(libs.coroutines.android)

    // Unit tests
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.turbine)
    testImplementation(libs.mockk)
    testImplementation(libs.room.testing)
    // Screenshot (Paparazzi) + functional (Robolectric) tests — JVM only, no emulator.
    testImplementation(libs.paparazzi)
}

// Preview builds skip lint-vital (it runs for every non-debuggable variant and
// only duplicates the release lint gate); release variants are unaffected.
tasks.configureEach {
    if (name.startsWith("lintVital") && name.contains("Preview")) enabled = false
}
