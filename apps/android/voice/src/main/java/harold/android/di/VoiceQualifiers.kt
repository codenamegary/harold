
package harold.android.di

import javax.inject.Qualifier

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class SilenceScheduler

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class RestartScheduler
