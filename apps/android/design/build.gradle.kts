plugins {
    alias(libs.plugins.harold.android.library)
    alias(libs.plugins.harold.android.compose)
}

android {
    namespace = "harold.android.design"
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.bundles.compose.ui)
    debugImplementation(libs.bundles.compose.debug)

    testImplementation(libs.bundles.unit.test)
    testImplementation(libs.androidx.compose.ui.test.junit4)
}
