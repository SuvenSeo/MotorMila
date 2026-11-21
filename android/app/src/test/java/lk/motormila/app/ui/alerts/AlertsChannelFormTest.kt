package lk.motormila.app.ui.alerts

import lk.motormila.app.domain.model.Alert
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AlertsChannelFormTest {

    @Test
    fun selectedNotifyChannels_proIncludesAllToggles() {
        val form = AlertForm(
            inapp = true,
            email = true,
            whatsapp = true,
            telegram = true,
            push = true,
        )
        assertEquals(
            listOf("inapp", "email", "whatsapp", "telegram", "push"),
            form.selectedNotifyChannels(isPro = true),
        )
    }

    @Test
    fun selectedNotifyChannels_freeStripsProChannels() {
        val form = AlertForm(
            inapp = true,
            email = true,
            whatsapp = true,
            telegram = true,
            push = true,
        )
        // In-app/email/push are free; only WhatsApp/Telegram are Pro-gated.
        assertEquals(listOf("inapp", "email", "push"), form.selectedNotifyChannels(isPro = false))
    }

    @Test
    fun toAlertInput_proSendsPhoneTelegramDeliveryAndQuietHours() {
        val input = AlertForm(
            make = "Toyota",
            maxPrice = "8m",
            whatsappPhone = "0771234567",
            telegramChatId = "99",
            whatsapp = true,
            telegram = true,
            inapp = true,
            email = true,
            push = true,
            digest = true,
            quietHours = false,
        ).toAlertInput(isPro = true)!!
        assertEquals("0771234567", input.notifyPhone)
        assertEquals("99", input.notifyTelegramChatId)
        assertEquals("inapp,email,whatsapp,telegram,push", input.notifyChannels)
        assertEquals("digest", input.deliveryMode)
        assertEquals(false, input.quietHoursEnabled)
    }

    @Test
    fun toAlertInput_freeOmitsProDestinations() {
        val input = AlertForm(
            make = "Honda",
            maxPrice = "5m",
            whatsappPhone = "0770000000",
            telegramChatId = "1",
            whatsapp = true,
            telegram = true,
            inapp = true,
            email = false,
            push = true,
            digest = true,
            quietHours = false,
        ).toAlertInput(isPro = false)!!
        assertNull(input.notifyPhone)
        assertNull(input.notifyTelegramChatId)
        assertEquals("inapp,push", input.notifyChannels)
        assertEquals("instant", input.deliveryMode)
        // Free users never see the quiet-hours switch, so it is never enabled for them.
        assertEquals(false, input.quietHoursEnabled)
    }

    @Test
    fun alertFormFrom_roundTripsChannelsAndDelivery() {
        val form = alertFormFrom(
            Alert(
                id = 3,
                make = "Nissan",
                model = "Leaf",
                maxPriceLkr = 8_500_000.0,
                district = "Gampaha",
                notifyPhone = "0771112223",
                notifyEmail = null,
                notifyTelegramChatId = "@yard",
                notifyChannels = "inapp,whatsapp,telegram",
                deliveryMode = "digest",
                quietHoursEnabled = false,
                createdAt = null,
            ),
        )
        assertEquals("Nissan", form.make)
        assertEquals("8.5m", form.maxPrice)
        assertTrue(form.inapp)
        assertTrue(form.whatsapp)
        assertTrue(form.telegram)
        assertFalse(form.push)
        assertTrue(form.digest)
        assertFalse(form.quietHours)
        assertEquals("0771112223", form.whatsappPhone)
        assertEquals("@yard", form.telegramChatId)
    }
}
