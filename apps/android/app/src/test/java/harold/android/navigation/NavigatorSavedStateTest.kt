package harold.android.navigation

import android.os.Bundle
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.HiltTestApplication
import harold.android.MainActivity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@HiltAndroidTest
@RunWith(RobolectricTestRunner::class)
@Config(application = HiltTestApplication::class, sdk = [34])
class NavigatorSavedStateTest {
    @get:Rule
    val hiltRule = HiltAndroidRule(this)

    @Test
    fun backStackComesBackInANewActivityAfterProcessDeath() {
        val first = Robolectric.buildActivity(MainActivity::class.java).create()
        val before = first.get().navigator
        before.start(paired = true)
        before.openSessions()
        val saved = Bundle()
        first.saveInstanceState(saved)

        val second = Robolectric.buildActivity(MainActivity::class.java).create(saved)
        val after = second.get().navigator

        assertNotSame(before, after)
        assertEquals(listOf(Chat, Sessions), after.backStack.toList())
    }
}
