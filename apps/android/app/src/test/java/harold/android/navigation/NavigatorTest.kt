package harold.android.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class NavigatorTest {
    @Test
    fun coldStartIsUnknownUntilARouteIsChosenOnce() {
        val navigator = Navigator()

        assertEquals(StartGate.Unknown, navigator.startGate)
        assertEquals(emptyList<Any>(), navigator.backStack.toList())

        navigator.chooseStart(Chat)
        navigator.chooseStart(Shell)
        navigator.openSessions()

        assertEquals(StartGate.Paired, navigator.startGate)
        assertEquals(listOf(Chat, Sessions), navigator.backStack.toList())
    }

    @Test
    fun pairingSuccessReplacesTheStackWithChat() {
        val navigator = Navigator()
        navigator.chooseStart(Shell)
        navigator.openPairing()

        navigator.showChat()

        assertEquals(listOf(Chat), navigator.backStack.toList())
    }

    @Test
    fun pairingRequestedBeforeStartSitsOnTopOfTheChosenRoute() {
        val navigator = Navigator()

        navigator.openPairing()
        assertEquals(emptyList<Any>(), navigator.backStack.toList())

        navigator.chooseStart(Shell)

        assertEquals(listOf(Shell, Pairing), navigator.backStack.toList())
    }

    @Test
    fun backFromTheRootLeavesTheStackInPlace() {
        val navigator = Navigator()
        navigator.chooseStart(Chat)
        navigator.openSessions()

        assertEquals(true, navigator.goBack())
        assertEquals(false, navigator.goBack())
        assertEquals(listOf(Chat), navigator.backStack.toList())
    }

    @Test
    fun showShellReplacesWhateverIsShowing() {
        val navigator = Navigator()
        navigator.chooseStart(Chat)
        navigator.openWorkspaces()

        navigator.showShell()

        assertEquals(StartGate.Paired, navigator.startGate)
        assertEquals(listOf(Shell), navigator.backStack.toList())
        assertFalse(navigator.backStack.contains(Workspaces))
    }
}
