package lk.motormila.app.ui.components

import lk.motormila.app.R
import androidx.compose.ui.res.stringResource
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import lk.motormila.app.domain.model.Listing
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
) {
    Column(modifier = modifier.semantics { contentDescription = "Vehicle search" }) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            singleLine = true,
            shape = MotormilaPill,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                Row {
                    if (query.isNotBlank()) {
                        IconButton(
                            onClick = { onQueryChange("") },
                            modifier = Modifier.size(48.dp),
                        ) {
                            Icon(Icons.Filled.Clear, contentDescription = "Clear search")
                        }
                    }
                    if (onVoiceClick != null) {
                        IconButton(
                            onClick = onVoiceClick,
                            modifier = Modifier.size(48.dp),
                        ) {
                            Icon(Icons.Filled.Mic, contentDescription = "Voice search")
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
            modifier = Modifier.fillMaxWidth(),
        )
        if (showDropdown && (suggestions.isNotEmpty() || (query.isBlank() && recentSearches.isNotEmpty()))) {
            MotormilaGlass(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                specular = true,
            ) {
                LazyColumn(modifier = Modifier.fillMaxWidth()) {
                    if (query.isBlank()) {
                        items(recentSearches.take(5)) { recent ->
                            val recentPress = remember { MutableInteractionSource() }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .applePress(recentPress)
                                    .heightIn(min = 48.dp)
                                    .clickable(
                                        interactionSource = recentPress,
                                        indication = null,
                                        onClick = { onRecentClick(recent) },
                                    )
                                    .padding(horizontal = 16.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Filled.History, contentDescription = null, tint = MotormilaSecondaryText)
                                Spacer(Modifier.width(12.dp))
                                Text(recent, fontSize = 14.sp)
                            }
                        }
                    } else {
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
                                        onClick = { onSuggestionClick(s) },
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
                    }
                }
            }
        }
    }
}
