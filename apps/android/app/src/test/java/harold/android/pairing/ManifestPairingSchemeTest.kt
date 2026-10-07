package harold.android.pairing

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

class ManifestPairingSchemeTest {

    @Test
    fun pinsManifestPairingSchemeAndHostToParserConstants() {
        val candidates = listOf(
            File("src/main/AndroidManifest.xml"),
            File("apps/android/app/src/main/AndroidManifest.xml"),
        )
        val manifestFile = candidates.firstOrNull { it.exists() }
        assertNotNull("AndroidManifest.xml should exist", manifestFile)

        val factory = DocumentBuilderFactory.newInstance()
        val builder = factory.newDocumentBuilder()
        val doc = builder.parse(manifestFile)

        val activities = doc.getElementsByTagName("activity")
        var mainActivity: Element? = null
        for (i in 0 until activities.length) {
            val element = activities.item(i) as Element
            if (element.getAttribute("android:name") == ".MainActivity") {
                mainActivity = element
                break
            }
        }
        assertNotNull("MainActivity should be declared in AndroidManifest.xml", mainActivity)

        val intentFilters = mainActivity!!.getElementsByTagName("intent-filter")
        var pairingFilter: Element? = null

        for (i in 0 until intentFilters.length) {
            val filter = intentFilters.item(i) as Element
            val actions = filter.getElementsByTagName("action")
            val categories = filter.getElementsByTagName("category")

            val hasViewAction = (0 until actions.length).any {
                (actions.item(it) as Element).getAttribute("android:name") == "android.intent.action.VIEW"
            }
            val hasDefaultCategory = (0 until categories.length).any {
                (categories.item(it) as Element).getAttribute("android:name") == "android.intent.category.DEFAULT"
            }
            val hasBrowsableCategory = (0 until categories.length).any {
                (categories.item(it) as Element).getAttribute("android:name") == "android.intent.category.BROWSABLE"
            }

            if (hasViewAction && hasDefaultCategory && hasBrowsableCategory) {
                pairingFilter = filter
                break
            }
        }

        assertNotNull(
            "MainActivity should declare an intent-filter with VIEW action, DEFAULT category, and BROWSABLE category",
            pairingFilter,
        )

        val dataNodes = pairingFilter!!.getElementsByTagName("data")
        assertTrue("Pairing intent-filter must declare a <data> element", dataNodes.length > 0)

        val dataElement = dataNodes.item(0) as Element
        assertEquals(
            "Manifest scheme must match DefaultPairingPayloadParser.SCHEME",
            DefaultPairingPayloadParser.SCHEME,
            dataElement.getAttribute("android:scheme"),
        )
        assertEquals(
            "Manifest host must match DefaultPairingPayloadParser.HOST",
            DefaultPairingPayloadParser.HOST,
            dataElement.getAttribute("android:host"),
        )
    }
}
