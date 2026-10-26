# JNA + libsodium dipanggil lewat refleksi/JNI.
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }
-keep class com.goterl.lazysodium.** { *; }
-dontwarn java.awt.**
# Tor dan bridge (JNI / gomobile).
-keep class org.torproject.jni.** { *; }
-keep class net.freehaven.tor.control.** { *; }
-keep class IPtProxy.** { *; }
-keep class go.** { *; }
# Jembatan JavaScript WebView.
-keepclassmembers class app.chatlokal.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
