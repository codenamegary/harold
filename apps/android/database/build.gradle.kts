plugins {
    alias(libs.plugins.harold.android.library)
    alias(libs.plugins.harold.android.hilt)
}

android {
    namespace = "harold.android.database"
}

dependencies {
    api(project(":contracts"))
    implementation(project(":api"))
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    api(libs.kotlinx.coroutines.android)
    ksp(libs.androidx.room.compiler)

    testImplementation(libs.bundles.unit.test)
    kspTest(libs.androidx.room.compiler)
}
