package lk.motormila.app.ui.valuation

import lk.motormila.app.ui.valuation.ValuationQuiz.Position
import lk.motormila.app.ui.valuation.ValuationQuiz.Question
import lk.motormila.app.ui.valuation.ValuationQuiz.Registration
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ValuationQuizTest {
    @Test fun cleanCarSitsUpper() {
        val a = mapOf(Question.ACCIDENTS to "none", Question.SERVICE to "full", Question.OWNERS to "1")
        assertEquals(Position.UPPER, ValuationQuiz.position(a))
        assertTrue(ValuationQuiz.flags(a).isEmpty())
    }

    @Test fun floodCapsLowerEvenWithGoodAnswers() {
        val a = mapOf(Question.FLOOD to "yes", Question.SERVICE to "full", Question.OWNERS to "1", Question.ACCIDENTS to "none")
        assertEquals(Position.LOWER, ValuationQuiz.position(a))
        assertEquals(ValuationQuiz.Severity.HIGH, ValuationQuiz.flags(a).first().severity)
    }

    @Test fun skippedQuestionsAreMiddle() {
        assertEquals(Position.MIDDLE, ValuationQuiz.position(emptyMap()))
    }

    @Test fun bandIsAThirdOfTheRange() {
        val b = ValuationQuiz.band(3_000_000.0, 6_000_000.0, Position.MIDDLE)
        assertEquals(4_000_000.0, b.from, 0.5)
        assertEquals(5_000_000.0, b.to, 0.5)
    }

    @Test fun step1NeedsMileageUnlessBrandNew() {
        assertFalse(ValuationQuiz.step1Valid(null, "1000"))
        assertFalse(ValuationQuiz.step1Valid(Registration.USED, ""))
        assertTrue(ValuationQuiz.step1Valid(Registration.USED, "65,000"))
        assertTrue(ValuationQuiz.step1Valid(Registration.BRAND_NEW, ""))
        assertEquals(65000, ValuationQuiz.mileageKm(Registration.USED, "65,000"))
    }

    @Test fun progressMovesThroughQuestions() {
        assertEquals(0f, ValuationQuiz.progress(0, 0), 0.001f)
        assertTrue(ValuationQuiz.progress(2, 4) > ValuationQuiz.progress(2, 0))
        assertEquals(1f, ValuationQuiz.progress(3, 0), 0.001f)
    }
}
