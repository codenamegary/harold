package harold.android.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ButtonElevation
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonColors
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

private val MIN_TOUCH_TARGET = 48.dp

enum class AgentButtonVariant {
    Primary,
    Secondary,
    Frosted,
    Ghost,
    Danger,
}

enum class AgentButtonSize(
    val minHeight: Dp,
    val horizontalPadding: Dp,
    val verticalPadding: Dp,
    val iconSpacing: Dp,
) {
    Small(minHeight = 36.dp, horizontalPadding = 14.dp, verticalPadding = 6.dp, iconSpacing = 6.dp),
    Medium(minHeight = 44.dp, horizontalPadding = 20.dp, verticalPadding = 10.dp, iconSpacing = 8.dp),
    Large(minHeight = 52.dp, horizontalPadding = 24.dp, verticalPadding = 14.dp, iconSpacing = 10.dp),
}

@Composable
fun AgentButtonColors(
    variant: AgentButtonVariant,
): ButtonColors = when (variant) {
    AgentButtonVariant.Primary -> ButtonDefaults.buttonColors(
        containerColor = MaterialTheme.colorScheme.primary,
        contentColor = MaterialTheme.colorScheme.onPrimary,
        disabledContainerColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
        disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
    )
    AgentButtonVariant.Secondary -> ButtonDefaults.buttonColors(
        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        contentColor = MaterialTheme.colorScheme.onSurface,
        disabledContainerColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
        disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
    )
    AgentButtonVariant.Frosted -> ButtonDefaults.buttonColors(
        containerColor = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.75f),
        contentColor = MaterialTheme.colorScheme.onSurface,
        disabledContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.35f),
        disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
    )
    AgentButtonVariant.Ghost -> ButtonDefaults.textButtonColors(
        containerColor = Color.Transparent,
        contentColor = MaterialTheme.colorScheme.onSurface,
        disabledContainerColor = Color.Transparent,
        disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
    )
    AgentButtonVariant.Danger -> ButtonDefaults.buttonColors(
        containerColor = MaterialTheme.colorScheme.error,
        contentColor = MaterialTheme.colorScheme.onError,
        disabledContainerColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
        disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
    )
}

@Composable
fun AgentButtonBorder(
    variant: AgentButtonVariant,
    enabled: Boolean,
): BorderStroke? = when (variant) {
    AgentButtonVariant.Frosted -> BorderStroke(
        width = 1.dp,
        color = if (enabled) {
            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.8f)
        } else {
            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f)
        },
    )
    AgentButtonVariant.Secondary -> BorderStroke(
        width = 1.dp,
        color = if (enabled) {
            MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
        } else {
            MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
        },
    )
    else -> null
}

@Composable
fun AgentButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: AgentButtonVariant = AgentButtonVariant.Primary,
    size: AgentButtonSize = AgentButtonSize.Medium,
    enabled: Boolean = true,
    shape: Shape = CircleShape,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    interactionSource: MutableInteractionSource = remember { MutableInteractionSource() },
    content: @Composable RowScope.() -> Unit,
) {
    val colors = AgentButtonColors(variant)
    val border = AgentButtonBorder(variant, enabled)
    val textStyle = when (size) {
        AgentButtonSize.Small -> MaterialTheme.typography.labelLarge
        AgentButtonSize.Medium -> MaterialTheme.typography.labelLarge
        AgentButtonSize.Large -> MaterialTheme.typography.titleMedium
    }

    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.defaultMinSize(minWidth = MIN_TOUCH_TARGET, minHeight = MIN_TOUCH_TARGET),
        shape = shape,
        colors = colors,
        border = border,
        contentPadding = PaddingValues(
            horizontal = size.horizontalPadding,
            vertical = size.verticalPadding,
        ),
        interactionSource = interactionSource,
    ) {
        ProvideTextStyle(textStyle) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                if (leadingIcon != null) {
                    leadingIcon()
                    Spacer(modifier = Modifier.width(size.iconSpacing))
                }
                content()
                if (trailingIcon != null) {
                    Spacer(modifier = Modifier.width(size.iconSpacing))
                    trailingIcon()
                }
            }
        }
    }
}

@Composable
fun AgentChip(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    variant: AgentButtonVariant = AgentButtonVariant.Frosted,
    size: AgentButtonSize = AgentButtonSize.Small,
    enabled: Boolean = true,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    content: (@Composable RowScope.() -> Unit)? = null,
) {
    AgentButton(
        onClick = onClick,
        modifier = modifier,
        variant = variant,
        size = size,
        enabled = enabled,
        shape = CircleShape,
        leadingIcon = leadingIcon,
        trailingIcon = trailingIcon,
    ) {
        if (content != null) {
            content()
        } else if (label != null) {
            Text(text = label)
        }
    }
}

@Composable
fun AgentIconButton(
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    variant: AgentButtonVariant = AgentButtonVariant.Ghost,
    enabled: Boolean = true,
    shape: Shape = CircleShape,
) {
    val colors = when (variant) {
        AgentButtonVariant.Primary -> IconButtonDefaults.iconButtonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            disabledContainerColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
            disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
        )
        AgentButtonVariant.Secondary,
        AgentButtonVariant.Frosted -> IconButtonDefaults.iconButtonColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.75f),
            contentColor = MaterialTheme.colorScheme.onSurface,
            disabledContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.35f),
            disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
        )
        AgentButtonVariant.Ghost -> IconButtonDefaults.iconButtonColors(
            containerColor = Color.Transparent,
            contentColor = MaterialTheme.colorScheme.onSurface,
            disabledContainerColor = Color.Transparent,
            disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
        )
        AgentButtonVariant.Danger -> IconButtonDefaults.iconButtonColors(
            containerColor = MaterialTheme.colorScheme.error,
            contentColor = MaterialTheme.colorScheme.onError,
            disabledContainerColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
            disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
        )
    }

    IconButton(
        onClick = onClick,
        enabled = enabled,
        colors = colors,
        modifier = modifier
            .defaultMinSize(minWidth = MIN_TOUCH_TARGET, minHeight = MIN_TOUCH_TARGET)
            .semantics {
                if (contentDescription != null) {
                    this.contentDescription = contentDescription
                }
            },
    ) {
        icon()
    }
}
