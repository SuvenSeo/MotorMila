package lk.motormila.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.R
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurface
import lk.motormila.app.ui.theme.applePress

/**
 * Searchable make combobox — web `Combobox` parity for the make filter.
 * Text field filters the option list; the dropdown is a [LazyColumn] with an
 * "All makes" reset row. Keeps the [FilterSheet] `ListingQuery` contract:
 * [onSelect] emits the chosen make (or null to clear).
 */
/**
 * Best option for a typed query when the user presses Done instead of tapping a row:
 * exact (case-insensitive) match, else the only/first option that starts with the query,
 * else the first that contains it. With no option list at all (models not loaded yet)
 * the trimmed free text is committed so the filter is never silently dropped.
 */
internal fun resolveComboboxQuery(query: String, options: List<String>): String? {
    val q = query.trim()
    if (q.isEmpty()) return null
    options.firstOrNull { it.equals(q, ignoreCase = true) }?.let { return it }
    options.firstOrNull { it.startsWith(q, ignoreCase = true) }?.let { return it }
    options.firstOrNull { it.contains(q, ignoreCase = true) }?.let { return it }
    return if (options.isEmpty()) q else null
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun MakeCombobox(
    options: List<String>,
    selected: String?,
    onSelect: (String?) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    searchHint: String? = null,
    allLabel: String? = null,
    enabled: Boolean = true,
) {
    var expanded by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val filtered = remember(query, options) {
        val q = query.trim()
        if (q.isEmpty()) options else options.filter { it.contains(q, ignoreCase = true) }
    }
    val allMakes = allLabel ?: stringResource(R.string.filter_all_makes)
    val fieldLabel = label ?: stringResource(R.string.filter_make_label)
    val hint = searchHint ?: stringResource(R.string.filter_make_search_hint)
    val focusManager = LocalFocusManager.current
    val listInView = remember { BringIntoViewRequester() }
    // The sheet does not resize for the IME, so the option list opened under the
    // keyboard (S11): scroll it into view whenever it opens or the filter changes.
    LaunchedEffect(expanded, filtered.size) {
        if (expanded) {
            kotlinx.coroutines.delay(250)
            runCatching { listInView.bringIntoView() }
        }
    }
    val commitTyped: () -> Unit = {
        if (expanded) {
            resolveComboboxQuery(query, options)?.let(onSelect)
            query = ""
            expanded = false
        }
        focusManager.clearFocus()
    }

    Column(modifier = modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = if (expanded) query else (selected ?: ""),
            onValueChange = {
                query = it
                expanded = true
            },
            label = { Text(fieldLabel) },
            placeholder = { Text(hint, maxLines = 1) },
            enabled = enabled,
            leadingIcon = {
                Icon(Icons.Filled.Search, contentDescription = null, tint = MotormilaSecondaryText)
            },
            trailingIcon = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (selected != null) {
                        IconButton(onClick = {
                            onSelect(null)
                            query = ""
                            expanded = false
                        }) {
                            Icon(
                                Icons.Filled.Close,
                                contentDescription = allMakes,
                                tint = MotormilaSecondaryText,
                            )
                        }
                    }
                    IconButton(onClick = { expanded = !expanded }) {
                        Icon(
                            if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                            contentDescription = null,
                            tint = MotormilaSecondaryText,
                        )
                    }
                }
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { commitTyped() }, onSearch = { commitTyped() }, onGo = { commitTyped() }),
            modifier = Modifier.fillMaxWidth(),
        )

        AnimatedVisibility(
            visible = expanded && enabled,
            enter = expandVertically(),
            exit = shrinkVertically(),
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .bringIntoViewRequester(listInView)
                    .padding(top = 6.dp)
                    .heightIn(max = 264.dp)
                    .clip(MotormilaRadius.sm)
                    .background(MotormilaSurface)
                    .border(1.dp, MotormilaOutline, MotormilaRadius.sm),
            ) {
                item(key = "__all") {
                    ComboboxRow(
                        label = allMakes,
                        selected = selected == null,
                        onClick = {
                            onSelect(null)
                            query = ""
                            expanded = false
                        },
                    )
                }
                items(filtered, key = { it }) { make ->
                    ComboboxRow(
                        label = make,
                        selected = selected.equals(make, ignoreCase = true),
                        onClick = {
                            onSelect(make)
                            query = ""
                            expanded = false
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ComboboxRow(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val rowPress = remember { MutableInteractionSource() }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .applePress(rowPress)
            .clickable(interactionSource = rowPress, indication = null, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            fontSize = 14.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            color = if (selected) MotormilaPrimary else MotormilaOnSurface,
            modifier = Modifier.weight(1f),
        )
        if (selected) {
            Spacer(Modifier.width(8.dp))
            Icon(Icons.Filled.Check, contentDescription = null, tint = MotormilaPrimary)
        }
    }
}
