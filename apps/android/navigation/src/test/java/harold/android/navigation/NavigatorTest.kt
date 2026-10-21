package harold.android.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NavigatorTest {
    @Test
    fun coldStartIsEmptyUntilTheStartRouteIsChosenOnce() {
        val navigator = Navigator()

        assertTrue(navigator.backStack.isEmpty())

        navigator.start(paired = true)
        navigator.start(paired = false)
        navigator.openSessions()

        assertEquals(listOf(Chat, Sessions), navigator.backStack.toList())
    }

    @Test
    fun unpairedStartShowsTheShell() {
        val navigator = Navigator()

        navigator.start(paired = false)

        assertEquals(listOf(Shell), navigator.backStack.toList())
    }

    @Test
    fun pairingSuccessReplacesTheStackWithChat() {
        val navigator = Navigator()
        navigator.start(paired = false)
        navigator.openPairing()

        navigator.showChat()

        assertEquals(listOf(Chat), navigator.backStack.toList())
    }

    @Test
    fun pairingRequestedBeforeStartSitsOnTopOfTheChosenRoute() {
        val navigator = Navigator()

        navigator.openPairing()
        assertTrue(navigator.backStack.isEmpty())

        navigator.start(paired = false)

        assertEquals(listOf(Shell, Pairing), navigator.backStack.toList())
    }

    @Test
    fun backFromTheRootLeavesTheStackInPlace() {
        val navigator = Navigator()
        navigator.start(paired = true)
        navigator.openSessions()

        assertTrue(navigator.goBack())
        assertFalse(navigator.goBack())
        assertEquals(listOf(Chat), navigator.backStack.toList())
    }

    @Test
    fun savedHaroldsOpensOnTopOfChat() {
        val navigator = Navigator()
        navigator.start(paired = true)

        navigator.openSavedHarolds()

        assertEquals(listOf(Chat, SavedHarolds), navigator.backStack.toList())
    }

    @Test
    fun showShellReplacesWhateverIsShowing() {
        val navigator = Navigator()
        navigator.start(paired = true)
        navigator.openWorkspaces()

        navigator.showShell()

        assertEquals(listOf(Shell), navigator.backStack.toList())
    }

    @Test
    fun restoredStackSurvivesAndSkipsTheStartGate() {
        val before = Navigator()
        before.start(paired = true)
        before.openSessions()
        before.openCreateSession()

        val after = Navigator()
        after.restore(before.encode())
        after.start(paired = false)

        assertEquals(listOf(Chat, Sessions, CreateSession), after.backStack.toList())
    }

    @Test
    fun unreadableSavedStackIsIgnored() {
        val navigator = Navigator()

        navigator.restore("not json")

        assertTrue(navigator.backStack.isEmpty())
    }
}
