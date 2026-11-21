package lk.motormila.app.ui.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.R
import lk.motormila.app.ui.components.MOTORMILA_WORDMARK_ASPECT
import lk.motormila.app.ui.components.MmIconButton
import lk.motormila.app.ui.components.motormilaWordmarkRes
import lk.motormila.app.ui.navigation.Search
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.mmTappable

@Composable
fun HomeTopRow(onAlertsClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = MmColors.current
    Row(
        modifier.fillMaxWidth().padding(start = MmSpacing.gutter, end = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            painter = painterResource(motormilaWordmarkRes(c.isDark)),
            contentDescription = stringResource(R.string.v19_brand_name),
            contentScale = ContentScale.Fit,
            modifier = Modifier.width(136.dp).aspectRatio(MOTORMILA_WORDMARK_ASPECT),
        )
        Spacer(Modifier.weight(1f))
        // This names the market; it is not a location permission or a district filter.
        if (LocalDensity.current.fontScale < 1.45f) {
            Icon(Icons.Outlined.LocationOn, null, tint = c.textSecondary, modifier = Modifier.size(16.dp))
            Text(stringResource(R.string.showroom_market), color = c.textSecondary,
                style = MmType.current.bodyS, modifier = Modifier.padding(start = 4.dp, end = 4.dp))
        }
        MmIconButton(
            icon = Icons.Outlined.NotificationsNone,
            contentDescription = stringResource(R.string.mm_tools_alerts),
            onClick = onAlertsClick,
        )
    }
}

/** Deliberately authored arrival. Native text and controls, one separately produced editorial photo. */
@Composable
internal fun BuyerHomeIntroduction(onSearch: (Search) -> Unit) {
    val c = MmColors.current
    val t = MmType.current
    val large = LocalDensity.current.fontScale >= 1.45f
    val title = stringResource(if (large) R.string.showroom_headline_compact else R.string.showroom_headline)
    var draft by rememberSaveable { mutableStateOf("") }
    val focus = LocalFocusManager.current
    val submit: (ShowroomBody?) -> Unit = { body ->
        focus.clearFocus(force = true)
        onSearch(showroomSearch(draft, body))
    }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val wide = maxWidth >= 640.dp
        val scenic = !large && maxWidth >= 350.dp
        val portraitPhotoHeight = if (large) 122.dp else (maxWidth * 0.65f).coerceIn(176.dp, 275.dp)
        val headline = if (scenic) t.displayL.copy(fontSize = 48.sp, lineHeight = 50.sp, letterSpacing = (-1.15).sp)
            else t.displayM
        if (wide) {
            Column {
                Row(Modifier.fillMaxWidth().padding(start = 28.dp, top = 24.dp, end = 20.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(0.95f)) {
                        Text(title, style = headline, color = c.textPrimary,
                            modifier = Modifier.semantics { heading() })
                        Spacer(Modifier.height(26.dp))
                        ShowroomSearchField(draft, { draft = it }, { submit(null) })
                    }
                    ShowroomCar(Modifier.weight(1.05f).padding(start = 16.dp).heightIn(max = 377.dp))
                }
                BodyTypeRegister(Modifier.padding(start = 28.dp, end = 28.dp, top = 20.dp), pick = { submit(it) })
            }
        } else {
            Column {
                Text(title, style = headline, color = c.textPrimary,
                    modifier = Modifier.padding(start = MmSpacing.gutter, top = 10.dp, end = MmSpacing.gutter)
                        .semantics { heading() })
                Spacer(Modifier.height(if (large) 15.dp else 9.dp))
                val fieldInset = Modifier.padding(horizontal = MmSpacing.gutter)
                // At accessibility sizes, keep the task above the editorial photo.
                if (large) ShowroomSearchField(draft, { draft = it }, { submit(null) }, fieldInset)
                if (large) Spacer(Modifier.height(12.dp))
                ShowroomCar(Modifier.fillMaxWidth()
                    .padding(horizontal = if (c.isDark) 0.dp else MmSpacing.gutter)
                    .height(portraitPhotoHeight))
                if (!large) {
                    Spacer(Modifier.height(9.dp))
                    ShowroomSearchField(draft, { draft = it }, { submit(null) }, fieldInset)
                }
                BodyTypeRegister(Modifier.padding(start = MmSpacing.gutter, end = MmSpacing.gutter, top = 23.dp), pick = { submit(it) })
            }
        }
    }
}

@Composable
private fun ShowroomCar(modifier: Modifier) {
    val c = MmColors.current
    Box(modifier.clip(RoundedCornerShape(if (c.isDark) 0.dp else 12.dp)).background(c.background),
        contentAlignment = Alignment.Center) {
        Image(
            painterResource(R.drawable.night_showroom_car),
            contentDescription = null, // Editorial only; no vehicle identity or action to announce.
            contentScale = if (c.isDark) ContentScale.Fit else ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().aspectRatio(1024f / 632f),
        )
    }
}

@Composable
private fun ShowroomSearchField(draft: String, change: (String) -> Unit, submit: () -> Unit, modifier: Modifier = Modifier) {
    val c = MmColors.current
    val t = MmType.current
    val shape = RoundedCornerShape(12.dp)
    val hint = stringResource(R.string.showroom_query_hint)
    val large = LocalDensity.current.fontScale >= 1.45f
    val field: @Composable (Modifier) -> Unit = { inner ->
        BasicTextField(
            value = draft,
            onValueChange = { if (it.length <= 160) change(it) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { submit() }),
            textStyle = t.bodyL.copy(color = c.textPrimary),
            cursorBrush = SolidColor(c.brandText),
            modifier = inner.heightIn(min = 48.dp).semantics { contentDescription = hint },
            decorationBox = { edit ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    Icon(Icons.Outlined.Search, null, tint = c.textSecondary, modifier = Modifier.size(20.dp))
                    Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                        if (draft.isEmpty()) Text(hint, style = t.bodyM, color = c.textSecondary)
                        edit()
                    }
                }
            },
        )
    }
    val button: @Composable (Modifier) -> Unit = { inner ->
        Button(onClick = submit, modifier = inner.heightIn(min = 48.dp), shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.buttonColors(containerColor = c.brand, contentColor = c.textOnBrand)) {
            Text(stringResource(R.string.scr_search_hint), style = t.label)
        }
    }
    val plate = modifier.fillMaxWidth().clip(shape).background(c.surfaceRaised).border(1.dp, c.outlineStrong, shape)
    if (large) {
        Column(plate.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            field(Modifier.fillMaxWidth().padding(horizontal = 4.dp))
            button(Modifier.fillMaxWidth())
        }
    } else {
        Row(plate.padding(start = 13.dp, end = 5.dp, top = 5.dp, bottom = 5.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            field(Modifier.weight(1f))
            button(Modifier)
        }
    }
}

/** Compact searchable register, not an invented supply count or categories that do not filter. */
@Composable
private fun BodyTypeRegister(modifier: Modifier, pick: (ShowroomBody) -> Unit) {
    val c = MmColors.current
    val t = MmType.current
    val large = LocalDensity.current.fontScale >= 1.55f
    Column(modifier.fillMaxWidth()) {
        Text(stringResource(R.string.showroom_body_title), style = t.titleL, color = c.textPrimary,
            modifier = Modifier.padding(bottom = 9.dp).semantics { heading() })
        val entries = listOf(
            Triple(ShowroomBody.HATCHBACK, R.string.showroom_hatchbacks, "Aqua, Swift"),
            Triple(ShowroomBody.SEDAN, R.string.showroom_sedans, "Axio, Premio"),
            Triple(ShowroomBody.SUV, R.string.showroom_suvs, "Vezel, X-Trail"),
            Triple(ShowroomBody.VAN, R.string.showroom_vans, "HiAce, Caravan"),
        )
        entries.chunked(if (large) 1 else 2).forEach { row ->
            HorizontalDivider(color = c.outlineStrong)
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEachIndexed { i, (type, name, examples) ->
                    if (i > 0) Box(Modifier.width(1.dp).fillMaxHeight().background(c.outline))
                    Row(Modifier.weight(1f).heightIn(min = 62.dp).clip(RoundedCornerShape(4.dp))
                        .mmTappable(role = Role.Button, onClick = { pick(type) }).padding(top = 7.dp, bottom = 7.dp, end = 5.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(stringResource(name), style = t.titleS, color = c.textPrimary)
                            Text(examples, style = t.bodyS, color = c.textSecondary)
                        }
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = c.textSecondary, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

/** Thin re-entry action, intentionally smaller than the saved vehicle proof above it. */
@Composable
internal fun BuyerHomeSearch(onClick: () -> Unit) {
    val c = MmColors.current
    Row(
        modifier = Modifier.padding(horizontal = MmSpacing.gutter).fillMaxWidth()
            .heightIn(min = 52.dp).clip(RoundedCornerShape(12.dp)).background(c.surfaceRaised)
            .border(1.dp, c.outlineStrong, RoundedCornerShape(12.dp))
            .mmTappable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(Icons.Outlined.Search, null, tint = c.brandText, modifier = Modifier.size(21.dp))
        Text(stringResource(R.string.buyer_home_search), style = MmType.current.titleS, color = c.textPrimary)
    }
}
