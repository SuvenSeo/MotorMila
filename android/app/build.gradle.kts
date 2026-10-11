import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
    alias(libs.plugins.serialization)
}

android {
    namespace = "lk.motormila.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "lk.motormila.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 14
        versionName = "1.6.2"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
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

    signingConfigs {
        // Sideload / GitHub Release preview. Resolution order:
        // 1. ANDROID_KEYSTORE_FILE env — a keystore FILE PATH staged by CI
        //    (workflows base64-decode the ANDROID_KEYSTORE_FILE secret to a
        //    fixed path first; the raw base64 blob is never passed here)
        // 2. the committed ci-signing.keystore — one stable signature so every
        //    release installs over the previous one (in-app self-update works)
        // 3. the local SDK debug key (machine-local fallback)
        create("sideload") {
            // Blank-tolerant: CI passes unset secrets to Gradle as empty
            // strings, and file("") throws IllegalArgumentException at
            // configuration time (this broke the 2026-10-06 release build).
            // Empty == absent for every signing input.
            fun envOrNull(name: String): String? =
                providers.environmentVariable(name).orNull?.takeIf { it.isNotBlank() }
            val committedKey = rootProject.file("ci-signing.keystore").takeIf { it.exists() }
            storeFile = envOrNull("ANDROID_KEYSTORE_FILE")?.let { file(it) }
                ?: committedKey
                ?: file("${System.getProperty("user.home")}/.android/debug.keystore")
            storePassword = envOrNull("ANDROID_KEYSTORE_PASSWORD") ?: "android"
            keyAlias = envOrNull("ANDROID_KEY_ALIAS") ?: "androiddebugkey"
            keyPassword = envOrNull("ANDROID_KEY_PASSWORD") ?: "android"
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
            signingConfig = signingConfigs.getByName("sideload")
            isMinifyEnabled = false // v1: avoid R8 risk; proguard file kept for v2
            isShrinkResources = false
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
}
