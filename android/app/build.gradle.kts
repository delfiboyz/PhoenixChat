import com.android.build.api.variant.FilterConfiguration
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

plugins {
    id("com.android.application")
}

// Kunci rilis opsional: android/keystore.properties (storeFile, storePassword, keyAlias, keyPassword).
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "app.chatlokal"
    compileSdk {
        version = release(37) { minorApiLevel = 1 }
    }

    defaultConfig {
        applicationId = "app.chatlokal"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    // Satu APK per arsitektur (Tor + bridge cukup besar), plus satu APK universal.
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86_64")
            isUniversalApk = true
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

// Antarmuka yang sama dengan versi desktop: hasil `npm run build` di akar repo,
// disalin ke aset APK di bawah web/.
abstract class CopyWebUi : DefaultTask() {
    @get:InputDirectory
    abstract val dist: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val src = dist.get().asFile
        if (!src.resolve("index.html").exists()) {
            throw GradleException("Antarmuka belum dibangun. Jalankan `npm run build` di akar repo terlebih dahulu.")
        }
        val out = outputDir.get().asFile
        out.deleteRecursively()
        src.copyRecursively(out.resolve("web"), overwrite = true)
    }
}

val copyWebUi = tasks.register<CopyWebUi>("copyWebUi") {
    dist.set(rootProject.layout.projectDirectory.dir("../dist"))
    outputDir.set(layout.buildDirectory.dir("generated/webui"))
}

// versionCode per arsitektur (versionCode×10 + kode ABI), agar F-Droid dan Play bisa
// membedakan APK split: universal=0, armeabi-v7a=1, arm64-v8a=2, x86_64=3.
val abiCodes = mapOf("armeabi-v7a" to 1, "arm64-v8a" to 2, "x86_64" to 3)

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyWebUi, CopyWebUi::outputDir)
        variant.outputs.forEach { output ->
            val abi = output.filters.find { it.filterType == FilterConfiguration.FilterType.ABI }?.identifier
            val base = output.versionCode.get() ?: 1
            output.versionCode.set(base * 10 + (abiCodes[abi] ?: 0))
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-ktx:1.11.0")

    // Tor resmi dari Guardian Project (berjalan di dalam proses aplikasi) + port kontrol.
    implementation("info.guardianproject:tor-android:0.4.9.14")
    implementation("info.guardianproject:jtorctl:0.4.5.7")
    // Bridge obfs4 / Snowflake.
    implementation("com.netzarchitekten:IPtProxy:5.7.0")

    // libsodium: crypto_box kompatibel dengan tweetnacl di desktop.
    implementation("com.goterl:lazysodium-android:5.2.0@aar")
    implementation("net.java.dev.jna:jna:5.17.0@aar")

    implementation("org.nanohttpd:nanohttpd:2.3.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}
