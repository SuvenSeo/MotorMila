package lk.motormila.app.core.network

/** Local OkHttp request tag, never a header. Prevent queued account actions from acquiring a different bearer. */
class AlertSessionGuard(private val expected: String) {
    fun matches(current: String?) = current != null && current == expected
    override fun toString() = "AlertSessionGuard"
}
