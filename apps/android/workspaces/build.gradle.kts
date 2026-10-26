plugins {
    alias(libs.plugins.harold.android.feature)
    alias(libs.plugins.harold.android.hilt)
}

android {
    namespace = "harold.android.workspaces"
}

dependencies {
    implementation(project(":navigation"))
    implementation(project(":contracts"))
    implementation(project(":api"))
    implementation(project(":database"))
    implementation(project(":auth"))
    implementation(project(":design"))
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.bundles.feature)
    implementation(libs.bundles.compose.ui)
    debugImplementation(libs.bundles.compose.debug)

    testImplementation(project(":testing"))
    testImplementation(libs.bundles.unit.test)
    testImplementation(libs.androidx.compose.ui.test.junit4)
}
