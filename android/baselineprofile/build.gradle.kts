// Baseline Profile generator + macrobenchmarks for MotorMila.
//
// A com.android.test module targeting :app's `directPreview` variant (the
// non-debuggable, R8-minified-but-not-obfuscated preview build, so generated
// profile rules keep source names). Built in CI with
// `:baselineprofile:assemblePreview`, then run on an emulator with
// `adb shell am instrument` (.github/workflows/android-apple-polish-preview.yml):
//   - BaselineProfileGenerator -> *-baseline-prof.txt, committed to
//     app/src/main/baseline-prof.txt
//   - *Benchmark classes        -> FrameTimingMetric / StartupTimingMetric JSON
plugins {
    alias(libs.plugins.android.test)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "lk.motormila.baselineprofile"
    compileSdk = 36

    defaultConfig {
        minSdk = 28
        targetSdk = 36
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // :app has a `distribution` flavor dimension; profile the sideload flavor.
        missingDimensionStrategy("distribution", "direct")
    }

    buildTypes {
        create("preview") {
            isDebuggable = true
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin {
        jvmToolchain(17)
    }

    targetProjectPath = ":app"
    experimentalProperties["android.experimental.self-instrumenting"] = true
}

androidComponents {
    beforeVariants(selector().all()) { variant ->
        variant.enable = variant.buildType == "preview"
    }
}

dependencies {
    implementation(libs.androidx.test.junit)
    implementation(libs.androidx.test.runner)
    implementation(libs.uiautomator)
    implementation(libs.benchmark.macro.junit4)
}
