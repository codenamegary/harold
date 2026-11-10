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

        navigator.start(hasConnection = true)
        navigator.start(hasConnection = false)
        navigator.openSessions()

        assertEquals(listOf(Chat, Sessions), navigator.backStack.toList())
    }

    @Test
    fun noConnectionStartShowsTheShell() {
        val navigator = Navigator()

        navigator.start(hasConnection = false)

        assertEquals(listOf(Shell), navigator.backStack.toList())
    }

    @Test
    fun savingAConnectionReplacesTheStackWithChat() {
        val navigator = Navigator()
        navigator.start(hasConnection = false)

        navigator.showChat()

        assertEquals(listOf(Chat), navigator.backStack.toList())
    }

    @Test
    fun addConnectionOpensSshSetup() {
        val navigator = Navigator()
        navigator.start(hasConnection = true)
        navigator.openConnections()

        navigator.openAddConnection()

        assertEquals(listOf(Chat, Connections, SshSetup), navigator.backStack.toList())
    }

    @Test
    fun backFromTheRootLeavesTheStackInPlace() {
        val navigator = Navigator()
        navigator.start(hasConnection = true)
        navigator.openSessions()

        assertTrue(navigator.goBack())
        assertFalse(navigator.goBack())
        assertEquals(listOf(Chat), navigator.backStack.toList())
    }

    @Test
    fun connectionsOpensOnTopOfChat() {
        val navigator = Navigator()
        navigator.start(hasConnection = true)

        navigator.openConnections()

        assertEquals(listOf(Chat, Connections), navigator.backStack.toList())
    }

    @Test
    fun showShellReplacesWhateverIsShowing() {
        val navigator = Navigator()
        navigator.start(hasConnection = true)
        navigator.openWorkspaces()

        navigator.showShell()

        assertEquals(listOf(Shell), navigator.backStack.toList())
    }

    @Test
    fun restoredStackSurvivesAndSkipsTheStartGate() {
        val before = Navigator()
        before.start(hasConnection = true)
        before.openSessions()
        before.openCreateSession()

        val after = Navigator()
        after.restore(before.encode())
        after.start(hasConnection = false)

        assertEquals(listOf(Chat, Sessions, CreateSession), after.backStack.toList())
    }

    @Test
    fun unreadableSavedStackIsIgnored() {
        val navigator = Navigator()

        navigator.restore("not json")

        assertTrue(navigator.backStack.isEmpty())
    }
}
