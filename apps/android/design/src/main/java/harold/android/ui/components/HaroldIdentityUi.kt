package harold.android.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import harold.android.design.R
import harold.android.ui.theme.Amber
import harold.android.ui.theme.Lime
import harold.android.ui.theme.LimeInk
import harold.android.ui.theme.Sky
import harold.android.ui.theme.Violet

data class HaroldColorOption(
    val id: String,
    val label: String,
    val containerColor: Color,
    val contentColor: Color = LimeInk,
)

data class HaroldIconOption(
    val id: String,
    val label: String,
    @DrawableRes val drawableRes: Int,
)

val haroldColorPalette: List<HaroldColorOption> = listOf(
    HaroldColorOption(
        id = "ink",
        label = "Violet",
        containerColor = Violet,
        contentColor = LimeInk,
    ),
    HaroldColorOption(
        id = "tide",
        label = "Tide",
        containerColor = Sky,
        contentColor = LimeInk,
    ),
    HaroldColorOption(
        id = "ember",
        label = "Ember",
        containerColor = Color(0xFFFF8659),
        contentColor = LimeInk,
    ),
    HaroldColorOption(
        id = "leaf",
        label = "Lime",
        containerColor = Lime,
        contentColor = LimeInk,
    ),
    HaroldColorOption(
        id = "amber",
        label = "Amber",
        containerColor = Amber,
        contentColor = LimeInk,
    ),
    HaroldColorOption(
        id = "rose",
        label = "Rose",
        containerColor = Color(0xFFF472B6),
        contentColor = LimeInk,
    ),
)

val haroldIconCatalog: List<HaroldIconOption> = listOf(
    HaroldIconOption(
        id = "mark",
        label = "Harold mark",
        drawableRes = R.drawable.ic_harold_glyph_mark,
    ),
    HaroldIconOption(
        id = "bolt",
        label = "Bolt",
        drawableRes = R.drawable.ic_harold_glyph_bolt,
    ),
    HaroldIconOption(
        id = "home",
        label = "Home",
        drawableRes = R.drawable.ic_harold_glyph_home,
    ),
    HaroldIconOption(
        id = "cloud",
        label = "Cloud",
        drawableRes = R.drawable.ic_harold_glyph_cloud,
    ),
    HaroldIconOption(
        id = "terminal",
        label = "Terminal",
        drawableRes = R.drawable.ic_harold_glyph_terminal,
    ),
    HaroldIconOption(
        id = "server",
        label = "Server",
        drawableRes = R.drawable.ic_harold_glyph_server,
    ),
)

fun haroldColorOption(colorId: String): HaroldColorOption =
    haroldColorPalette.firstOrNull { option -> option.id == colorId } ?: haroldColorPalette.first()

fun haroldIconOption(iconId: String): HaroldIconOption =
    haroldIconCatalog.firstOrNull { option -> option.id == iconId } ?: haroldIconCatalog.first()

@Composable
fun HaroldBadge(
    colorId: String,
    iconId: String,
    modifier: Modifier = Modifier,
    size: Dp = 24.dp,
    contentDescription: String? = null,
) {
    val color = haroldColorOption(colorId)
    val icon = haroldIconOption(iconId)
    val cornerRadius = (size.value * 0.28f).dp
    val glyphSize = (size.value * 0.62f).dp

    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(cornerRadius))
            .background(color.containerColor)
            .then(
                if (contentDescription != null) {
                    Modifier.semantics {
                        this.contentDescription = contentDescription
                    }
                } else {
                    Modifier
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painter = painterResource(icon.drawableRes),
            contentDescription = null,
            tint = color.contentColor,
            modifier = Modifier.size(glyphSize),
        )
    }
}

@Composable
fun HaroldAppearanceEditor(
    name: String,
    colorId: String,
    iconId: String,
    onNameChanged: (String) -> Unit,
    onColorSelected: (String) -> Unit,
    onIconSelected: (String) -> Unit,
    nameLabel: String,
    colorLabel: String,
    iconLabel: String,
    nameFieldTag: String,
    colorTagPrefix: String,
    iconTagPrefix: String,
    modifier: Modifier = Modifier,
    endpointSubtitle: String? = null,
) {
    val activeColor = haroldColorOption(colorId)

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.surfaceContainer,
            modifier = Modifier
                .fillMaxWidth()
                .border(
                    width = 1.dp,
                    color = activeColor.containerColor.copy(alpha = 0.35f),
                    shape = RoundedCornerShape(14.dp),
                ),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                HaroldBadge(
                    colorId = colorId,
                    iconId = iconId,
                    size = 44.dp,
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = name.ifBlank { "Harold" },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (!endpointSubtitle.isNullOrBlank()) {
                        Text(
                            text = endpointSubtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }

        OutlinedTextField(
            value = name,
            onValueChange = onNameChanged,
            modifier = Modifier
                .fillMaxWidth()
                .testTag(nameFieldTag),
            label = { Text(text = nameLabel) },
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
        )

        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                text = colorLabel,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                haroldColorPalette.forEach { option ->
                    val isSelected = option.id == colorId
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .then(
                                if (isSelected) {
                                    Modifier.border(
                                        width = 2.dp,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        shape = CircleShape,
                                    )
                                } else {
                                    Modifier
                                },
                            )
                            .clickable { onColorSelected(option.id) }
                            .padding(if (isSelected) 4.dp else 2.dp)
                            .testTag("$colorTagPrefix${option.id}")
                            .semantics {
                                role = Role.RadioButton
                                selected = isSelected
                                contentDescription = option.label
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(if (isSelected) 36.dp else 40.dp)
                                .clip(CircleShape)
                                .background(option.containerColor),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (isSelected) {
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = null,
                                    tint = option.contentColor,
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                text = iconLabel,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                haroldIconCatalog.forEach { option ->
                    val isSelected = option.id == iconId
                    val tileShape = RoundedCornerShape(12.dp)
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                            .clip(tileShape)
                            .background(
                                if (isSelected) {
                                    activeColor.containerColor.copy(alpha = 0.18f)
                                } else {
                                    MaterialTheme.colorScheme.surfaceContainerHigh
                                },
                            )
                            .border(
                                width = if (isSelected) 2.dp else 1.dp,
                                color = if (isSelected) {
                                    activeColor.containerColor
                                } else {
                                    MaterialTheme.colorScheme.outline
                                },
                                shape = tileShape,
                            )
                            .clickable { onIconSelected(option.id) }
                            .testTag("$iconTagPrefix${option.id}")
                            .semantics {
                                role = Role.RadioButton
                                selected = isSelected
                                contentDescription = option.label
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            painter = painterResource(option.drawableRes),
                            contentDescription = null,
                            tint = if (isSelected) {
                                activeColor.containerColor
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }
            }
        }
    }
}
