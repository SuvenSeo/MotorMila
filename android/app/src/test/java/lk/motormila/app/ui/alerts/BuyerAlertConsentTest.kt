package lk.motormila.app.ui.alerts

import org.junit.Assert.*
import org.junit.Test

class BuyerAlertConsentTest {
    @Test fun disablingEveryChannelDoesNotSubscribeToPush() {
        val form = AlertForm(make = "Honda", maxPrice = "4m", inapp = false, push = false)
        assertTrue(form.selectedNotifyChannels(false).isEmpty())
        assertNull(form.toAlertInput(false))
    }

    @Test fun aNewAlertDoesNotPreselectExternalDelivery() {
        assertEquals(listOf("inapp"), AlertForm().selectedNotifyChannels(false))
    }
}
