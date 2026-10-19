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
    // API 36 (Android 16): Play requires targetSdk 36 for updates from
    // 1 Nov 2026 (extension deadline). AGP 8.9.1+ supports compileSdk 36.
    compileSdk = 36

    defaultConfig {
        applicationId = "lk.motormila.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 17
        versionName = "1.6.5"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
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
        }
        release {
            buildConfigField(
                "String",
                "BASE_URL",
                "\"https://seo292-vehicle-platform-backend.hf.space/api/v1\"",
            )
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

ksp {
    // Exported Room schemas back the migration tests (commit app/schemas/).
    arg("room.schemaLocation", "$projectDir/schemas")
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

    // Images
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
