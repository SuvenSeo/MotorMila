// Root build file — plugin versions are resolved via the version catalog
// (android/gradle/libs.versions.toml). No app config lives here.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.test) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.hilt) apply false
    alias(libs.plugins.serialization) apply false
    alias(libs.plugins.paparazzi) apply false
}
