package harold.android.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class HaroldButtonVariant {
    Primary,
    Secondary,
    Ghost,
    Destructive,
}

enum class HaroldButtonSize {
    Small,
    Medium,
}

private val ButtonShape = RoundedCornerShape(14.dp)

@Composable
fun HaroldButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: HaroldButtonVariant = HaroldButtonVariant.Primary,
    size: HaroldButtonSize = HaroldButtonSize.Medium,
    enabled: Boolean = true,
    leadingIcon: (@Composable () -> Unit)? = null,
) {
    val minHeight = when (size) {
        HaroldButtonSize.Small -> 40.dp
        HaroldButtonSize.Medium -> 50.dp
    }
    val contentPadding = when (size) {
        HaroldButtonSize.Small -> PaddingValues(horizontal = 14.dp, vertical = 8.dp)
        HaroldButtonSize.Medium -> PaddingValues(horizontal = 20.dp, vertical = 12.dp)
    }
    val labelStyle = when (size) {
        HaroldButtonSize.Small -> MaterialTheme.typography.labelLarge.copy(
            fontWeight = FontWeight.SemiBold,
        )
        HaroldButtonSize.Medium -> MaterialTheme.typography.titleMedium.copy(
            fontSize = 16.sp,
            lineHeight = 22.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }

    val content: @Composable () -> Unit = {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            leadingIcon?.invoke()
            Text(
                text = text,
                style = labelStyle,
            )
        }
    }

    when (variant) {
        HaroldButtonVariant.Primary -> {
            Button(
                onClick = onClick,
                enabled = enabled,
                shape = ButtonShape,
                contentPadding = contentPadding,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ),
                modifier = modifier.defaultMinSize(minHeight = minHeight),
            ) {
                content()
            }
        }

        HaroldButtonVariant.Secondary -> {
            OutlinedButton(
                onClick = onClick,
                enabled = enabled,
                shape = ButtonShape,
                contentPadding = contentPadding,
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainer,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                ),
                border = BorderStroke(
                    width = 1.dp,
                    color = MaterialTheme.colorScheme.outline,
                ),
                modifier = modifier.defaultMinSize(minHeight = minHeight),
            ) {
                content()
            }
        }

        HaroldButtonVariant.Ghost -> {
            TextButton(
                onClick = onClick,
                enabled = enabled,
                shape = ButtonShape,
                contentPadding = contentPadding,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
                modifier = modifier.defaultMinSize(minHeight = minHeight),
            ) {
                content()
            }
        }

        HaroldButtonVariant.Destructive -> {
            TextButton(
                onClick = onClick,
                enabled = enabled,
                shape = ButtonShape,
                contentPadding = contentPadding,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = MaterialTheme.colorScheme.error,
                ),
                modifier = modifier.defaultMinSize(minHeight = minHeight),
            ) {
                content()
            }
        }
    }
}
