package lk.motormila.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.R
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurface

/**
 * Searchable make combobox — web `Combobox` parity for the make filter.
 * Text field filters the option list; the dropdown is a [LazyColumn] with an
 * "All makes" reset row. Keeps the [FilterSheet] `ListingQuery` contract:
 * [onSelect] emits the chosen make (or null to clear).
 */
@Composable
fun MakeCombobox(
    options: List<String>,
    selected: String?,
    onSelect: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val filtered = remember(query, options) {
        val q = query.trim()
        if (q.isEmpty()) options else options.filter { it.contains(q, ignoreCase = true) }
    }
    val allMakes = stringResource(R.string.filter_all_makes)

    Column(modifier = modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = if (expanded) query else (selected ?: ""),
            onValueChange = {
                query = it
                expanded = true
            },
            label = { Text(stringResource(R.string.filter_make_label)) },
            placeholder = { Text(stringResource(R.string.filter_make_search_hint)) },
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
            modifier = Modifier.fillMaxWidth(),
        )

        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(),
            exit = shrinkVertically(),
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp)
                    .heightIn(max = 264.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(MotormilaSurface)
                    .border(0.5.dp, MotormilaOutline, RoundedCornerShape(16.dp)),
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
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
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
