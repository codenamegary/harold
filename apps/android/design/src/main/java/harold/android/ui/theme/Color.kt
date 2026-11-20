package harold.android.ui.theme

import androidx.compose.ui.graphics.Color

// Brand tokens from apps/web/src/index.css @theme

val Lime = Color(0xFFB6F36B)
val LimeHover = Color(0xFFC2FF78)
val LimeInk = Color(0xFF10150C)

val Ink = Color(0xFF080A0D)
val Panel = Color(0xFF0E1117)
val Panel2 = Color(0xFF12161D)
val PanelElevated = Color(0xFF181D25)

val Body = Color(0xFFC4CAD3)
val Muted = Color(0xFF8C96A5)
val Dim = Color(0xFF5D6674)

val Line = Color(0xFF242A35)
val LineSoft = Color(0xFF1A1F28)
val LineInput = Color(0xFF2E3540)

val Violet = Color(0xFF9D8CFF)
val VioletSoft = Color(0xFFC0B6FF)
val Sky = Color(0xFF7CC9F2)
val Danger = Color(0xFFFF756D)
val Amber = Color(0xFFF4BC5F)

// Light-mode companions. Bright brand accents stay reserved for fills. These
// darker accents are the foreground colors that have to clear contrast on the
// light surfaces.
val LightBackground = Color(0xFFF5F6F8)
val LightSurface = Color(0xFFFFFFFF)
val LightPanel2 = Color(0xFFEEF0F4)
val LightSurfaceVariant = Color(0xFFE8EBF0)
val LightOnSurface = Color(0xFF12151A)
val LightOnSurfaceVariant = Color(0xFF5D6674)
val LightOutline = Color(0xFF7D8592)
val LightOutlineVariant = Color(0xFFD9DDE4)
val LightPrimary = Color(0xFF2E5A00)
val LightOnPrimary = Color(0xFFFFFFFF)
val LightPrimaryContainer = Color(0xFFD9F9A8)
val LightSecondary = Color(0xFF5B45C7)
val LightOnSecondary = Color(0xFFFFFFFF)
val LightSecondaryContainer = Color(0xFFE6E0FF)
val LightTertiary = Color(0xFF7A4F00)
val LightOnTertiary = Color(0xFFFFFFFF)
val LightTertiaryContainer = Color(0xFFFFE2A8)
val LightOnTertiaryContainer = Color(0xFF2A1A00)
val LightError = Color(0xFFB3261E)
val LightOnError = Color(0xFFFFFFFF)
val LightErrorContainer = Color(0xFFFFDAD6)
val LightOnErrorContainer = Color(0xFF410002)
val LightSkyAccent = Color(0xFF00688F)

// Diff surfaces. Additions borrow the lime brand, deletions use the danger red.
val DiffAdditionBackground = Color(0xFF10251A)
val DiffAdditionText = Color(0xFF8BE28B)
val DiffDeletionBackground = Color(0xFF2B1416)
val DiffDeletionText = Color(0xFFFF9B95)
val LightDiffAdditionBackground = Color(0xFFE8F8E5)
val LightDiffAdditionText = Color(0xFF176B2C)
val LightDiffDeletionBackground = Color(0xFFFFEDEA)
val LightDiffDeletionText = Color(0xFF9B1C15)
