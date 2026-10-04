package harold.android

import android.content.Context
import harold.android.di.AppContainer
import harold.android.di.DefaultAppContainer

class HaroldApplication : android.app.Application() {
    lateinit var appContainer: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        appContainer = DefaultAppContainer(applicationContext)
    }
}
