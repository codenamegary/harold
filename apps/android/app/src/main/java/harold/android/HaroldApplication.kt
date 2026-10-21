package harold.android

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class HaroldApplication : Application() {
    @Inject lateinit var haroldConnectionHost: HaroldConnectionHost

    override fun onCreate() {
        super.onCreate()
        if (::haroldConnectionHost.isInitialized) {
            haroldConnectionHost.start()
        }
    }
}
