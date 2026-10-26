pluginManagement {
    includeBuild("build-logic")
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

rootProject.name = "harold-android"
include(
    ":app",
    ":navigation",
    ":contracts",
    ":api",
    ":database",
    ":auth",
    ":live",
    ":voice",
    ":design",
    ":testing",
    ":pairing",
    ":chat",
    ":workspaces",
    ":shell",
)
