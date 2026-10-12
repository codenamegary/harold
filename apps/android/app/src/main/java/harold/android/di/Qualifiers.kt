package harold.android.di

import javax.inject.Qualifier

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class AuthenticatedClient

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class PairingClient

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ApplicationScope

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class PreviewDispatcher

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class SilenceScheduler

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class RestartScheduler
