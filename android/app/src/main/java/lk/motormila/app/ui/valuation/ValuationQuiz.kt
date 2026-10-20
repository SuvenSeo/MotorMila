package lk.motormila.app.ui.valuation

/**
 * Valuation quiz — pure logic, a port of the web's src/lib/estimateQuiz.ts.
 *
 * The market range always comes from comparable asking prices (live estimate
 * API). The condition quiz never changes those numbers: it only says where in
 * the range this car is likely to sit, and flags what buyers will check. We
 * have no data to price an accident or a flood in rupees, so we don't.
 */
object ValuationQuiz {

    enum class Registration(val apiValue: String) {
        USED("used"),
        RECONDITIONED("reconditioned"),
        BRAND_NEW("brand_new"),
    }

    enum class Question { ACCIDENTS, SERVICE, OWNERS, FLOOD, MODS }

    val questions: List<Question> = Question.entries

    /** Answer keys per question, in display order (same keys as web). */
    val options: Map<Question, List<String>> = mapOf(
        Question.ACCIDENTS to listOf("none", "minor", "major"),
        Question.SERVICE to listOf("full", "partial", "none"),
        Question.OWNERS to listOf("1", "2", "3plus"),
        Question.FLOOD to listOf("no", "unsure", "yes"),
        Question.MODS to listOf("none", "minor", "major"),
    )

    private val points: Map<Question, Map<String, Int>> = mapOf(
        Question.ACCIDENTS to mapOf("none" to 1, "minor" to -1, "major" to -3),
        Question.SERVICE to mapOf("full" to 1, "partial" to 0, "none" to -1),
        Question.OWNERS to mapOf("1" to 1, "2" to 0, "3plus" to -1),
        Question.FLOOD to mapOf("no" to 0, "unsure" to -1, "yes" to -4),
        Question.MODS to mapOf("none" to 0, "minor" to 0, "major" to -1),
    )

    enum class Position { UPPER, MIDDLE, LOWER }

    enum class Severity { HIGH, MEDIUM }

    data class Flag(val question: Question, val severity: Severity)

    data class Band(val from: Double, val to: Double)

    fun score(answers: Map<Question, String>): Int =
        answers.entries.sumOf { (q, a) -> points[q]?.get(a) ?: 0 }

    fun position(answers: Map<Question, String>): Position {
        // Any serious red flag caps the position at the bottom third.
        if (answers[Question.FLOOD] == "yes" || answers[Question.ACCIDENTS] == "major") return Position.LOWER
        val s = score(answers)
        return when {
            s >= 2 -> Position.UPPER
            s <= -2 -> Position.LOWER
            else -> Position.MIDDLE
        }
    }

    fun flags(answers: Map<Question, String>): List<Flag> = buildList {
        when (answers[Question.FLOOD]) {
            "yes" -> add(Flag(Question.FLOOD, Severity.HIGH))
            "unsure" -> add(Flag(Question.FLOOD, Severity.MEDIUM))
        }
        when (answers[Question.ACCIDENTS]) {
            "major" -> add(Flag(Question.ACCIDENTS, Severity.HIGH))
            "minor" -> add(Flag(Question.ACCIDENTS, Severity.MEDIUM))
        }
        if (answers[Question.SERVICE] == "none") add(Flag(Question.SERVICE, Severity.MEDIUM))
        if (answers[Question.MODS] == "major") add(Flag(Question.MODS, Severity.MEDIUM))
        if (answers[Question.OWNERS] == "3plus") add(Flag(Question.OWNERS, Severity.MEDIUM))
    }

    /** The third of [low, high] matching a position. */
    fun band(low: Double, high: Double, position: Position): Band {
        val lo = minOf(low, high)
        val hi = maxOf(low, high)
        val third = (hi - lo) / 3.0
        return when (position) {
            Position.LOWER -> Band(lo, lo + third)
            Position.UPPER -> Band(hi - third, hi)
            Position.MIDDLE -> Band(lo + third, hi - third)
        }
    }

    /** Progress 0..1 across Car → Details → Condition (per question) → Result. */
    fun progress(step: Int, questionIndex: Int): Float =
        if (step == 2) ((2f + questionIndex.toFloat() / questions.size) / 3f) else (step / 3f)

    fun step1Valid(registration: Registration?, mileage: String): Boolean {
        if (registration == null) return false
        if (registration == Registration.BRAND_NEW) return true
        return mileage.filter { it.isDigit() }.isNotEmpty()
    }

    fun mileageKm(registration: Registration?, mileage: String): Int {
        val digits = mileage.filter { it.isDigit() }
        if (digits.isEmpty()) return 0
        return digits.take(7).toInt()
    }

    /** A live result is usable only with a non-zero range. */
    fun usable(low: Double, median: Double, high: Double): Boolean = low > 0 && median > 0 && high > 0

    fun years(nowYear: Int): List<Int> = (nowYear + 1 downTo 1990).toList()
}
