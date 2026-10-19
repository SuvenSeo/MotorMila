# MotorMila R8 rules (release: isMinifyEnabled = true, isShrinkResources = true).
# Most libraries ship their own consumer rules (Retrofit 2.11, OkHttp, Room,
# Hilt/Dagger, WorkManager, Compose, Billing, DataStore, Coil 3, ML Kit).
# These rules cover what is app-specific or reflection-driven.
# Verify after any change with:  ./gradlew :app:assemblePlayRelease -PmotormilaAllowUnsignedRelease=true
# then smoke-test the APK (cold start, search, detail, login, Pro screen).

# Readable crash stack traces (mapping.txt is uploaded to Play Console).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# --- Generic signatures / annotations (Retrofit suspend + Response<T>) ---
-keepattributes Signature, InnerClasses, EnclosingMethod, Exceptions
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations, AnnotationDefault
-keepattributes *Annotation*

# --- kotlinx.serialization (official rules + app DTOs / nav routes) ---
-dontnote kotlinx.serialization.**
-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1> {
    static <1>$Companion Companion;
}
-if @kotlinx.serialization.Serializable class ** {
    static **$* *;
}
-keepclassmembers class <2>$<3> {
    kotlinx.serialization.KSerializer serializer(...);
}
-if @kotlinx.serialization.Serializable class ** {
    public static ** INSTANCE;
}
-keepclassmembers class <1> {
    public static <1> INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclasseswithmembernames class * {
    kotlinx.serialization.KSerializer serializer(...);
}
# All @Serializable app classes: DTOs (data/remote/dto), type-safe nav routes
# (ui/navigation), update manifest (core/updates). Field names drive JSON keys
# via @SerialName/defaults, so keep members too.
-keep @kotlinx.serialization.Serializable class lk.motormila.app.** { *; }
-keepclassmembers @kotlinx.serialization.Serializable class lk.motormila.app.** { *; }
-keep class lk.motormila.app.ui.navigation.** { *; }

# --- Retrofit service interface (proxied by reflection) ---
-keep,allowobfuscation interface lk.motormila.app.data.remote.MotormilaApiService
-keep,allowobfuscation interface lk.motormila.app.data.remote.SnapshotApiService
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-dontwarn retrofit2.**

# --- OkHttp optional TLS providers (not on Android) ---
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-dontwarn okio.**

# --- Room (entities are referenced by generated code; keep DB + DAO) ---
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao interface *
-dontwarn androidx.room.paging.**

# --- WorkManager: workers are instantiated reflectively by class name ---
-keep class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}

# --- Hilt entry points used via EntryPointAccessors (workers, widget) ---
-keep @dagger.hilt.EntryPoint interface * { *; }

# --- Widget opens MainActivity via Class.forName ---
-keep class lk.motormila.app.MainActivity

# --- ML Kit text recognition ---
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_text_common.** { *; }
-dontwarn com.google.mlkit.**

# --- Compile-only annotations referenced by libraries ---
-dontwarn javax.annotation.**
-dontwarn com.google.errorprone.annotations.**
-dontwarn org.jetbrains.annotations.**
-dontwarn kotlinx.serialization.**
