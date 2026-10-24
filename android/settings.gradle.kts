pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "motormila"
include(":app")
// Baseline Profile generator + macrobenchmarks (run on a CI emulator against
// the non-debuggable `preview` build; see baselineprofile/README.md).
include(":baselineprofile")
