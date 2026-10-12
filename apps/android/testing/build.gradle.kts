plugins {
    alias(libs.plugins.harold.android.library)
}

android {
    namespace = "harold.android.testing"
}

dependencies {
    api(project(":auth"))
    api(project(":voice"))
    implementation(libs.kotlinx.coroutines.android)
}
