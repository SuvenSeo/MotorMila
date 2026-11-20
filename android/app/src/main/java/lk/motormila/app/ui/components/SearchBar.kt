package lk.motormila.app.ui.components

import lk.motormila.app.R
import androidx.compose.ui.res.stringResource
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MotormilaPill
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.applePress

/**
 * Docked search field + suggestions dropdown + voice slot + recent searches.
 * Stateless: parent owns [query] and callbacks.
 */
@Composable
fun SearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onSearch: (String) -> Unit,
    suggestions: List<Listing>,
    recentSearches: List<String>,
    onSuggestionClick: (Listing) -> Unit,
    onRecentClick: (String) -> Unit,
    onVoiceClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
    showDropdown: Boolean = true,
    /** Per-row remove in the recent-searches list (null hides the affordance). */
    onRecentRemove: ((String) -> Unit)? = null,
    /** Clear-history action above the recent-searches list (null hides it). */
    onClearRecents: (() -> Unit)? = null,
) {
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    // The dropdown belongs to typing: shown only while the field has focus, so
    // results opened from a deep link / Home (or after submitting) stay visible.
    var focused by remember { mutableStateOf(false) }
    val submit: (String) -> Unit = { q ->
        onSearch(q)
        keyboard?.hide()
        focusManager.clearFocus()
    }
    val vehicleSearchCd = stringResource(R.string.mm_vehicle_search_cd)
    Column(modifier = modifier.semantics { contentDescription = vehicleSearchCd }) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { submit(query) }, onDone = { submit(query) }),
            shape = MotormilaPill,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                Row {
                    if (query.isNotBlank()) {
                        IconButton(
                            onClick = { onQueryChange("") },
                            modifier = Modifier.size(48.dp),
                        ) {
                            Icon(Icons.Filled.Clear, contentDescription = stringResource(R.string.v19_search_clear_cd))
                        }
                    }
                    if (onVoiceClick != null) {
                        IconButton(
                            onClick = onVoiceClick,
                            modifier = Modifier.size(48.dp),
                        ) {
                            Icon(Icons.Filled.Mic, contentDescription = stringResource(R.string.mm_voice_search_cd))
                        }
                    }
                }
            },
            placeholder = {
                Text(
                    stringResource(R.string.ui_components_search_make_model_e_g),
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
            },
            modifier = Modifier
                .fillMaxWidth()
                .onFocusChanged { focused = it.isFocused },
        )
        if (showDropdown && focused && (query.isNotBlank() || recentSearches.isNotEmpty())) {
            MotormilaGlass(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                specular = true,
            ) {
                LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp)) {
                    if (query.isNotBlank()) {
                        // Pinned commit row: results also update live (debounced),
                        // but an explicit "Search for …" is always one tap away.
                        item(key = "__search_for") {
                            val searchPress = remember { MutableInteractionSource() }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .applePress(searchPress)
                                    .heightIn(min = 48.dp)
                                    .clickable(
                                        interactionSource = searchPress,
                                        indication = null,
                                        role = Role.Button,
                                        onClick = { submit(query) },
                                    )
                                    .padding(horizontal = 16.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Filled.Search, contentDescription = null, tint = MotormilaSecondaryText)
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    stringResource(R.string.v19_search_for_query, query.trim()),
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                        items(suggestions, key = { it.id }) { s ->
                            val suggestPress = remember { MutableInteractionSource() }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .applePress(suggestPress)
                                    .heightIn(min = 48.dp)
                                    .clickable(
                                        interactionSource = suggestPress,
                                        indication = null,
                                        onClick = { keyboard?.hide(); focusManager.clearFocus(); onSuggestionClick(s) },
                                    )
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                AsyncImage(
                                    model = s.thumbnailUrl,
                                    contentDescription = null,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .size(44.dp)
                                        .clip(MotormilaRadius.lg),
                                )
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text("${s.make} ${s.model} ${s.year ?: ""}".trim(), fontSize = 14.sp)
                                    Text(
                                        s.formattedPrice(),
                                        fontSize = 12.sp,
                                        color = MotormilaSecondaryText,
                                    )
                                }
                            }
                        }
                    } else {
                        // Recent searches: persisted, per-row remove + clear history.
                        item(key = "__recents_header") {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(start = 16.dp, end = 8.dp, top = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    stringResource(R.string.v19_search_recent_title),
                                    fontSize = 12.sp,
                                    color = MotormilaSecondaryText,
                                    modifier = Modifier.weight(1f),
                                )
                                if (onClearRecents != null) {
                                    Box(
                                        Modifier
                                            .heightIn(min = 48.dp)
                                            .clip(MotormilaRadius.pill)
                                            .clickable(role = Role.Button, onClick = onClearRecents)
                                            .padding(horizontal = 10.dp),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text(
                                            stringResource(R.string.v19_search_clear_history),
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = MmColors.current.brandText,
                                            maxLines = 1,
                                        )
                                    }
                                }
                            }
                        }
                        items(recentSearches.take(5), key = { it }) { recent ->
                            val recentPress = remember { MutableInteractionSource() }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .applePress(recentPress)
                                    .heightIn(min = 48.dp)
                                    .clickable(
                                        interactionSource = recentPress,
                                        indication = null,
                                        onClick = { onRecentClick(recent); keyboard?.hide(); focusManager.clearFocus() },
                                    )
                                    .padding(start = 16.dp, end = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Filled.History, contentDescription = null, tint = MotormilaSecondaryText)
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    recent,
                                    fontSize = 14.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f),
                                )
                                if (onRecentRemove != null) {
                                    IconButton(
                                        onClick = { onRecentRemove(recent) },
                                        modifier = Modifier.size(48.dp),
                                    ) {
                                        Icon(
                                            Icons.Filled.Close,
                                            contentDescription = stringResource(R.string.v19_search_remove_recent_cd, recent),
                                            tint = MotormilaSecondaryText,
                                            modifier = Modifier.size(18.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
