package lk.motormila.app.ui.chat

import lk.motormila.app.ui.theme.tabular
import androidx.compose.material3.LocalTextStyle
import lk.motormila.app.R
import androidx.compose.ui.res.stringResource
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import lk.motormila.app.domain.model.ChatMessage
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.ui.components.DealBadge
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.MotormilaBg
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPill
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBorder
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaPrimaryContainer
import lk.motormila.app.ui.theme.MotormilaPrimaryGlow
import lk.motormila.app.ui.theme.MotormilaPrimarySoft
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSheetShape
import lk.motormila.app.ui.theme.MotormilaSurface
import lk.motormila.app.ui.theme.MotormilaSurfaceHigh
import lk.motormila.app.ui.theme.MotormilaSurfaceHighest
import lk.motormila.app.ui.theme.applePress
import lk.motormila.app.ui.theme.pressSpring

val QUICK_PROMPTS = listOf(
    "Find practical cars under Rs. 8M",
    "Best deal opportunities right now",
    "Explain valuation confidence",
    "Help me negotiate asking price",
    "CBSL lease rules explained",
)

/**
 * Mobile AI Assistant ModalBottomSheet.
 * Ports the web platform's AIChatWidget into a modern mobile-native Jetpack Compose bottom sheet:
 * - Header with Bot/Sparkles icon, "Motormila AI Intelligence Assistant", subtitle, and close button.
 * - Contextual Quick Prompt Chips (horizontal scrolling row).
 * - Chat message feed with user speech bubbles and assistant responses styled with 16dp rounded glass cards,
 *   electric blue accents, and embedded vehicle recommendation cards.
 * - Input bar with text field and electric blue Send button.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AIChatBottomSheet(
    onDismissRequest: () -> Unit,
    onOpenListing: (Int) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AIChatViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val coroutineScope = rememberCoroutineScope()

    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        sheetState = sheetState,
        containerColor = MotormilaSurface,
        scrimColor = Color.Black.copy(alpha = if (lk.motormila.app.ui.theme.LegacyPalette.isDark) 0.72f else 0.4f),
        shape = MotormilaSheetShape,
        dragHandle = null,
        modifier = modifier
            .fillMaxHeight(0.92f)
            .semantics { contentDescription = "Motormila AI Intelligence Assistant Sheet" },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            // Sheet Header
            AIChatHeader(
                onClose = {
                    coroutineScope.launch { sheetState.hide() }
                    onDismissRequest()
                },
                onClear = { viewModel.onEvent(AIChatUiEvent.ClearChat) },
            )

            // Contextual Quick Prompt Chips (horizontal scrolling row)
            QuickPromptChipsRow(
                prompts = QUICK_PROMPTS,
                onPromptSelected = { prompt ->
                    viewModel.onEvent(AIChatUiEvent.SendMessage(prompt))
                },
            )

            OfflineBanner(visible = state.offline)

            // Send-failure row with live retry (the offline fallback reply stays in the feed).
            AnimatedVisibility(
                visible = state.lastError != null,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                ChatErrorRow(
                    message = if (state.signInRequired) stringResource(R.string.chat_sign_in_required) else state.lastError ?: "",
                    onRetry = { viewModel.onEvent(AIChatUiEvent.Retry) },
                    onDismiss = { viewModel.onEvent(AIChatUiEvent.DismissError) },
                )
            }

            // Message Feed
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
            ) {
                AIChatMessageFeed(
                    messages = state.messages,
                    isLoading = state.isLoading,
                    onPromptSelected = { prompt ->
                        viewModel.onEvent(AIChatUiEvent.SendMessage(prompt))
                    },
                    onOpenListing = { id ->
                        coroutineScope.launch { sheetState.hide() }
                        onOpenListing(id)
                    },
                )
            }

            // Bottom Input Bar
            AIChatInputBar(
                input = state.input,
                isLoading = state.isLoading,
                onInputChange = { text -> viewModel.onEvent(AIChatUiEvent.InputChanged(text)) },
                onSend = { text -> viewModel.onEvent(AIChatUiEvent.SendMessage(text)) },
            )
        }
    }
}

/** Header with Bot/Sparkles icon, Motormila AI Intelligence Assistant, subtitle, and close button. */
@Composable
private fun AIChatHeader(
    onClose: () -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MotormilaSurface)
            .border(width = 0.5.dp, color = MotormilaOutline)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        // Subtle drag pill
        Box(
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .width(36.dp)
                .height(4.dp)
                .clip(MotormilaRadius.pill)
                .background(lk.motormila.app.ui.theme.MotormilaSecondaryText.copy(alpha = 0.35f)),
        )

        Spacer(Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Electric blue glowing icon avatar
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(MotormilaPrimaryContainer)
                        .border(1.dp, Color(0x663D94FF), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.AutoAwesome,
                        contentDescription = null,
                        tint = MotormilaPrimaryBright,
                        modifier = Modifier.size(22.dp),
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "Motormila AI Intelligence Assistant",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = MotormilaOnSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = stringResource(R.string.chat_subtitle),
                        fontSize = 11.sp,
                        color = MotormilaSecondaryText,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(
                    onClick = onClose,
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(MotormilaSurfaceHigh)
                        .border(1.dp, MotormilaOutline, CircleShape),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = "Close AI Assistant",
                        tint = MotormilaOnSurface,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}

/** Send-failure row: fallback reply stays in the feed; this offers a live retry. */
@Composable
private fun ChatErrorRow(
    message: String,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(MotormilaSurfaceHigh)
            .border(width = 0.5.dp, color = MotormilaOutline)
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .semantics { contentDescription = "Chat send failed: $message" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = message,
            fontSize = 12.sp,
            color = MotormilaSecondaryText,
            modifier = Modifier.weight(1f),
        )
        TextButton(
            shape = androidx.compose.foundation.shape.CircleShape,
            onClick = onRetry,
            modifier = Modifier.heightIn(min = 48.dp),
        ) { Text(stringResource(R.string.ui_chat_retry)) }
        IconButton(
            onClick = onDismiss,
            modifier = Modifier.size(48.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = "Dismiss chat error",
                tint = MotormilaSecondaryText,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/** Horizontal scrolling row of Contextual Quick Prompt Chips. */
@Composable
private fun QuickPromptChipsRow(
    prompts: List<String>,
    onPromptSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(MotormilaBg)
            .border(width = 0.5.dp, color = MotormilaOutline)
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        prompts.forEach { prompt ->
            val interaction = remember { MutableInteractionSource() }

            Row(
                modifier = Modifier
                    .applePress(interaction)
                    .clip(MotormilaPill)
                    .background(MotormilaPrimarySoft)
                    .border(1.dp, MotormilaPrimaryBorder, MotormilaPill)
                    .clickable(
                        interactionSource = interaction,
                        indication = null,
                        onClick = { onPromptSelected(prompt) },
                    )
                    .heightIn(min = 48.dp)
                    .padding(horizontal = 12.dp, vertical = 7.dp)
                    .semantics { contentDescription = "Ask: $prompt" },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = null,
                    tint = MotormilaPrimaryBright,
                    modifier = Modifier.size(12.dp),
                )
                Text(
                    text = prompt,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MotormilaOnSurface,
                )
            }
        }
    }
}

/** Scrollable message feed supporting user bubbles, assistant glass cards, and embedded listing cards. */
@Composable
private fun AIChatMessageFeed(
    messages: List<ChatMessage>,
    isLoading: Boolean,
    onPromptSelected: (String) -> Unit,
    onOpenListing: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()

    LaunchedEffect(messages.size, isLoading) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    if (messages.isEmpty()) {
        // Welcome glass state
        Box(
            modifier = modifier
                .fillMaxSize()
                .padding(20.dp),
            contentAlignment = Alignment.TopCenter,
        ) {
            WelcomeGlassCard(onPromptSelected = onPromptSelected)
        }
    } else {
        LazyColumn(
            state = listState,
            modifier = modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            items(messages) { message ->
                if (message.role == "user") {
                    UserSpeechBubble(content = message.content)
                } else {
                    AssistantSpeechBubble(
                        message = message,
                        onOpenListing = onOpenListing,
                    )
                }
            }

            if (isLoading) {
                item {
                    LoadingThinkingIndicator()
                }
            }
        }
    }
}

/** Welcome intro card when chat is empty. */
@Composable
private fun WelcomeGlassCard(
    onPromptSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(MotormilaRadius.lg)
            .background(MotormilaSurfaceHigh)
            .border(1.dp, MotormilaOutline, MotormilaRadius.lg)
            .padding(18.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = MotormilaPrimaryBright,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = "MOTORMILA MARKET COPILOT",
                fontSize = 11.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 1.sp,
                color = MotormilaPrimaryBright,
            )
        }

        Spacer(Modifier.height(10.dp))

        Text(
            text = stringResource(R.string.chat_hero_title),
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = MotormilaOnSurface,
            lineHeight = 24.sp,
        )

        Spacer(Modifier.height(6.dp))

        Text(
            text = stringResource(R.string.chat_hero_body),
            fontSize = 13.sp,
            color = MotormilaSecondaryText,
            lineHeight = 18.sp,
        )

        Spacer(Modifier.height(16.dp))

        Text(
            text = stringResource(R.string.chat_popular),
            fontSize = 10.5.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.8.sp,
            color = lk.motormila.app.ui.theme.MotormilaSecondaryText,
        )

        Spacer(Modifier.height(8.dp))

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            QUICK_PROMPTS.take(3).forEach { prompt ->
                val promptInteraction = remember { MutableInteractionSource() }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .applePress(promptInteraction)
                        .clip(MotormilaRadius.lg)
                        .background(MotormilaBg)
                        .border(1.dp, MotormilaOutline, MotormilaRadius.lg)
                        .clickable(
                            interactionSource = promptInteraction,
                            indication = null,
                            onClick = { onPromptSelected(prompt) },
                        )
                        .heightIn(min = 48.dp)
                        .padding(horizontal = 12.dp, vertical = 9.dp)
                        .semantics { contentDescription = "Ask: $prompt" },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = prompt,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = MotormilaOnSurface,
                    )
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = null,
                        tint = MotormilaPrimaryBright,
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
        }
    }
}

/** User speech bubble aligned to End with electric blue styling. */
@Composable
private fun UserSpeechBubble(
    content: String,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxWidth(),
        contentAlignment = Alignment.CenterEnd,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.85f)
                .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp, bottomStart = 16.dp, bottomEnd = 4.dp))
                .background(MotormilaPrimaryContainer)
                .border(1.dp, Color(0x660A7AFF), RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp, bottomStart = 16.dp, bottomEnd = 4.dp))
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            Text(
                text = content,
                fontSize = 14.sp,
                fontWeight = FontWeight.Normal,
                color = MotormilaOnSurface,
                lineHeight = 20.sp,
            )
        }
    }
}

/** Assistant speech bubble aligned to Start with 16dp rounded glass card and optional vehicle cards. */
@Composable
private fun AssistantSpeechBubble(
    message: ChatMessage,
    onOpenListing: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val clipboardManager = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }

    LaunchedEffect(copied) {
        if (copied) {
            delay(1500)
            copied = false
        }
    }

    Box(
        modifier = modifier.fillMaxWidth(),
        contentAlignment = Alignment.CenterStart,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(0.92f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // Glass bubble
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp, bottomStart = 4.dp, bottomEnd = 16.dp))
                    .background(MotormilaSurfaceHigh)
                    .border(1.dp, MotormilaOutline, RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp, bottomStart = 4.dp, bottomEnd = 16.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    // Bot badge header
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(20.dp)
                                .clip(CircleShape)
                                .background(MotormilaPrimaryContainer),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.AutoAwesome,
                                contentDescription = null,
                                tint = MotormilaPrimaryBright,
                                modifier = Modifier.size(11.dp),
                            )
                        }
                        Text(
                            text = "Motormila Copilot",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = MotormilaPrimaryBright,
                        )
                    }

                    // Formatted content
                    FormattedMessageText(content = message.content)
                }
            }

            // Embedded Vehicle Recommendation Cards
            if (message.listings.isNotEmpty()) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = stringResource(R.string.chat_recommended),
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.8.sp,
                        color = MotormilaPrimaryBright,
                        modifier = Modifier.padding(start = 4.dp),
                    )
                    message.listings.take(3).forEach { listing ->
                        EmbeddedVehicleCard(
                            listing = listing,
                            onClick = { onOpenListing(listing.id) },
                        )
                    }
                }
            }

            // Copy action button
            val copyInteraction = remember { MutableInteractionSource() }
            Row(
                modifier = Modifier
                    .applePress(copyInteraction)
                    .clip(MotormilaRadius.lg)
                    .clickable(
                        interactionSource = copyInteraction,
                        indication = null,
                        onClick = {
                            clipboardManager.setText(AnnotatedString(message.content))
                            copied = true
                        },
                    )
                    .padding(horizontal = 6.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(
                    imageVector = if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                    contentDescription = "Copy message",
                    tint = if (copied) MotormilaPrimaryBright else MotormilaSecondaryText,
                    modifier = Modifier.size(12.dp),
                )
                Text(
                    text = if (copied) "Copied" else "Copy",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    color = if (copied) MotormilaPrimaryBright else MotormilaSecondaryText,
                )
            }
        }
    }
}

/** Formatted text renderer for assistant responses (handles bullet points & paragraphs). */
@Composable
private fun FormattedMessageText(content: String) {
    val lines = content.split("\n")
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        lines.forEach { line ->
            val trimmed = line.trim()
            when {
                trimmed.isBlank() -> {
                    Spacer(Modifier.height(4.dp))
                }
                trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("* ") -> {
                    val bulletText = trimmed.substring(2).trim()
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Text(
                            text = "•",
                            color = MotormilaPrimaryBright,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = bulletText,
                            fontSize = 13.sp,
                            color = MotormilaOnSurface,
                            lineHeight = 18.sp,
                        )
                    }
                }
                else -> {
                    Text(
                        text = trimmed,
                        fontSize = 13.5.sp,
                        color = MotormilaOnSurface,
                        lineHeight = 19.sp,
                    )
                }
            }
        }
    }
}

/** Embedded Vehicle Recommendation Card styled with 16dp rounded glass card and electric blue accents. */
@Composable
private fun EmbeddedVehicleCard(
    listing: Listing,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .applePress(interaction)
            .clip(MotormilaRadius.lg)
            .background(MotormilaSurfaceHighest)
            .border(1.dp, MotormilaPrimaryGlow, MotormilaRadius.lg)
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .semantics { contentDescription = "Open ${listing.displayName}" }
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // Thumbnail photo
        Box(
            modifier = Modifier
                .size(68.dp)
                .clip(MotormilaRadius.lg)
                .background(MotormilaBg),
            contentAlignment = Alignment.Center,
        ) {
            if (!listing.heroImageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = listing.heroImageUrl,
                    contentDescription = listing.displayName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(
                    imageVector = Icons.Filled.DirectionsCar,
                    contentDescription = null,
                    tint = MotormilaSecondaryText,
                    modifier = Modifier.size(28.dp),
                )
            }
        }

        // Details
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = listing.displayName,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = MotormilaOnSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            Text(
                text = lk.motormila.app.ui.common.mn(listing.priceLkr),
                fontSize = 14.sp,
                style = LocalTextStyle.current.tabular(),
                fontWeight = FontWeight.Bold,
                color = MotormilaPrimaryBright,
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                val meta = listOfNotNull(
                    listing.year?.toString(),
                    listing.district?.takeIf { it.isNotBlank() },
                ).joinToString(" · ")
                if (meta.isNotBlank()) {
                    Text(
                        text = meta,
                        fontSize = 11.sp,
                        color = MotormilaSecondaryText,
                    )
                }

                if (listing.dealScore != null) {
                    DealBadge(band = listing.dealBand(), score = listing.dealScore)
                }
            }
        }

        // Open Button
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(MotormilaPrimaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = "Open Listing",
                tint = MotormilaPrimaryBright,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

/** Loading thinking indicator. */
@Composable
private fun LoadingThinkingIndicator(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .clip(MotormilaRadius.lg)
            .background(MotormilaPrimarySoft)
            .border(1.dp, Color(0x440A7AFF), MotormilaRadius.lg)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CircularProgressIndicator(
            strokeWidth = 2.dp,
            color = MotormilaPrimaryBright,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = stringResource(R.string.chat_thinking),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = MotormilaPrimaryBright,
        )
    }
}

/** Input bar with text field and electric blue Send button. */
@Composable
private fun AIChatInputBar(
    input: String,
    isLoading: Boolean,
    onInputChange: (String) -> Unit,
    onSend: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val canSend = input.isNotBlank() && !isLoading

    val sendInteraction = remember { MutableInteractionSource() }
    val sendPressed by sendInteraction.collectIsPressedAsState()
    val sendScale by animateFloatAsState(
        targetValue = if (sendPressed && canSend) 0.90f else 1.0f,
        animationSpec = pressSpring(),
        label = "send-press",
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MotormilaSurface)
            .border(width = 0.5.dp, color = MotormilaOutline)
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = onInputChange,
                placeholder = {
                    Text(
                        text = stringResource(R.string.chat_input_hint),
                        fontSize = 13.5.sp,
                        color = lk.motormila.app.ui.theme.MotormilaSecondaryText,
                    )
                },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(
                    onSend = {
                        if (canSend) onSend(input)
                    },
                ),
                maxLines = 3,
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MotormilaBg,
                    unfocusedContainerColor = MotormilaBg,
                    focusedTextColor = MotormilaOnSurface,
                    unfocusedTextColor = MotormilaOnSurface,
                    focusedIndicatorColor = MotormilaPrimary,
                    unfocusedIndicatorColor = MotormilaOutline,
                    cursorColor = MotormilaPrimaryBright,
                ),
                shape = MotormilaRadius.lg,
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Chat input text field" },
            )

            // Electric blue Send button
            IconButton(
                onClick = { if (canSend) onSend(input) },
                enabled = canSend,
                interactionSource = sendInteraction,
                modifier = Modifier
                    .size(48.dp)
                    .scale(sendScale)
                    .clip(CircleShape)
                    .background(if (canSend) MotormilaPrimary else MotormilaSurfaceHigh)
                    .border(
                        1.dp,
                        if (canSend) Color(0x663D94FF) else MotormilaOutline,
                        CircleShape,
                    ),
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Send,
                    contentDescription = "Send Message",
                    tint = if (canSend) Color.White else lk.motormila.app.ui.theme.MotormilaSecondaryText,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}
