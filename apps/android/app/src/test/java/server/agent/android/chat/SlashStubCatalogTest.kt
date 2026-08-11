package server.agent.android.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SlashStubCatalogTest {
    @Test
    fun detectsSlashQueryAtEndOfComposer() {
        assertEquals("", activeSlashQuery("/"))
        assertEquals("stu", activeSlashQuery("hello /stu"))
        assertNull(activeSlashQuery("hello /stu world"))
        assertNull(activeSlashQuery("no slash here"))
    }

    @Test
    fun filtersStubCatalogByPrefix() {
        val matches = filterSlashStubs("stub-s")
        assertEquals(listOf("stub-skill"), matches.map { it.name })
    }

    @Test
    fun insertsSelectedStubOverSlashToken() {
        assertEquals(
            "hello /stub-skill ",
            insertSlashStub("hello /stu", "stub-skill"),
        )
        assertEquals(
            "/stub-help ",
            insertSlashStub("/", "stub-help"),
        )
    }

    @Test
    fun emptyFilterCatalogIsSafe() {
        val matches = filterSlashStubs("zzz", catalog = emptyList())
        assertTrue(matches.isEmpty())
    }
}
