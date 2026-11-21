package lk.motormila.app.ui.auth

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

/** Offline JVM contract: a translated auth action must not fall back to English or lose a format argument. */
class BuyerAuthResourcesTest {
    private fun strings(folder: String): Map<String, String> {
        val resource = File("src/main/res/$folder/buyer_auth_strings.xml")
        assertTrue("Missing $resource", resource.isFile)
        val entries = DocumentBuilderFactory.newInstance().newDocumentBuilder()
            .parse(resource).getElementsByTagName("string")
        return (0 until entries.length).associate { index ->
            val entry = entries.item(index) as Element
            entry.getAttribute("name") to entry.textContent.trim()
        }
    }

    @Test fun allAuthCopyIsTranslatedWithTheSameFormatArguments() {
        val english = strings("values")
        val arguments = Regex("%[0-9]+\\$[ds]")
        assertTrue(english.isNotEmpty())
        for (folder in listOf("values-si", "values-ta")) {
            val translated = strings(folder)
            assertEquals(folder, english.keys, translated.keys)
            for ((name, original) in english) {
                val text = translated.getValue(name)
                assertTrue("$folder/$name is blank", text.isNotBlank())
                assertNotEquals("$folder/$name is English", original, text)
                assertEquals("$folder/$name arguments", arguments.findAll(original).map { it.value }.sorted().toList(),
                    arguments.findAll(text).map { it.value }.sorted().toList())
            }
        }
    }
}
